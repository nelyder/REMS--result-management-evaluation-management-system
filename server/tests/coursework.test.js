// API tests for coursework assignments and their student lists (fake Supabase, no database).
// The junction table is simulated in memory so add / duplicate / remove / visibility can be
// exercised end to end through Express; RLS and triggers are covered by the pgTAP and live tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createFakeDb } from './helpers/fakeSupabase.js';

// ---------------------------------------------------------------- fixtures (fictional)
const ids = {
  admin: '00000000-0000-4000-8000-0000000000a1',
  lecturer: '00000000-0000-4000-8000-0000000000b1',
  student: '00000000-0000-4000-8000-0000000000c1',
  lecturerRow: '10000000-0000-4000-8000-0000000000b1',
  amina: '20000000-0000-4000-8000-0000000000c1', // signed-in student
  brian: '20000000-0000-4000-8000-0000000000c2',
  chidi: '20000000-0000-4000-8000-0000000000c3',
  outsider: '20000000-0000-4000-8000-0000000000c9', // not enrolled on the course
  assignedCourse: '30000000-0000-4000-8000-000000000001',
  otherCourse: '30000000-0000-4000-8000-000000000002',
  period: '40000000-0000-4000-8000-000000000001',
  assignment: '70000000-0000-4000-8000-000000000001',
  otherAssignment: '70000000-0000-4000-8000-000000000002', // on otherCourse
  created: '70000000-0000-4000-8000-000000000009',
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
    student: { id: ids.amina, registration_number: 'REG/2025/0001', year_of_study: 1, programme: null },
  },
};
const tokens = { 'admin-token': ids.admin, 'lecturer-token': ids.lecturer, 'student-token': ids.student };

const enrolled = [
  { id: 'e1', student_id: ids.amina, full_name: 'Amina Test', registration_number: 'REG/2025/0001', programme_code: 'BSC-CS', year_of_study: 1, enrollment_status: 'enrolled' },
  { id: 'e2', student_id: ids.brian, full_name: 'Brian Sample', registration_number: 'REG/2025/0002', programme_code: 'BSC-CS', year_of_study: 1, enrollment_status: 'enrolled' },
  { id: 'e3', student_id: ids.chidi, full_name: 'Chidi Example', registration_number: 'REG/2025/0003', programme_code: 'BSC-CS', year_of_study: 1, enrollment_status: 'completed' },
];
const assignments = {
  [ids.assignment]: { id: ids.assignment, course_id: ids.assignedCourse, academic_period_id: ids.period },
  [ids.otherAssignment]: { id: ids.otherAssignment, course_id: ids.otherCourse, academic_period_id: ids.period },
  [ids.created]: { id: ids.created, course_id: ids.assignedCourse, academic_period_id: ids.period },
};
const overview = (id) => ({
  id,
  course_id: assignments[id].course_id,
  academic_period_id: ids.period,
  title: 'Essay on sorting algorithms',
  description: 'Compare merge sort and quicksort.',
  due_at: '2099-05-01T12:00:00+00:00',
  max_marks: '20.00',
  created_by: ids.lecturer,
  created_by_name: 'Lena Lecturer',
  course_code: 'CSC 201',
  course_name: 'Data Structures',
  academic_year: '2026/2027',
  semester: 1,
  start_date: '2026-09-01',
  period_status: 'active',
  assigned_count: 0,
});

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

let links; // in-memory assignment_students: [{ id, assignment_id, student_id, ... }]
let nextLink;

const filterValue = (ctx, op, column) => ctx.filters.find(([o, c]) => o === op && c === column)?.[2];
const enrolledById = (studentId) => enrolled.find((e) => e.student_id === studentId);

function makeAdminDb() {
  const db = createFakeDb({ profiles: (ctx) => ({ data: profiles[db.eqValue(ctx, 'id')] ?? null }) });
  db.auth = {
    getUser: async (token) =>
      tokens[token] ? { data: { user: { id: tokens[token] } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } },
  };
  return db;
}

