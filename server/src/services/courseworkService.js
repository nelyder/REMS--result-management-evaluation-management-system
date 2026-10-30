// Coursework assignments and the students assigned to each one.
// Staff (admin, or a lecturer assigned to the course offering) manage them; students only
// read assignments they are assigned to. RLS and triggers enforce the same rules in Postgres.
import { check, notFound, unprocessable } from '../utils/httpError.js';
import { applySort, fetchAll, listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapAssignedStudent, mapCoursework, mapEligibleStudent } from '../utils/mappers.js';
import { assertCanManageCourse, lecturerCourseIds } from './accessService.js';

const sortMap = { dueAt: 'due_at', title: 'title', createdAt: 'created_at', courseCode: 'course_code' };

/** Loads an assignment and checks the caller may manage it. */
async function loadForStaff(db, user, id) {
  const { data } = check(
    await db.from('assignments').select('id, course_id, academic_period_id').eq('id', id).maybeSingle(),
  );
  if (!data) throw notFound('Assignment not found.');
  await assertCanManageCourse(db, user, data.course_id, data.academic_period_id);
  return data;
}

/** Non-withdrawn enrollments of a course offering (the students who may be assigned). */
function enrolledStudents(db, courseId, academicPeriodId) {
  return fetchAll(() =>
    db
      .from('enrollment_details')
      .select('id, student_id, enrollment_status, full_name, registration_number, programme_code, year_of_study')
      .eq('course_id', courseId)
      .eq('academic_period_id', academicPeriodId)
      .neq('enrollment_status', 'withdrawn')
      .order('registration_number'),
  );
}

/** Rejects (422) any student id that is not enrolled on the offering. */
async function assertEligible(db, courseId, academicPeriodId, studentIds) {
  if (!studentIds.length) return;
  const enrolled = new Set((await enrolledStudents(db, courseId, academicPeriodId)).map((e) => e.student_id));
  const ineligible = [...new Set(studentIds)].filter((id) => !enrolled.has(id));
  if (ineligible.length) {
    throw unprocessable(
      ineligible.length === 1
        ? 'One selected student is not enrolled on this course for the assignment period.'
        : `${ineligible.length} selected students are not enrolled on this course for the assignment period.`,
      ineligible.map((id) => ({ path: 'studentIds', message: 'Not enrolled on this course offering.', studentId: id })),
    );
  }
}

async function assignedStudentRows(db, assignmentId) {
  const rows = await fetchAll(() =>
    db.from('assignment_student_details').select('*').eq('assignment_id', assignmentId).order('full_name'),
  );
  return rows.map(mapAssignedStudent);
}

// ------------------------------------------------------------------ staff
export async function list(db, user, q) {
  const { from, to } = pageRange(q);
  let query = db.from('assignment_overview').select('*', { count: 'exact' });
  if (user.role === 'lecturer') {
    // Defence in depth on top of RLS: only courses this lecturer is assigned to.
    const ids = await lecturerCourseIds(db, user);
    if (!ids.length) return { data: [], meta: listMeta(q, 0) };
    query = query.in('course_id', ids);
  }
  const or = searchFilter(q.search, ['title', 'course_code', 'course_name']);
  if (or) query = query.or(or);
  if (q.courseId) query = query.eq('course_id', q.courseId);
  if (q.academicPeriodId) query = query.eq('academic_period_id', q.academicPeriodId);
  const { data, count } = check(
    await applySort(query, q, sortMap, { column: 'created_at', ascending: false }).range(from, to),
  );
  return { data: data.map(mapCoursework), meta: listMeta(q, count) };
}

export async function get(db, user, id) {
  await loadForStaff(db, user, id);
  const { data } = check(await db.from('assignment_overview').select('*').eq('id', id).maybeSingle());
  if (!data) throw notFound('Assignment not found.');
  return mapCoursework(data);
}

export async function create(db, user, body) {
  await assertCanManageCourse(db, user, body.courseId, body.academicPeriodId);
  const [course, period] = await Promise.all([
    db.from('courses').select('id').eq('id', body.courseId).maybeSingle(),
    db.from('academic_periods').select('id').eq('id', body.academicPeriodId).maybeSingle(),
  ]);
  if (!check(course).data) throw unprocessable('Course not found.', [{ path: 'courseId', message: 'Course not found.' }]);
  if (!check(period).data) {
    throw unprocessable('Academic period not found.', [{ path: 'academicPeriodId', message: 'Academic period not found.' }]);
  }
  const studentIds = [...new Set(body.studentIds)];
  await assertEligible(db, body.courseId, body.academicPeriodId, studentIds);

  // One transaction: the assignment and its student list are created together or not at all.
  const { data: id } = check(
    await db.rpc('create_assignment', {
      p_course_id: body.courseId,
      p_period_id: body.academicPeriodId,
      p_title: body.title,
      p_description: body.description || null,
      p_due_at: body.dueAt,
      p_max_marks: body.maxMarks,
      p_student_ids: studentIds,
    }),
  );
  return get(db, user, id);
}

