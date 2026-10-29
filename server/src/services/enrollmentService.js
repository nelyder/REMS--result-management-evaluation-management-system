import { check, notFound, unprocessable } from '../utils/httpError.js';
import { applySort, listMeta, pageRange, searchFilter } from '../utils/query.js';
import { mapCourse, mapEnrollment, mapPeriod } from '../utils/mappers.js';
import { assertCanManageCourse } from './accessService.js';

const sortMap = { registrationNumber: 'registration_number', fullName: 'full_name' };

export async function listForCourse(db, user, courseId, q) {
  await assertCanManageCourse(db, user, courseId, q.academicPeriodId);
  const { from, to } = pageRange(q);
  let query = db
    .from('enrollment_details')
    .select('*', { count: 'exact' })
    .eq('course_id', courseId)
    .eq('academic_period_id', q.academicPeriodId);
  const or = searchFilter(q.search, ['full_name', 'registration_number']);
  if (or) query = query.or(or);
  if (q.enrollmentStatus) query = query.eq('enrollment_status', q.enrollmentStatus);

  const [list, course, period] = await Promise.all([
    applySort(query, q, sortMap, { column: 'registration_number' }).range(from, to),
    db.from('courses').select('*').eq('id', courseId).maybeSingle(),
    db.from('academic_periods').select('*').eq('id', q.academicPeriodId).maybeSingle(),
  ]);
  const { data, count } = check(list);
  if (!check(course).data) throw notFound('Course not found.');
  return {
    data: data.map(mapEnrollment),
    meta: { ...listMeta(q, count), course: mapCourse(course.data), academicPeriod: mapPeriod(check(period).data) },
  };
}

export async function create(db, body) {
  const { data } = check(
    await db
      .from('enrollments')
      .insert({ student_id: body.studentId, course_id: body.courseId, academic_period_id: body.academicPeriodId })
      .select('id')
      .single(),
    { conflictMessage: 'The student is already enrolled on this course for that period.' },
  );
  return { id: data.id };
}

/** Enrolls a list of students or a whole programme cohort; existing enrollments are skipped. */
export async function bulk(db, body) {
  let studentIds = body.studentIds;
  if (!studentIds) {
    const { data } = check(
      await db
        .from('student_directory')
        .select('id')
        .eq('programme_id', body.programmeId)
        .eq('year_of_study', body.yearOfStudy)
        .eq('account_status', 'active'),
    );
    studentIds = data.map((s) => s.id);
  }
  studentIds = [...new Set(studentIds)];
  if (!studentIds.length) return { created: 0, skipped: 0 };

  const rows = studentIds.map((id) => ({ student_id: id, course_id: body.courseId, academic_period_id: body.academicPeriodId }));
  const { data } = check(
    await db
      .from('enrollments')
      .upsert(rows, { onConflict: 'student_id,course_id,academic_period_id', ignoreDuplicates: true })
      .select('id'),
  );
  return { created: data.length, skipped: studentIds.length - data.length };
}

export async function update(db, id, body) {
  if (body.enrollmentStatus === 'withdrawn') {
    const { data: result } = check(await db.from('results').select('publication_status').eq('enrollment_id', id).maybeSingle());
    if (result && result.publication_status !== 'draft') {
      throw unprocessable('This student has a submitted or published result and cannot be withdrawn.');
    }
  }
  const { data } = check(
    await db.from('enrollments').update({ enrollment_status: body.enrollmentStatus }).eq('id', id).select('id, enrollment_status').maybeSingle(),
  );
  if (!data) throw notFound('Enrollment not found.');
  return { id: data.id, enrollmentStatus: data.enrollment_status };
}