function makeUserDb() {
  const linkRows = (ctx) => {
    let rows = links;
    const a = filterValue(ctx, 'eq', 'assignment_id');
    const s = filterValue(ctx, 'eq', 'student_id');
    if (a) rows = rows.filter((l) => l.assignment_id === a);
    if (s) rows = rows.filter((l) => l.student_id === s);
    return rows;
  };
  const db = createFakeDb({
    // Lecturer is assigned to assignedCourse only.
    course_assignments: (ctx) => {
      if (ctx.single) return { data: filterValue(ctx, 'eq', 'course_id') === ids.assignedCourse ? { id: 'ca1' } : null };
      return { data: [{ course_id: ids.assignedCourse }] };
    },
    courses: () => ({ data: { id: ids.assignedCourse } }),
    academic_periods: () => ({ data: { id: ids.period } }),
    enrollment_details: () => ({ data: enrolled }),
    assignments: (ctx) => {
      const row = assignments[filterValue(ctx, 'eq', 'id')] ?? null;
      return { data: row && (ctx.op === 'select' ? row : { id: row.id }) };
    },
    assignment_overview: (ctx) => {
      if (ctx.single) {
        const id = filterValue(ctx, 'eq', 'id');
        return { data: assignments[id] ? { ...overview(id), assigned_count: links.filter((l) => l.assignment_id === id).length } : null };
      }
      const wanted = filterValue(ctx, 'in', 'id');
      const rows = Object.keys(assignments)
        .filter((id) => !wanted || wanted.includes(id))
        .map(overview);
      return { data: rows, count: rows.length };
    },
    assignment_students: (ctx) => {
      if (ctx.op === 'upsert') {
        // ON CONFLICT (assignment_id, student_id) DO NOTHING: returns only inserted rows.
        const inserted = [];
        for (const row of ctx.payload) {
          if (links.some((l) => l.assignment_id === row.assignment_id && l.student_id === row.student_id)) continue;
          const link = { id: `link-${nextLink++}`, ...row, assigned_at: '2026-10-01T09:00:00Z', assignment_status: 'assigned' };
          links.push(link);
          inserted.push({ id: link.id });
        }
        return { data: inserted };
      }
      if (ctx.op === 'delete') {
        const victim = linkRows(ctx)[0] ?? null;
        if (victim) links = links.filter((l) => l !== victim);
        return { data: victim && { id: victim.id } };
      }
      const rows = linkRows(ctx);
      return { data: ctx.single ? rows[0] ?? null : rows };
    },
    assignment_student_details: (ctx) => ({
      data: linkRows(ctx).map((l) => {
        const e = enrolledById(l.student_id);
        return { ...l, full_name: e.full_name, registration_number: e.registration_number, programme_code: e.programme_code, year_of_study: 1 };
      }),
    }),
    'rpc:create_assignment': (args) => {
      for (const s of args.p_student_ids) {
        links.push({ id: `link-${nextLink++}`, assignment_id: ids.created, student_id: s, assigned_at: '2026-10-01T09:00:00Z', assignment_status: 'assigned' });
      }
      return { data: ids.created };
    },
    'rpc:set_assignment_students': (args) => {
      const before = links.filter((l) => l.assignment_id === args.p_assignment_id).length;
      const keep = links.filter((l) => l.assignment_id !== args.p_assignment_id || args.p_student_ids.includes(l.student_id));
      const removed = links.length - keep.length;
      links = keep;
      let added = 0;
      for (const s of args.p_student_ids) {
        if (links.some((l) => l.assignment_id === args.p_assignment_id && l.student_id === s)) continue;
        links.push({ id: `link-${nextLink++}`, assignment_id: args.p_assignment_id, student_id: s, assignment_status: 'assigned' });
        added++;
      }
      return { data: { added, removed, before } };
    },
  });
  return db;
}

const as = (token) => ({ Authorization: `Bearer ${token}` });
const future = '2099-05-01T12:00:00.000Z';
const validBody = (extra = {}) => ({
  title: 'Essay on sorting algorithms',
  description: 'Compare merge sort and quicksort.',
  courseId: ids.assignedCourse,
  academicPeriodId: ids.period,
  dueAt: future,
  maxMarks: 20,
  studentIds: [ids.amina, ids.brian],
  ...extra,
});

beforeEach(() => {
  links = [];
  nextLink = 1;
  state.adminDb = makeAdminDb();
  state.userDb = makeUserDb();
});

