import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createFakeDb } from './helpers/fakeSupabase.js';

// ---------------------------------------------------------------- fixtures (fictional)
const ids = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  lecturer: '00000000-0000-4000-8000-0000000000b1',
  student: '00000000-0000-4000-8000-0000000000c1',
  otherStudent: '00000000-0000-4000-8000-0000000000c2',
  inactive: '00000000-0000-4000-8000-0000000000d1',
  lecturerRow: '10000000-0000-4000-8000-0000000000b1',
  studentRow: '20000000-0000-4000-8000-0000000000c1',
  otherStudentRow: '20000000-0000-4000-8000-0000000000c2',
  assignedCourse: '30000000-0000-4000-8000-000000000001',
  otherCourse: '30000000-0000-4000-8000-000000000002',
  period: '40000000-0000-4000-8000-000000000001',
  enrollment: '50000000-0000-4000-8000-000000000001',
  result: '60000000-0000-4000-8000-000000000001',
};

const profiles = {
  [ids.admin]: { id: ids.admin, full_name: 'Ada Admin', email: 'admin@example.edu', role: 'admin', account_status: 'active' },
  [ids.lecturer]: {
    id: ids.lecturer,
    full_name: 'Lena Lecturer',
    email: 'lecturer@example.edu',
    role: 'lecturer',
    account_status: 'active',
    lecturer: { id: ids.lecturerRow, staff_number: 'STF/1', department: null },
  },
  [ids.student]: {
    id: ids.student,
    full_name: 'Amina Test',
    email: 'student@example.edu',
    role: 'student',
    account_status: 'active',
    student: { id: ids.studentRow, registration_number: 'REG/2025/0001', year_of_study: 1, programme: null },
  },
  [ids.inactive]: { id: ids.inactive, full_name: 'Ivy Inactive', email: 'inactive@example.edu', role: 'student', account_status: 'inactive' },
};
const tokens = { 'admin-token': ids.admin, 'lecturer-token': ids.lecturer, 'student-token': ids.student, 'inactive-token': ids.inactive, 'orphan-token': ids.otherStudent };

// ---------------------------------------------------------------- mocks
const state = vi.hoisted(() => ({ userDb: null, adminDb: null }));

vi.mock('../src/config/supabase.js', () => ({
  get adminClient() {
    return state.adminDb;
  },
  createUserClient: () => state.userDb,
}));

const { createApp } = await import('../src/app.js');
const app = createApp();

let settings;
let resultRow;

