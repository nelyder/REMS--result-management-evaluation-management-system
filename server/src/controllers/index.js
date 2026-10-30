// Thin HTTP handlers: read validated input, call a service, shape the response.
// Identity (user id, role, student/lecturer id) always comes from req.user,
// which authenticate() loaded from the database.
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { forbidden } from '../utils/httpError.js';
import * as academic from '../services/academicService.js';
import * as people from '../services/peopleService.js';
import * as enrollments from '../services/enrollmentService.js';
import * as results from '../services/resultService.js';
import * as settings from '../services/settingsService.js';
import * as reports from '../services/reportService.js';
import * as audit from '../services/auditService.js';
import * as coursework from '../services/courseworkService.js';
import { exportCourseResults } from '../services/exportService.js';

const ok = (res, data, status = 200) => res.status(status).json({ data });
const page = (res, { data, meta }) => res.json({ data, meta });

export const auth = {
  me: h(async (req, res) => ok(res, req.user)),
};

/** Builds list/get/create/update/remove handlers for an academicService CRUD resource. */
const crudHandlers = (svc) => ({
  list: h(async (req, res) => page(res, await svc.list(req.db, req.query))),
  get: h(async (req, res) => ok(res, await svc.get(req.db, req.params.id))),
  create: h(async (req, res) => ok(res, await svc.create(req.db, req.body), 201)),
  update: h(async (req, res) => ok(res, await svc.update(req.db, req.params.id, req.body))),
  remove: h(async (req, res) => {
    await svc.remove(req.db, req.params.id);
    res.status(204).end();
  }),
});

export const departments = crudHandlers(academic.departments);
export const programmes = crudHandlers(academic.programmes);
export const courses = crudHandlers(academic.courses);
export const periods = crudHandlers(academic.periods);
export const assignments = {
  ...crudHandlers(academic.assignments),
  mine: h(async (req, res) => page(res, await academic.myAssignments(req.db, req.user, req.query))),
};

export const students = {
  list: h(async (req, res) => page(res, await people.listStudents(req.db, req.query))),
  get: h(async (req, res) => ok(res, await people.getStudent(req.db, req.params.id))),
  create: h(async (req, res) => ok(res, await people.createStudent(req.db, req.user, req.body), 201)),
  update: h(async (req, res) => ok(res, await people.updateStudent(req.db, req.params.id, req.body))),
  myResults: h(async (req, res) => {
    if (!req.user.studentId) throw forbidden();
    ok(res, await results.myResults(req.db, req.user, req.query));
  }),
  mySummary: h(async (req, res) => {
    if (!req.user.studentId) throw forbidden();
    ok(res, await reports.studentSummary(req.db, req.user));
  }),
  statement: h(async (req, res) => ok(res, await reports.studentStatement(req.db, req.params.id))),
  myAssignments: h(async (req, res) => {
    if (!req.user.studentId) throw forbidden();
    ok(res, await coursework.myAssignments(req.db, req.user, req.query));
  }),
  myAssignment: h(async (req, res) => {
    if (!req.user.studentId) throw forbidden();
    ok(res, await coursework.myAssignment(req.db, req.user, req.params.id));
  }),
};

export const lecturers = {
  list: h(async (req, res) => page(res, await people.listLecturers(req.db, req.query))),
  create: h(async (req, res) => ok(res, await people.createLecturer(req.db, req.user, req.body), 201)),
  update: h(async (req, res) => ok(res, await people.updateLecturer(req.db, req.params.id, req.body))),
};

export const users = {
  setStatus: h(async (req, res) =>
    ok(res, await people.setAccountStatus(req.db, req.user, req.params.profileId, req.body.accountStatus)),
  ),
};

export const enrollmentHandlers = {
  forCourse: h(async (req, res) => page(res, await enrollments.listForCourse(req.db, req.user, req.params.courseId, req.query))),
  create: h(async (req, res) => ok(res, await enrollments.create(req.db, req.body), 201)),
  bulk: h(async (req, res) => ok(res, await enrollments.bulk(req.db, req.body), 201)),
  update: h(async (req, res) => ok(res, await enrollments.update(req.db, req.params.id, req.body))),
};

export const resultHandlers = {
  list: h(async (req, res) => page(res, await results.list(req.db, req.user, req.query))),
  get: h(async (req, res) => ok(res, await results.get(req.db, req.user, req.params.id))),
  create: h(async (req, res) => ok(res, await results.create(req.db, req.user, req.body), 201)),
  update: h(async (req, res) => ok(res, await results.update(req.db, req.user, req.params.id, req.body))),
  publish: h(async (req, res) => ok(res, await results.publishOne(req.db, req.user, req.params.id))),
  history: h(async (req, res) => ok(res, await results.history(req.db, req.user, req.params.id))),
  transition: (target) =>
    h(async (req, res) =>
      ok(res, await results.transitionCourse(req.db, req.user, req.params.courseId, req.body.academicPeriodId, target)),
    ),
  export: h(async (req, res) => {
    const file = await exportCourseResults(req.db, req.user, req.params.courseId, req.query);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(file.body);
  }),
};

export const settingsHandlers = {
  getEvaluation: h(async (req, res) => ok(res, await settings.getSettings(req.db))),
  updateEvaluation: h(async (req, res) => ok(res, await settings.updateSettings(req.db, req.body))),
  getBands: h(async (req, res) => ok(res, await settings.getBands(req.db, req.query.academicPeriodId ?? null))),
  replaceBands: h(async (req, res) => ok(res, await settings.replaceBands(req.db, req.body))),
};

export const reportHandlers = {
  overview: h(async (req, res) => ok(res, await reports.overview(req.db, req.user, req.query))),
  coursePerformance: h(async (req, res) => page(res, await reports.coursePerformance(req.db, req.user, req.query))),
  gradeDistribution: h(async (req, res) => ok(res, await reports.gradeDistribution(req.db, req.user, req.query))),
};

export const courseworkHandlers = {
  list: h(async (req, res) => page(res, await coursework.list(req.db, req.user, req.query))),
  get: h(async (req, res) => ok(res, await coursework.get(req.db, req.user, req.params.id))),
  create: h(async (req, res) => ok(res, await coursework.create(req.db, req.user, req.body), 201)),
  update: h(async (req, res) => ok(res, await coursework.update(req.db, req.user, req.params.id, req.body))),
  remove: h(async (req, res) => {
    await coursework.remove(req.db, req.user, req.params.id);
    res.status(204).end();
  }),
  eligibleForOffering: h(async (req, res) => ok(res, await coursework.eligibleStudents(req.db, req.user, req.query))),
  eligible: h(async (req, res) => ok(res, await coursework.eligibleForAssignment(req.db, req.user, req.params.id))),
  students: h(async (req, res) => ok(res, await coursework.students(req.db, req.user, req.params.id))),
  addStudents: h(async (req, res) => ok(res, await coursework.addStudents(req.db, req.user, req.params.id, req.body))),
  setStudents: h(async (req, res) => ok(res, await coursework.setStudents(req.db, req.user, req.params.id, req.body))),
  removeStudent: h(async (req, res) =>
    ok(res, await coursework.removeStudent(req.db, req.user, req.params.id, req.params.studentId)),
  ),
};

export const auditHandlers = {
  list: h(async (req, res) => page(res, await audit.list(req.db, req.query))),
};