export async function update(db, user, id, body) {
  await loadForStaff(db, user, id);
  const patch = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description || null;
  if (body.dueAt !== undefined) patch.due_at = body.dueAt;
  if (body.maxMarks !== undefined) patch.max_marks = body.maxMarks;
  const { data } = check(await db.from('assignments').update(patch).eq('id', id).select('id').maybeSingle());
  if (!data) throw notFound('Assignment not found.');
  return get(db, user, id);
}

/** Deletes the assignment and its student links (cascade). Student records are untouched. */
export async function remove(db, user, id) {
  await loadForStaff(db, user, id);
  const { data } = check(await db.from('assignments').delete().eq('id', id).select('id').maybeSingle());
  if (!data) throw notFound('Assignment not found.');
}

/** Students who can be assigned to a course offering, flagged if already on `assignmentId`. */
export async function eligibleStudents(db, user, { courseId, academicPeriodId, assignmentId = null }) {
  await assertCanManageCourse(db, user, courseId, academicPeriodId);
  const [enrolled, assigned] = await Promise.all([
    enrolledStudents(db, courseId, academicPeriodId),
    assignmentId
      ? fetchAll(() => db.from('assignment_students').select('student_id').eq('assignment_id', assignmentId))
      : [],
  ]);
  const assignedIds = new Set(assigned.map((a) => a.student_id));
  return enrolled.map((e) => mapEligibleStudent(e, assignedIds.has(e.student_id)));
}

export async function eligibleForAssignment(db, user, id) {
  const a = await loadForStaff(db, user, id);
  return eligibleStudents(db, user, { courseId: a.course_id, academicPeriodId: a.academic_period_id, assignmentId: id });
}

export async function students(db, user, id) {
  await loadForStaff(db, user, id);
  return assignedStudentRows(db, id);
}

/** Adds students; ones already assigned are skipped (unique constraint), not duplicated. */
export async function addStudents(db, user, id, { studentIds }) {
  const a = await loadForStaff(db, user, id);
  const ids = [...new Set(studentIds)];
  await assertEligible(db, a.course_id, a.academic_period_id, ids);
  const { data } = check(
    await db
      .from('assignment_students')
      .upsert(
        ids.map((studentId) => ({ assignment_id: id, student_id: studentId })),
        { onConflict: 'assignment_id,student_id', ignoreDuplicates: true },
      )
      .select('id'),
  );
  return { added: data.length, skipped: ids.length - data.length, students: await assignedStudentRows(db, id) };
}

/** Replaces the student list in one transaction. */
export async function setStudents(db, user, id, { studentIds }) {
  const a = await loadForStaff(db, user, id);
  const ids = [...new Set(studentIds)];
  await assertEligible(db, a.course_id, a.academic_period_id, ids);
  const { data } = check(await db.rpc('set_assignment_students', { p_assignment_id: id, p_student_ids: ids }));
  return { added: data?.added ?? 0, removed: data?.removed ?? 0, students: await assignedStudentRows(db, id) };
}

/** Removes one student's access. Only the link row is deleted. */
export async function removeStudent(db, user, id, studentId) {
  await loadForStaff(db, user, id);
  const { data } = check(
    await db
      .from('assignment_students')
      .delete()
      .eq('assignment_id', id)
      .eq('student_id', studentId)
      .select('id')
      .maybeSingle(),
  );
  if (!data) throw notFound('This student is not assigned to the assignment.');
  return { removedStudentId: studentId, students: await assignedStudentRows(db, id) };
}

// ------------------------------------------------------------------ students
/** Fields a student may see (no staff-only counts or creator details). */
const forStudent = (row, link) => {
  const { assignedCount: _count, createdBy: _by, ...rest } = mapCoursework(row);
  return { ...rest, assignedAt: link.assigned_at, status: link.assignment_status };
};

/** The signed-in student's assignments. Student id comes from the session. */
export async function myAssignments(db, user, { academicPeriodId } = {}) {
  const links = await fetchAll(() =>
    db.from('assignment_students').select('assignment_id, assigned_at, assignment_status').eq('student_id', user.studentId),
  );
  if (!links.length) return [];
  const byId = new Map(links.map((l) => [l.assignment_id, l]));
  let query = db
    .from('assignment_overview')
    .select('*')
    .in('id', [...byId.keys()])
    .order('due_at', { ascending: true });
  if (academicPeriodId) query = query.eq('academic_period_id', academicPeriodId);
  const { data } = check(await query);
  return data.filter((row) => byId.has(row.id)).map((row) => forStudent(row, byId.get(row.id)));
}

export async function myAssignment(db, user, id) {
  const { data: link } = check(
    await db
      .from('assignment_students')
      .select('assignment_id, assigned_at, assignment_status')
      .eq('assignment_id', id)
      .eq('student_id', user.studentId)
      .maybeSingle(),
  );
  if (!link) throw notFound('Assignment not found.');
  const { data } = check(await db.from('assignment_overview').select('*').eq('id', id).maybeSingle());
  if (!data) throw notFound('Assignment not found.');
  return forStudent(data, link);
}