function makeAdminDb() {
  const db = createFakeDb({
    profiles: (ctx) => ({ data: profiles[db.eqValue(ctx, 'id')] ?? null }),
  });
  db.auth = {
    getUser: async (token) =>
      tokens[token] ? { data: { user: { id: tokens[token] } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
    admin: { createUser: vi.fn(), deleteUser: vi.fn(), updateUserById: vi.fn(async () => ({ error: null })) },
  };
  return db;
}

function makeUserDb() {
  return createFakeDb({
    evaluation_settings: () => ({ data: settings }),
    grading_scales: (ctx) => ({
      data: ctx.filters.some(([op]) => op === 'is')
        ? [
            { id: 'g1', grade: 'A', minimum_mark: 70, maximum_mark: 100, grade_point: 4 },
            { id: 'g2', grade: 'B', minimum_mark: 60, maximum_mark: 69.99, grade_point: 3 },
            { id: 'g3', grade: 'C', minimum_mark: 50, maximum_mark: 59.99, grade_point: 2 },
            { id: 'g4', grade: 'F', minimum_mark: 0, maximum_mark: 49.99, grade_point: 0 },
          ]
        : [],
    }),
    // Lecturer is assigned to assignedCourse only.
    course_assignments: (ctx) => {
      const course = ctx.filters.find(([op, col]) => op === 'eq' && col === 'course_id')?.[2];
      if (ctx.single) return { data: course === ids.assignedCourse ? { id: 'ca1' } : null };
      return { data: [{ course_id: ids.assignedCourse }] };
    },
    enrollments: (ctx) => {
      if (ctx.op === 'select') {
        return {
          data: {
            id: ids.enrollment,
            course_id: ids.assignedCourse,
            academic_period_id: ids.period,
            enrollment_status: 'enrolled',
            course: { pass_mark: null },
          },
        };
      }
      return { data: { id: ids.enrollment } };
    },
    results: (ctx) => {
      if (ctx.op === 'insert') return { data: { id: ids.result, ...ctx.payload, version: 1, publication_status: 'draft' } };
      if (ctx.op === 'update') return { data: { ...resultRow, ...ctx.payload, version: resultRow.version + 1 } };
      return { data: resultRow };
    },
    result_details: () => ({ data: [] }),
    student_directory: (ctx) => ({
      data:
        ctx.filters.some(([op, col, v]) => op === 'eq' && col === 'id' && v === ids.otherStudentRow)
          ? { id: ids.otherStudentRow, profile_id: ids.otherStudent, full_name: 'Brian Sample', email: 'b@example.edu', registration_number: 'REG/2025/0002', year_of_study: 1, account_status: 'active' }
          : null,
    }),
    audit_logs: () => ({ data: [], count: 0 }),
  });
}

const as = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  settings = { id: 1, coursework_max: 40, exam_max: 60, default_pass_mark: 50, lecturer_can_publish: false, lecturer_can_correct: false };
  resultRow = {
    id: ids.result,
    enrollment_id: ids.enrollment,
    coursework_mark: 30,
    examination_mark: 40,
    total_mark: 70,
    grade: 'A',
    result_status: 'pass',
    publication_status: 'draft',
    version: 3,
    enrollment: { id: ids.enrollment, course_id: ids.assignedCourse, academic_period_id: ids.period, enrollment_status: 'enrolled', course: { pass_mark: null } },
  };
  state.adminDb = makeAdminDb();
  state.userDb = makeUserDb();
});

// ---------------------------------------------------------------- authentication
describe('authentication', () => {
  it('serves health without auth', async () => {
    await request(app).get('/api/health').expect(200);
  });
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  it('rejects malformed authorization headers', async () => {
    await request(app).get('/api/auth/me').set('Authorization', 'Token abc').expect(401);
  });
  it('rejects invalid or expired tokens', async () => {
    await request(app).get('/api/auth/me').set(as('forged-token')).expect(401);
  });
  it('rejects valid users without a provisioned profile', async () => {
    await request(app).get('/api/auth/me').set(as('orphan-token')).expect(403);
  });
  it('rejects inactive accounts', async () => {
    const res = await request(app).get('/api/auth/me').set(as('inactive-token')).expect(403);
    expect(res.body.error.message).toMatch(/inactive/i);
  });
  it('returns the server-verified profile', async () => {
    const res = await request(app).get('/api/auth/me').set(as('student-token')).expect(200);
    expect(res.body.data).toMatchObject({ role: 'student', studentId: ids.studentRow });
  });
  it('ignores role claims sent by the client', async () => {
    const res = await request(app).get('/api/auth/me').set(as('student-token')).set('X-Role', 'admin').expect(200);
    expect(res.body.data.role).toBe('student');
  });
});

// ---------------------------------------------------------------- role-based access
describe('role-based access control', () => {
  it.each([
    ['get', '/api/students'],
    ['get', `/api/students/${ids.otherStudentRow}`],
    ['get', '/api/results'],
    ['post', '/api/results'],
    ['patch', `/api/results/${ids.result}`],
    ['post', `/api/results/${ids.result}/publish`],
    ['get', '/api/audit-logs'],
    ['put', '/api/settings/evaluation'],
    ['post', '/api/enrollments'],
    ['get', `/api/courses/${ids.assignedCourse}/results/export?academicPeriodId=${ids.period}`],
    ['get', '/api/reports/overview'],
  ])('student cannot %s %s', async (method, url) => {
    const res = await request(app)[method](url).set(as('student-token')).send({});
    expect(res.status).toBe(403);
  });

  it.each([
    ['post', '/api/students'],
    ['post', '/api/lecturers'],
    ['post', '/api/course-assignments'],
    ['get', '/api/audit-logs'],
    ['put', '/api/grading-scales'],
    ['patch', `/api/users/${ids.student}/status`],
  ])('lecturer cannot %s %s', async (method, url) => {
    const res = await request(app)[method](url).set(as('lecturer-token')).send({});
    expect(res.status).toBe(403);
  });

  it('only students can use /students/me routes', async () => {
    await request(app).get('/api/students/me/results').set(as('lecturer-token')).expect(403);
  });
});

