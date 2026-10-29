import { check, conflict, forbidden, notFound, unprocessable } from '../utils/httpError.js';
import { applySort, listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapAudit, mapResult, mapResultDetail } from '../utils/mappers.js';
import { evaluateResult, resolvePassMark } from '../utils/evaluation.js';
import { canPublish, canReturn, canSubmit, editMode, publishError } from '../utils/resultPolicy.js';
import { assertCanManageCourse, lecturerCourseIds } from './accessService.js';
import { getBands, getSettings } from './settingsService.js';

const RESULT_WITH_CONTEXT =
  '*, enrollment:enrollments!inner(id, course_id, academic_period_id, enrollment_status, course:courses(pass_mark))';

const sortMap = {
  updatedAt: 'updated_at',
  totalMark: 'total_mark',
  registrationNumber: 'registration_number',
  courseCode: 'course_code',
};

/** Runs the shared evaluation and converts validation failures into 422 responses. */
async function evaluate(db, marks, { coursePassMark, academicPeriodId }) {
  const [settings, scale] = await Promise.all([getSettings(db), getBands(db, academicPeriodId)]);
  try {
    const evaluation = evaluateResult(marks, {
      settings,
      passMark: resolvePassMark({ passMark: coursePassMark }, settings),
      bands: scale.bands,
    });
    return { settings, evaluation };
  } catch (err) {
    throw unprocessable(err.message, err.details);
  }
}

async function loadResult(db, id) {
  const { data } = check(await db.from('results').select(RESULT_WITH_CONTEXT).eq('id', id).maybeSingle());
  if (!data) throw notFound('Result not found.');
  return data;
}

// ------------------------------------------------------------------ queries
export async function list(db, user, q) {
  const { from, to } = pageRange(q);
  let query = db.from('result_details').select('*', { count: 'exact' });
  if (user.role === 'lecturer') {
    // Defence in depth on top of RLS: only courses this lecturer is assigned to.
    const ids = await lecturerCourseIds(db, user);
    if (!ids.length) return { data: [], meta: listMeta(q, 0) };
    query = query.in('course_id', ids);
  }
  const or = searchFilter(q.search, ['student_name', 'registration_number', 'course_code']);
  if (or) query = query.or(or);
  if (q.courseId) query = query.eq('course_id', q.courseId);
  if (q.academicPeriodId) query = query.eq('academic_period_id', q.academicPeriodId);
  if (q.publicationStatus) query = query.eq('publication_status', q.publicationStatus);
  if (q.resultStatus) query = query.eq('result_status', q.resultStatus);
  const { data, count } = check(await applySort(query, q, sortMap, { column: 'updated_at', ascending: false }).range(from, to));
  return { data: data.map(mapResultDetail), meta: listMeta(q, count) };
}

export async function get(db, user, id) {
  const { data } = check(await db.from('result_details').select('*').eq('id', id).maybeSingle());
  if (!data) throw notFound('Result not found.');
  await assertCanManageCourse(db, user, data.course_id, data.academic_period_id);
  return mapResultDetail(data);
}

export async function history(db, user, id) {
  await get(db, user, id); // access check
  const { data } = check(
    await db
      .from('audit_logs')
      .select('*, actor:profiles(full_name)')
      .eq('entity_type', 'results')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  );
  return data.map(mapAudit);
}

// ------------------------------------------------------------------ writes
export async function create(db, user, body) {
  const { data: enrollment } = check(
    await db
      .from('enrollments')
      .select('id, course_id, academic_period_id, enrollment_status, course:courses(pass_mark)')
      .eq('id', body.enrollmentId)
      .maybeSingle(),
  );
  if (!enrollment) throw notFound('Enrollment not found.');
  await assertCanManageCourse(db, user, enrollment.course_id, enrollment.academic_period_id);
  if (enrollment.enrollment_status === 'withdrawn') throw unprocessable('The student has withdrawn from this course.');

  const { evaluation } = await evaluate(db, body, {
    coursePassMark: enrollment.course?.pass_mark,
    academicPeriodId: enrollment.academic_period_id,
  });
  const { data } = check(
    await db
      .from('results')
      .insert({
        enrollment_id: enrollment.id,
        coursework_mark: body.courseworkMark,
        examination_mark: body.examinationMark,
        grade: evaluation.grade,
        grade_point: evaluation.gradePoint,
        result_status: evaluation.resultStatus,
      })
      .select('*')
      .single(),
    { conflictMessage: 'A result already exists for this enrollment. Reload and edit it instead.' },
  );
  return mapResult(data);
}

