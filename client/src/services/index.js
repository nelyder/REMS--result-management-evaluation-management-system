import { http } from './api.js';

const crud = (base) => ({
  list: (params) => http.get(base, params),
  get: (id) => http.get(`${base}/${id}`),
  create: (body) => http.post(base, body),
  update: (id, body) => http.patch(`${base}/${id}`, body),
  remove: (id) => http.del(`${base}/${id}`),
});

export const authService = {
  me: () => http.get('/auth/me'),
};

export const studentsService = {
  ...crud('/students'),
  myResults: (params) => http.get('/students/me/results', params),
  mySummary: () => http.get('/students/me/summary'),
  statement: (id) => http.get(`/students/${id}/statement`),
};

export const lecturersService = crud('/lecturers');
export const departmentsService = crud('/departments');
export const programmesService = crud('/programmes');
export const coursesService = crud('/courses');
export const periodsService = crud('/academic-periods');
export const assignmentsService = {
  ...crud('/course-assignments'),
  mine: (params) => http.get('/lecturer/assignments', params),
};

export const enrollmentsService = {
  forCourse: (courseId, params) => http.get(`/courses/${courseId}/enrollments`, params),
  create: (body) => http.post('/enrollments', body),
  bulk: (body) => http.post('/enrollments/bulk', body),
  update: (id, body) => http.patch(`/enrollments/${id}`, body),
};

export const resultsService = {
  list: (params) => http.get('/results', params),
  get: (id) => http.get(`/results/${id}`),
  save: (body) => http.post('/results', body),
  update: (id, body) => http.patch(`/results/${id}`, body),
  publish: (id) => http.post(`/results/${id}/publish`),
  publishCourse: (courseId, body) => http.post(`/courses/${courseId}/results/publish`, body),
  submitCourse: (courseId, body) => http.post(`/courses/${courseId}/results/submit`, body),
  returnCourse: (courseId, body) => http.post(`/courses/${courseId}/results/return`, body),
  history: (id) => http.get(`/results/${id}/history`),
  exportCourse: (courseId, params, filename) =>
    http.download(`/courses/${courseId}/results/export`, params, filename),
};

export const settingsService = {
  getEvaluation: () => http.get('/settings/evaluation'),
  updateEvaluation: (body) => http.put('/settings/evaluation', body),
  getGradingScales: (params) => http.get('/grading-scales', params),
  updateGradingScales: (body) => http.put('/grading-scales', body),
};

export const reportsService = {
  overview: (params) => http.get('/reports/overview', params),
  coursePerformance: (params) => http.get('/reports/course-performance', params),
  gradeDistribution: (params) => http.get('/reports/grade-distribution', params),
};

export const auditService = { list: (params) => http.get('/audit-logs', params) };

export const usersService = {
  setStatus: (profileId, accountStatus) =>
    http.patch(`/users/${profileId}/status`, { accountStatus }),
};