// ---------------------------------------------------------------- student data isolation
describe('student access to results', () => {
  it('returns only the caller’s own published results', async () => {
    await request(app).get('/api/students/me/results').set(as('student-token')).expect(200);
    const q = state.userDb.calls.find((c) => c.table === 'result_details');
    expect(q.filters).toContainEqual(['eq', 'student_id', ids.studentRow]);
    expect(q.filters).toContainEqual(['in', 'publication_status', ['published', 'corrected']]);
  });
  it('rejects attempts to pass another student id', async () => {
    const res = await request(app)
      .get(`/api/students/me/results?studentId=${ids.otherStudentRow}`)
      .set(as('student-token'))
      .expect(400);
    expect(res.body.error.details[0].message).toMatch(/unrecognized/i);
  });
  it('cannot read another student record', async () => {
    await request(app).get(`/api/students/${ids.otherStudentRow}`).set(as('student-token')).expect(403);
  });
  it('cannot edit marks', async () => {
    await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('student-token'))
      .send({ courseworkMark: 40, examinationMark: 60, version: 3 })
      .expect(403);
    expect(state.userDb.calls.some((c) => c.table === 'results' && c.op === 'update')).toBe(false);
  });
});

// ---------------------------------------------------------------- staff result statements
describe('student result statements for staff', () => {
  it('admin gets a statement with published results only', async () => {
    const res = await request(app).get(`/api/students/${ids.otherStudentRow}/statement`).set(as('admin-token')).expect(200);
    expect(res.body.data.student.registrationNumber).toBe('REG/2025/0002');
    expect(res.body.data).toHaveProperty('summary');
    const q = state.userDb.calls.find((c) => c.table === 'result_details');
    expect(q.filters).toContainEqual(['eq', 'student_id', ids.otherStudentRow]);
    expect(q.filters).toContainEqual(['in', 'publication_status', ['published', 'corrected']]);
  });
  it('returns 404 for an unknown student', async () => {
    await request(app).get(`/api/students/${ids.studentRow}/statement`).set(as('admin-token')).expect(404);
  });
  it('students and lecturers cannot fetch another student statement', async () => {
    await request(app).get(`/api/students/${ids.otherStudentRow}/statement`).set(as('student-token')).expect(403);
    await request(app).get(`/api/students/${ids.otherStudentRow}/statement`).set(as('lecturer-token')).expect(403);
    expect(state.userDb.calls.some((c) => c.table === 'result_details')).toBe(false);
  });
});

// ---------------------------------------------------------------- lecturer course ownership
describe('lecturer course assignment checks', () => {
  it('cannot edit a result for an unassigned course', async () => {
    resultRow.enrollment.course_id = ids.otherCourse;
    const res = await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 35, examinationMark: 50, version: 3 })
      .expect(403);
    expect(res.body.error.message).toMatch(/not assigned/);
    expect(state.userDb.calls.some((c) => c.table === 'results' && c.op === 'update')).toBe(false);
  });
  it('cannot list enrollments of an unassigned course', async () => {
    await request(app)
      .get(`/api/courses/${ids.otherCourse}/enrollments?academicPeriodId=${ids.period}`)
      .set(as('lecturer-token'))
      .expect(403);
  });
  it('cannot export an unassigned course', async () => {
    await request(app)
      .get(`/api/courses/${ids.otherCourse}/results/export?academicPeriodId=${ids.period}`)
      .set(as('lecturer-token'))
      .expect(403);
  });
  it('can update a draft result for an assigned course, with server-computed evaluation', async () => {
    const res = await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 25, examinationMark: 30.5, version: 3 })
      .expect(200);
    const update = state.userDb.calls.find((c) => c.table === 'results' && c.op === 'update');
    expect(update.payload).toEqual({ coursework_mark: 25, examination_mark: 30.5, grade: 'C', grade_point: 2, result_status: 'pass' });
    expect(update.filters).toContainEqual(['eq', 'version', 3]); // optimistic lock
    expect(res.body.data.grade).toBe('C');
  });
});