export async function update(db, user, id, body) {
  const current = await loadResult(db, id);
  const { enrollment } = current;
  await assertCanManageCourse(db, user, enrollment.course_id, enrollment.academic_period_id);

  const { settings, evaluation } = await evaluate(db, body, {
    coursePassMark: enrollment.course?.pass_mark,
    academicPeriodId: enrollment.academic_period_id,
  });
  const mode = editMode({ publicationStatus: current.publication_status, role: user.role, settings });
  if (mode === 'locked') {
    throw forbidden(
      current.publication_status === 'submitted'
        ? 'This result has been submitted and is locked until an administrator returns it.'
        : 'You are not authorised to change published results.',
    );
  }
  if (mode === 'correct' && !body.reason) {
    throw unprocessable('A reason is required to correct a published result.', [
      { path: 'reason', message: 'Explain why this published result is being corrected.' },
    ]);
  }
  if (current.version !== body.version) {
    throw conflict('This result was changed by someone else. Reload to see the latest values.', { currentVersion: current.version });
  }

  const patch = {
    coursework_mark: body.courseworkMark,
    examination_mark: body.examinationMark,
    grade: evaluation.grade,
    grade_point: evaluation.gradePoint,
    result_status: evaluation.resultStatus,
  };
  if (mode === 'correct') Object.assign(patch, { publication_status: 'corrected', correction_reason: body.reason });

  // Optimistic lock: only succeeds if nobody updated the row since it was read.
  const { data } = check(
    await db.from('results').update(patch).eq('id', id).eq('version', body.version).select('*').maybeSingle(),
  );
  if (!data) throw conflict('This result was changed by someone else. Reload to see the latest values.');
  return mapResult(data);
}

export async function publishOne(db, user, id) {
  const current = await loadResult(db, id);
  await assertCanManageCourse(db, user, current.enrollment.course_id, current.enrollment.academic_period_id);
  const settings = await getSettings(db);
  const problem = publishError({
    result: { resultStatus: current.result_status, publicationStatus: current.publication_status },
    role: user.role,
    settings,
  });
  if (problem) throw canPublish({ role: user.role, settings }) ? unprocessable(problem) : forbidden(problem);

  const { data } = check(
    await db
      .from('results')
      .update({ publication_status: 'published' })
      .eq('id', id)
      .eq('version', current.version)
      .select('*')
      .maybeSingle(),
  );
  if (!data) throw conflict('This result was changed by someone else. Reload and try again.');
  return mapResult(data);
}

/** Course-level workflow: 'submitted' | 'published' | 'draft' (return). Atomic via RPC. */
export async function transitionCourse(db, user, courseId, academicPeriodId, target) {
  await assertCanManageCourse(db, user, courseId, academicPeriodId);
  const settings = await getSettings(db);
  const allowed =
    target === 'published' ? canPublish({ role: user.role, settings })
      : target === 'submitted' ? canSubmit({ role: user.role })
        : canReturn({ role: user.role });
  if (!allowed) {
    throw forbidden(
      target === 'published'
        ? 'Publication is managed by administrators. Submit the results instead.'
        : 'You are not authorised to perform this action.',
    );
  }
  const { data } = check(
    await db.rpc('transition_course_results', { p_course_id: courseId, p_period_id: academicPeriodId, p_target: target }),
  );
  return { count: data ?? 0 };
}

// ------------------------------------------------------------------ students
/** The signed-in student's own published results. Student id comes from the session. */
export function myResults(db, user, q = {}) {
  return publishedResultsFor(db, user.studentId, q);
}

/** Published/corrected results of one student (callers must have checked access). */
export async function publishedResultsFor(db, studentId, { academicPeriodId } = {}) {
  let query = db
    .from('result_details')
    .select('*')
    .eq('student_id', studentId)
    .in('publication_status', ['published', 'corrected'])
    .order('start_date', { ascending: true })
    .order('course_code', { ascending: true });
  if (academicPeriodId) query = query.eq('academic_period_id', academicPeriodId);
  const { data } = check(await query);
  return data.map(mapResultDetail);
}
