import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/schemas.js';
import {
  assignments,
  auditHandlers,
  auth,
  courses,
  courseworkHandlers as coursework,
  departments,
  enrollmentHandlers,
  lecturers,
  periods,
  programmes,
  reportHandlers,
  resultHandlers,
  settingsHandlers,
  students,
  users,
} from '../controllers/index.js';

const admin = requireRole('admin');
const staff = requireRole('admin', 'lecturer');
const anyRole = requireRole('admin', 'lecturer', 'student');
const student = requireRole('student');
const lecturer = requireRole('lecturer');

export const router = Router();

router.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));

// Everything below requires a valid Supabase session and an active profile.
router.use(authenticate);

// ---- auth / profile
router.get('/auth/me', anyRole, auth.me);
router.get('/profile', anyRole, auth.me);

// ---- students (/me routes first so "me" is not parsed as an id)
router.get('/students/me/results', student, validate({ query: s.myResultsQuery }), students.myResults);
router.get('/students/me/summary', student, students.mySummary);
router.get('/students/me/assignments', student, validate({ query: s.myAssignmentsQuery }), students.myAssignments);
router.get('/students/me/assignments/:id', student, validate({ params: s.idParams }), students.myAssignment);
router.get('/students', admin, validate({ query: s.studentListQuery }), students.list);
router.post('/students', admin, validate({ body: s.studentCreate }), students.create);
router.get('/students/:id', admin, validate({ params: s.idParams }), students.get);
router.get('/students/:id/statement', admin, validate({ params: s.idParams }), students.statement);
router.patch('/students/:id', admin, validate({ params: s.idParams, body: s.studentUpdate }), students.update);

// ---- lecturers
router.get('/lecturers', admin, validate({ query: s.lecturerListQuery }), lecturers.list);
router.post('/lecturers', admin, validate({ body: s.lecturerCreate }), lecturers.create);
router.patch('/lecturers/:id', admin, validate({ params: s.idParams, body: s.lecturerUpdate }), lecturers.update);

// ---- account status
router.patch('/users/:profileId/status', admin, validate({ params: s.profileParams, body: s.statusUpdate }), users.setStatus);

// ---- reference data (read: any active user; write: admin)
const reference = [
  ['/departments', departments, s.departmentBody, s.listQuery, true],
  ['/programmes', programmes, s.programmeBody, s.programmeListQuery, true],
  ['/courses', courses, s.courseBody, s.courseListQuery, false],
  ['/academic-periods', periods, s.periodBody, s.periodListQuery, false],
];
for (const [path, c, body, query, deletable] of reference) {
  router.get(path, anyRole, validate({ query }), c.list);
  router.get(`${path}/:id`, anyRole, validate({ params: s.idParams }), c.get);
  router.post(path, admin, validate({ body }), c.create);
  router.patch(`${path}/:id`, admin, validate({ params: s.idParams, body }), c.update);
  if (deletable) router.delete(`${path}/:id`, admin, validate({ params: s.idParams }), c.remove);
}

// ---- course assignments
router.get('/course-assignments', admin, validate({ query: s.assignmentListQuery }), assignments.list);
router.post('/course-assignments', admin, validate({ body: s.assignmentBody }), assignments.create);
router.delete('/course-assignments/:id', admin, validate({ params: s.idParams }), assignments.remove);
router.get('/lecturer/assignments', lecturer, validate({ query: s.assignmentListQuery }), assignments.mine);

// ---- coursework assignments (staff; the service checks course assignment for lecturers)
router.get('/assignments', staff, validate({ query: s.courseworkListQuery }), coursework.list);
router.post('/assignments', staff, validate({ body: s.courseworkCreate }), coursework.create);
// Before /assignments/:id so "eligible-students" is not parsed as an id.
router.get('/assignments/eligible-students', staff, validate({ query: s.eligibleStudentsQuery }), coursework.eligibleForOffering);
router.get('/assignments/:id', staff, validate({ params: s.idParams }), coursework.get);
router.patch('/assignments/:id', staff, validate({ params: s.idParams, body: s.courseworkUpdate }), coursework.update);
router.delete('/assignments/:id', staff, validate({ params: s.idParams }), coursework.remove);
router.get('/assignments/:id/students', staff, validate({ params: s.idParams }), coursework.students);
router.get('/assignments/:id/eligible-students', staff, validate({ params: s.idParams }), coursework.eligible);
router.post('/assignments/:id/students', staff, validate({ params: s.idParams, body: s.studentIdsAdd }), coursework.addStudents);
router.put('/assignments/:id/students', staff, validate({ params: s.idParams, body: s.studentIdsSet }), coursework.setStudents);
router.delete(
  '/assignments/:id/students/:studentId',
  staff,
  validate({ params: s.assignmentStudentParams }),
  coursework.removeStudent,
);

// ---- enrollments
router.get(
  '/courses/:courseId/enrollments',
  staff,
  validate({ params: s.courseParams, query: s.enrollmentListQuery }),
  enrollmentHandlers.forCourse,
);
router.post('/enrollments', admin, validate({ body: s.enrollmentCreate }), enrollmentHandlers.create);
router.post('/enrollments/bulk', admin, validate({ body: s.enrollmentBulk }), enrollmentHandlers.bulk);
router.patch('/enrollments/:id', admin, validate({ params: s.idParams, body: s.enrollmentUpdate }), enrollmentHandlers.update);

// ---- results (students never reach these; they use /students/me/*)
router.get('/results', staff, validate({ query: s.resultListQuery }), resultHandlers.list);
router.post('/results', staff, validate({ body: s.resultCreate }), resultHandlers.create);
router.get('/results/:id', staff, validate({ params: s.idParams }), resultHandlers.get);
router.patch('/results/:id', staff, validate({ params: s.idParams, body: s.resultUpdate }), resultHandlers.update);
router.post('/results/:id/publish', staff, validate({ params: s.idParams }), resultHandlers.publish);
router.get('/results/:id/history', staff, validate({ params: s.idParams }), resultHandlers.history);
const courseTransition = (target) => [
  staff,
  validate({ params: s.courseParams, body: s.coursePeriodBody }),
  resultHandlers.transition(target),
];
router.post('/courses/:courseId/results/publish', ...courseTransition('published'));
router.post('/courses/:courseId/results/submit', ...courseTransition('submitted'));
router.post('/courses/:courseId/results/return', admin, ...courseTransition('draft'));
router.get(
  '/courses/:courseId/results/export',
  staff,
  validate({ params: s.courseParams, query: s.exportQuery }),
  resultHandlers.export,
);

// ---- evaluation settings & grading
router.get('/settings/evaluation', anyRole, settingsHandlers.getEvaluation);
router.put('/settings/evaluation', admin, validate({ body: s.evaluationSettingsBody }), settingsHandlers.updateEvaluation);
router.get('/grading-scales', anyRole, validate({ query: s.gradingScaleQuery }), settingsHandlers.getBands);
router.put('/grading-scales', admin, validate({ body: s.gradingScaleBody }), settingsHandlers.replaceBands);

// ---- reports & audit
router.get('/reports/overview', staff, validate({ query: s.reportQuery }), reportHandlers.overview);
router.get('/reports/course-performance', staff, validate({ query: s.reportQuery }), reportHandlers.coursePerformance);
router.get('/reports/grade-distribution', staff, validate({ query: s.reportQuery }), reportHandlers.gradeDistribution);
router.get('/audit-logs', admin, validate({ query: s.auditQuery }), auditHandlers.list);