// ---------------------------------------------------------------- result entry & validation
describe('result entry', () => {
  it('creates a draft with evaluation computed on the server', async () => {
    const res = await request(app)
      .post('/api/results')
      .set(as('lecturer-token'))
      .send({ enrollmentId: ids.enrollment, courseworkMark: 30, examinationMark: 15 })
      .expect(201);
    const insert = state.userDb.calls.find((c) => c.table === 'results' && c.op === 'insert');
    expect(insert.payload).toEqual({
      enrollment_id: ids.enrollment,
      coursework_mark: 30,
      examination_mark: 15,
      grade: 'F',
      grade_point: 0,
      result_status: 'fail',
    });
    expect(res.body.data.resultStatus).toBe('fail');
  });
  it('stores a missing exam as incomplete, not zero', async () => {
    await request(app)
      .post('/api/results')
      .set(as('lecturer-token'))
      .send({ enrollmentId: ids.enrollment, courseworkMark: 30, examinationMark: null })
      .expect(201);
    const insert = state.userDb.calls.find((c) => c.table === 'results' && c.op === 'insert');
    expect(insert.payload).toMatchObject({ examination_mark: null, grade: null, result_status: 'incomplete' });
  });
  it('rejects marks above the configured maximum', async () => {
    const res = await request(app)
      .post('/api/results')
      .set(as('lecturer-token'))
      .send({ enrollmentId: ids.enrollment, courseworkMark: 45, examinationMark: 50 })
      .expect(422);
    expect(res.body.error.details[0]).toMatchObject({ path: 'courseworkMark' });
  });
  it.each([
    [{ enrollmentId: ids.enrollment, courseworkMark: 30, examinationMark: 40, totalMark: 100 }, 'client-supplied total'],
    [{ enrollmentId: ids.enrollment, courseworkMark: 30, examinationMark: 40, grade: 'A' }, 'client-supplied grade'],
    [{ enrollmentId: ids.enrollment, courseworkMark: 30, examinationMark: 40, enteredBy: ids.admin }, 'client-supplied author'],
    [{ enrollmentId: 'not-a-uuid', courseworkMark: 30, examinationMark: 40 }, 'invalid id'],
    [{ enrollmentId: ids.enrollment, courseworkMark: '30', examinationMark: 40 }, 'string mark'],
    [{ enrollmentId: ids.enrollment, courseworkMark: -1, examinationMark: 40 }, 'negative mark'],
  ])('rejects %j (%s)', async (body) => {
    await request(app).post('/api/results').set(as('lecturer-token')).send(body).expect(400);
  });
  it('detects concurrent edits with a version conflict', async () => {
    const res = await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 30, examinationMark: 45, version: 2 })
      .expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
  it('rejects malformed ids in the URL', async () => {
    await request(app).get('/api/results/123').set(as('lecturer-token')).expect(400);
  });
  it('rejects malformed JSON', async () => {
    await request(app)
      .post('/api/results')
      .set(as('lecturer-token'))
      .set('Content-Type', 'application/json')
      .send('{"enrollmentId":')
      .expect(400);
  });
});