// ---------------------------------------------------------------- creating
describe('creating an assignment', () => {
  it('lets the assigned lecturer create it with selected students in one RPC', async () => {
    const res = await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody()).expect(201);
    const call = state.userDb.rpcCalls.find((c) => c.name === 'create_assignment');
    expect(call.args).toMatchObject({ p_course_id: ids.assignedCourse, p_period_id: ids.period, p_max_marks: 20, p_student_ids: [ids.amina, ids.brian] });
    expect(res.body.data).toMatchObject({ id: ids.created, title: 'Essay on sorting algorithms', maxMarks: 20, assignedCount: 2 });
  });

  it('de-duplicates repeated student ids before saving', async () => {
    await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody({ studentIds: [ids.amina, ids.amina] })).expect(201);
    expect(state.userDb.rpcCalls[0].args.p_student_ids).toEqual([ids.amina]);
  });

  it('allows an assignment with no students yet', async () => {
    await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody({ studentIds: [] })).expect(201);
  });

  it('refuses a lecturer who is not assigned to the course', async () => {
    const res = await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody({ courseId: ids.otherCourse })).expect(403);
    expect(res.body.error.message).toMatch(/not assigned/i);
    expect(state.userDb.rpcCalls).toHaveLength(0);
  });

  it('refuses students that are not enrolled on the course offering', async () => {
    const res = await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody({ studentIds: [ids.amina, ids.outsider] })).expect(422);
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ studentId: ids.outsider }));
    expect(state.userDb.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['a past due date', { dueAt: '2020-01-01T00:00:00.000Z' }, 'dueAt'],
    ['zero maximum marks', { maxMarks: 0 }, 'maxMarks'],
    ['more than 2 decimals', { maxMarks: 10.555 }, 'maxMarks'],
    ['a short title', { title: 'ab' }, 'title'],
    ['an invalid student id', { studentIds: ['not-a-uuid'] }, 'studentIds.0'],
  ])('rejects %s', async (_label, patch, path) => {
    const res = await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody(patch)).expect(400);
    expect(res.body.error.details.map((d) => d.path)).toContain(path);
  });

  it('rejects server-controlled fields (no mass assignment)', async () => {
    await request(app).post('/api/assignments').set(as('lecturer-token')).send(validBody({ createdBy: ids.admin })).expect(400);
  });

  it('is not available to students', async () => {
    await request(app).post('/api/assignments').set(as('student-token')).send(validBody()).expect(403);
  });
});

// ---------------------------------------------------------------- managing students
describe('managing assigned students', () => {
  const url = `/api/assignments/${ids.assignment}/students`;

  it('adds students and returns the updated list', async () => {
    const res = await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.amina, ids.chidi] }).expect(200);
    expect(res.body.data).toMatchObject({ added: 2, skipped: 0 });
    expect(res.body.data.students.map((s) => s.studentId).sort()).toEqual([ids.amina, ids.chidi].sort());
  });

  it('never duplicates a student who is already assigned', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.amina] }).expect(200);
    const res = await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.amina, ids.brian] }).expect(200);
    expect(res.body.data).toMatchObject({ added: 1, skipped: 1 });
    expect(links.filter((l) => l.student_id === ids.amina)).toHaveLength(1);
    const upsert = state.userDb.calls.find((c) => c.table === 'assignment_students' && c.op === 'upsert');
    expect(upsert.payload.every((r) => Object.keys(r).sort().join() === 'assignment_id,student_id')).toBe(true);
  });

  it('rejects adding a student who is not enrolled', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.outsider] }).expect(422);
    expect(links).toHaveLength(0);
  });

  it('requires at least one student when adding', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [] }).expect(400);
  });

  it('removes one student without touching anything else', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.amina, ids.brian] }).expect(200);
    const res = await request(app).delete(`${url}/${ids.amina}`).set(as('lecturer-token')).expect(200);
    expect(res.body.data.removedStudentId).toBe(ids.amina);
    expect(res.body.data.students.map((s) => s.studentId)).toEqual([ids.brian]);
    // Only the junction table is written: no student, enrollment or result changes.
    const writes = state.userDb.calls.filter((c) => c.op !== 'select');
    expect([...new Set(writes.map((c) => c.table))]).toEqual(['assignment_students']);
  });

  it('returns 404 when removing a student who is not assigned', async () => {
    await request(app).delete(`${url}/${ids.brian}`).set(as('lecturer-token')).expect(404);
  });

  it('replaces the whole list in one RPC', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.amina, ids.brian] }).expect(200);
    const res = await request(app).put(url).set(as('lecturer-token')).send({ studentIds: [ids.brian, ids.chidi] }).expect(200);
    expect(res.body.data).toMatchObject({ added: 1, removed: 1 });
    expect(res.body.data.students.map((s) => s.studentId).sort()).toEqual([ids.brian, ids.chidi].sort());
  });

  it('lists eligible students with their assigned flag', async () => {
    await request(app).post(url).set(as('lecturer-token')).send({ studentIds: [ids.brian] }).expect(200);
    const res = await request(app).get(`/api/assignments/${ids.assignment}/eligible-students`).set(as('lecturer-token')).expect(200);
    expect(res.body.data.map((e) => [e.studentId, e.assigned])).toEqual([
      [ids.amina, false],
      [ids.brian, true],
      [ids.chidi, false],
    ]);
    const q = state.userDb.calls.find((c) => c.table === 'enrollment_details');
    expect(q.filters).toContainEqual(['neq', 'enrollment_status', 'withdrawn']);
  });

  it('lists eligible students for a course offering before the assignment exists', async () => {
    const res = await request(app)
      .get(`/api/assignments/eligible-students?courseId=${ids.assignedCourse}&academicPeriodId=${ids.period}`)
      .set(as('lecturer-token'))
      .expect(200);
    expect(res.body.data).toHaveLength(3);
    await request(app)
      .get(`/api/assignments/eligible-students?courseId=${ids.otherCourse}&academicPeriodId=${ids.period}`)
      .set(as('lecturer-token'))
      .expect(403);
  });

  describe('a lecturer who is not assigned to the course', () => {
    const other = `/api/assignments/${ids.otherAssignment}`;
    it.each([
      ['get', other, undefined],
      ['patch', other, { title: 'Changed title' }],
      ['delete', other, undefined],
      ['get', `${other}/students`, undefined],
      ['get', `${other}/eligible-students`, undefined],
      ['post', `${other}/students`, { studentIds: [ids.amina] }],
      ['put', `${other}/students`, { studentIds: [] }],
      ['delete', `${other}/students/${ids.amina}`, undefined],
    ])('cannot %s %s', async (method, path, body) => {
      const res = await request(app)[method](path).set(as('lecturer-token')).send(body);
      expect(res.status).toBe(403);
      expect(state.userDb.calls.some((c) => c.op !== 'select')).toBe(false);
      expect(state.userDb.rpcCalls).toHaveLength(0);
    });
  });

  it('lets an admin manage any assignment', async () => {
    await request(app).post(`/api/assignments/${ids.otherAssignment}/students`).set(as('admin-token')).send({ studentIds: [ids.amina] }).expect(200);
  });

  it.each([
    ['post', url, { studentIds: [ids.amina] }],
    ['delete', `${url}/${ids.amina}`, undefined],
    ['get', '/api/assignments', undefined],
  ])('students cannot %s %s', async (method, path, body) => {
    await request(app)[method](path).set(as('student-token')).send(body).expect(403);
  });
});

