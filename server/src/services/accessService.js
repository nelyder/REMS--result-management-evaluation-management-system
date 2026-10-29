import { check, forbidden } from '../utils/httpError.js';

/**
 * Explicit server-side ownership check (RLS enforces the same rule in the
 * database). Admins may manage any course; lecturers only the course offerings
 * they are assigned to; everyone else is refused.
 */
export async function assertCanManageCourse(db, user, courseId, academicPeriodId) {
  if (user.role === 'admin') return;
  if (user.role !== 'lecturer' || !user.lecturerId) throw forbidden();
  const { data } = check(
    await db
      .from('course_assignments')
      .select('id')
      .eq('lecturer_id', user.lecturerId)
      .eq('course_id', courseId)
      .eq('academic_period_id', academicPeriodId)
      .maybeSingle(),
  );
  if (!data) throw forbidden('You are not assigned to this course for the selected period.');
}

/** Course ids a lecturer is assigned to (any period). */
export async function lecturerCourseIds(db, user) {
  const { data } = check(await db.from('course_assignments').select('course_id').eq('lecturer_id', user.lecturerId));
  return [...new Set(data.map((r) => r.course_id))];
}