// ---------------------------------------------------------------- publication workflow
describe('publication restrictions', () => {
  it('lecturer cannot publish when the workflow requires admin publication', async () => {
    const res = await request(app)
      .post(`/api/courses/${ids.assignedCourse}/results/publish`)
      .set(as('lecturer-token'))
      .send({ academicPeriodId: ids.period })
      .expect(403);
    expect(res.body.error.message).toMatch(/Submit/);
    expect(state.userDb.rpcCalls).toHaveLength(0);
  });
  it('lecturer can submit results for an assigned course', async () => {
    state.userDb = createFakeDb({
      course_assignments: () => ({ data: { id: 'ca1' } }),
      evaluation_settings: () => ({ data: settings }),
      'rpc:transition_course_results': () => ({ data: 4 }),
    });
    const res = await request(app)
      .post(`/api/courses/${ids.assignedCourse}/results/submit`)
      .set(as('lecturer-token'))
      .send({ academicPeriodId: ids.period })
      .expect(200);
    expect(res.body.data.count).toBe(4);
    expect(state.userDb.rpcCalls[0].args).toEqual({ p_course_id: ids.assignedCourse, p_period_id: ids.period, p_target: 'submitted' });
  });
  it('lecturer can publish when the setting allows it', async () => {
    settings.lecturer_can_publish = true;
    state.userDb = createFakeDb({
      course_assignments: () => ({ data: { id: 'ca1' } }),
      evaluation_settings: () => ({ data: settings }),
      'rpc:transition_course_results': () => ({ data: 2 }),
    });
    await request(app)
      .post(`/api/courses/${ids.assignedCourse}/results/publish`)
      .set(as('lecturer-token'))
      .send({ academicPeriodId: ids.period })
      .expect(200);
  });
  it('lecturer cannot return submitted results', async () => {
    await request(app)
      .post(`/api/courses/${ids.assignedCourse}/results/return`)
      .set(as('lecturer-token'))
      .send({ academicPeriodId: ids.period })
      .expect(403);
  });
  it('lecturer cannot edit a submitted result', async () => {
    resultRow.publication_status = 'submitted';
    const res = await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 31, examinationMark: 40, version: 3 })
      .expect(403);
    expect(res.body.error.message).toMatch(/locked/);
  });
  it('lecturer cannot correct a published result without permission', async () => {
    resultRow.publication_status = 'published';
    await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 31, examinationMark: 40, version: 3, reason: 'Re-marked script' })
      .expect(403);
  });
  it('corrections require a reason and mark the result as corrected', async () => {
    settings.lecturer_can_correct = true;
    resultRow.publication_status = 'published';
    await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 31, examinationMark: 40, version: 3 })
      .expect(422);
    await request(app)
      .patch(`/api/results/${ids.result}`)
      .set(as('lecturer-token'))
      .send({ courseworkMark: 31, examinationMark: 40, version: 3, reason: 'Exam script re-marked' })
      .expect(200);
    const update = state.userDb.calls.find((c) => c.table === 'results' && c.op === 'update');
    expect(update.payload).toMatchObject({ publication_status: 'corrected', correction_reason: 'Exam script re-marked' });
  });
  it('admin cannot publish an incomplete result', async () => {
    resultRow = { ...resultRow, examination_mark: null, total_mark: null, grade: null, result_status: 'incomplete' };
    const res = await request(app).post(`/api/results/${ids.result}/publish`).set(as('admin-token')).expect(422);
    expect(res.body.error.message).toMatch(/Incomplete/);
  });
});

// ---------------------------------------------------------------- admin safeguards
describe('admin operations', () => {
  it('rejects privileged fields on student creation (no mass assignment)', async () => {
    await request(app)
      .post('/api/students')
      .set(as('admin-token'))
      .send({
        fullName: 'New Student',
        email: 'new@example.edu',
        password: 'long-enough-password',
        registrationNumber: 'REG/2026/0099',
        programmeId: ids.period,
        yearOfStudy: 1,
        role: 'admin',
      })
      .expect(400);
    expect(state.adminDb.auth.admin.createUser).not.toHaveBeenCalled();
  });
  it('rejects weak passwords', async () => {
    const res = await request(app)
      .post('/api/lecturers')
      .set(as('admin-token'))
      .send({ fullName: 'New Lecturer', email: 'nl@example.edu', password: 'short', staffNumber: 'STF/9', departmentId: ids.period })
      .expect(400);
    expect(res.body.error.details[0].path).toBe('password');
  });
  it('admin cannot deactivate their own account', async () => {
    await request(app)
      .patch(`/api/users/${ids.admin}/status`)
      .set(as('admin-token'))
      .send({ accountStatus: 'inactive' })
      .expect(403);
  });
  it('requires evaluation maxima to sum to 100', async () => {
    await request(app)
      .put('/api/settings/evaluation')
      .set(as('admin-token'))
      .send({ courseworkMax: 50, examMax: 60, defaultPassMark: 50, lecturerCanPublish: false, lecturerCanCorrect: false })
      .expect(400);
  });
  it('rejects overlapping grade bands before touching the database', async () => {
    const res = await request(app)
      .put('/api/grading-scales')
      .set(as('admin-token'))
      .send({
        academicPeriodId: null,
        bands: [
          { grade: 'A', minimumMark: 60, maximumMark: 100, gradePoint: 4, description: null },
          { grade: 'F', minimumMark: 0, maximumMark: 65, gradePoint: 0, description: null },
        ],
      })
      .expect(422);
    expect(res.body.error.message).toMatch(/overlap/);
    expect(state.userDb.rpcCalls).toHaveLength(0);
  });
  it('can read audit logs', async () => {
    await request(app).get('/api/audit-logs?entityType=results').set(as('admin-token')).expect(200);
    const q = state.userDb.calls.find((c) => c.table === 'audit_logs');
    expect(q.filters).toContainEqual(['eq', 'entity_type', 'results']);
  });
});