// ---------------------------------------------------------------- editing
describe('editing an assignment', () => {
  it('updates only whitelisted columns', async () => {
    await request(app)
      .patch(`/api/assignments/${ids.assignment}`)
      .set(as('lecturer-token'))
      .send({ title: 'Revised essay', maxMarks: 25 })
      .expect(200);
    const update = state.userDb.calls.find((c) => c.table === 'assignments' && c.op === 'update');
    expect(update.payload).toEqual({ title: 'Revised essay', max_marks: 25 });
  });

  it('refuses to move an assignment to another course', async () => {
    await request(app).patch(`/api/assignments/${ids.assignment}`).set(as('lecturer-token')).send({ courseId: ids.otherCourse }).expect(400);
  });

  it('rejects an empty update', async () => {
    await request(app).patch(`/api/assignments/${ids.assignment}`).set(as('lecturer-token')).send({}).expect(400);
  });
});

// ---------------------------------------------------------------- student visibility
describe('student visibility', () => {
  const addAs = (studentIds) =>
    request(app).post(`/api/assignments/${ids.assignment}/students`).set(as('lecturer-token')).send({ studentIds });

  it('shows a student only the assignments they are assigned to', async () => {
    let res = await request(app).get('/api/students/me/assignments').set(as('student-token')).expect(200);
    expect(res.body.data).toEqual([]);

    await addAs([ids.brian]);
    res = await request(app).get('/api/students/me/assignments').set(as('student-token')).expect(200);
    expect(res.body.data).toEqual([]);

    await addAs([ids.amina]);
    res = await request(app).get('/api/students/me/assignments').set(as('student-token')).expect(200);
    expect(res.body.data.map((a) => a.id)).toEqual([ids.assignment]);
    expect(res.body.data[0]).toMatchObject({ title: 'Essay on sorting algorithms', status: 'assigned', maxMarks: 20 });
    expect(res.body.data[0]).not.toHaveProperty('assignedCount');
    expect(res.body.data[0]).not.toHaveProperty('createdBy');
    const q = state.userDb.calls.find((c) => c.table === 'assignment_students' && c.op === 'select');
    expect(q.filters).toContainEqual(['eq', 'student_id', ids.amina]);
  });

  it('hides the assignment again once the student is removed', async () => {
    await addAs([ids.amina]);
    await request(app).get(`/api/students/me/assignments/${ids.assignment}`).set(as('student-token')).expect(200);

    await request(app).delete(`/api/assignments/${ids.assignment}/students/${ids.amina}`).set(as('lecturer-token')).expect(200);

    const res = await request(app).get('/api/students/me/assignments').set(as('student-token')).expect(200);
    expect(res.body.data).toEqual([]);
    await request(app).get(`/api/students/me/assignments/${ids.assignment}`).set(as('student-token')).expect(404);
  });

  it('ignores a student id supplied by the client', async () => {
    await request(app).get(`/api/students/me/assignments?studentId=${ids.brian}`).set(as('student-token')).expect(400);
  });

  it('is only for students', async () => {
    await request(app).get('/api/students/me/assignments').set(as('lecturer-token')).expect(403);
  });
});