describe('course deletion', () => {
  it('deletes a course and its unmarked enrollments in one database call', async () => {
    state.userDb = createFakeDb({ 'rpc:delete_course': () => ({ data: { enrollments: 3, emptyResults: 1 } }) });
    await request(app).delete(`/api/courses/${ids.otherCourse}`).set(as('admin-token')).expect(204);
    expect(state.userDb.rpcCalls).toEqual([{ name: 'delete_course', args: { p_course_id: ids.otherCourse } }]);
    // No piecemeal deletes from the API: the function does it atomically.
    expect(state.userDb.calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('passes on the reason when marks have been entered (422)', async () => {
    const message = 'This course cannot be deleted because marks have been entered for 2 student(s). Courses with marks are kept as academic records.';
    state.userDb = createFakeDb({ 'rpc:delete_course': () => ({ error: { code: 'P0001', message } }) });
    const res = await request(app).delete(`/api/courses/${ids.assignedCourse}`).set(as('admin-token')).expect(422);
    expect(res.body.error.message).toBe(message);
  });

  it('returns 404 for a course that does not exist', async () => {
    state.userDb = createFakeDb({ 'rpc:delete_course': () => ({ error: { code: 'P0002', message: 'Course not found' } }) });
    await request(app).delete(`/api/courses/${ids.otherCourse}`).set(as('admin-token')).expect(404);
  });

  it.each(['lecturer-token', 'student-token'])('forbids %s from deleting courses', async (token) => {
    await request(app).delete(`/api/courses/${ids.assignedCourse}`).set(as(token)).expect(403);
    expect(state.userDb.rpcCalls).toEqual([]);
  });
});

describe('reports overview', () => {
  it('splits enrolled students into published, ready to publish and incomplete', async () => {
    state.userDb = createFakeDb({
      course_result_summary: () => ({
        data: [
          { enrolled: 10, published: 6, ready_to_publish: 3, incomplete: 1, pass_count: 7, fail_count: 2 },
          { enrolled: 5, published: 0, ready_to_publish: 2, incomplete: 3, pass_count: 1, fail_count: 1 },
        ],
      }),
    });
    const res = await request(app).get('/api/reports/overview').set(as('admin-token')).expect(200);
    expect(res.body.data).toMatchObject({ publishedResults: 6, readyToPublish: 5, incompleteResults: 4, passCount: 8, failCount: 3 });
  });
});

describe('error handling', () => {
  it('returns 404 JSON for unknown endpoints', async () => {
    const res = await request(app).get('/api/nope').set(as('admin-token')).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('does not leak database error details', async () => {
    state.userDb = createFakeDb({ courses: () => ({ data: null, error: { code: 'XX000', message: 'secret internal detail' } }) });
    const res = await request(app).get('/api/courses').set(as('admin-token')).expect(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
  it('maps unique violations to 409', async () => {
    state.userDb = createFakeDb({ departments: () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) });
    const res = await request(app).post('/api/departments').set(as('admin-token')).send({ name: 'Physics', code: 'PHY' }).expect(409);
    expect(res.body.error.message).toMatch(/already exists/);
  });
});
