// Live tests for coursework assignments against the real Supabase project in server/.env.
//
// Needs migration 20260301000100_assignments.sql applied, the demo data (`npm run seed:demo`),
// and LIVE_DEMO_PASSWORD. Students are checked through the Data API directly (anon key + their
// JWT, i.e. bypassing Express) and through the API. Everything created here is deleted in
// afterAll (the assignment, which cascades to its student links). Dev projects only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';

if (env.NODE_ENV === 'production') throw new Error('Refusing to run live tests with NODE_ENV=production.');
const DEMO_PASSWORD = process.env.LIVE_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('Set LIVE_DEMO_PASSWORD to the demo account password printed by `npm run seed:demo`.');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const app = createApp();
const api = (method, path, token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);
const rows = (r) => r.data ?? [];

async function login(email, password) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

let lecturer, s1, s2;
let s1Row, s2Row, offering, otherOffering, outsiderId;
const created = [];

beforeAll(async () => {
  const probe = await svc.from('assignments').select('id').limit(1);
  if (probe.error) throw new Error('The assignments table is missing. Apply supabase/migrations/20260301000100_assignments.sql first.');

  lecturer = await login('l.okafor@example.edu', DEMO_PASSWORD);
  const okafor = (await svc.from('lecturer_directory').select('id').eq('email', 'l.okafor@example.edu').single()).data;
  const teaching = rows(await svc.from('course_assignments').select('course_id, academic_period_id').eq('lecturer_id', okafor.id));
  const teaches = (e) => teaching.some((t) => t.course_id === e.course_id && t.academic_period_id === e.academic_period_id);

  // An offering Okafor teaches with at least two enrolled demo students who can sign in.
  const enrolled = rows(
    await svc.from('enrollment_details').select('student_id, course_id, academic_period_id, enrollment_status').neq('enrollment_status', 'withdrawn'),
  );
  const directory = rows(await svc.from('student_directory').select('id, email').like('email', 'student%@example.edu'));
  const emailOf = new Map(directory.map((d) => [d.id, d.email]));
  const byOffering = new Map();
  for (const e of enrolled.filter((x) => teaches(x) && emailOf.has(x.student_id))) {
    const key = `${e.course_id}|${e.academic_period_id}`;
    if (!byOffering.has(key)) byOffering.set(key, []);
    byOffering.get(key).push(e.student_id);
  }
  const [key, studentIds] = [...byOffering.entries()].find(([, list]) => list.length >= 2) ?? [];
  if (!key) throw new Error('Demo data has no offering taught by l.okafor with two enrolled students.');
  const [courseId, academicPeriodId] = key.split('|');
  offering = { courseId, academicPeriodId };
  [s1Row, s2Row] = studentIds;
  outsiderId = directory.map((d) => d.id).find((id) => !studentIds.includes(id));
  const other = enrolled.find((e) => !teaches(e));
  otherOffering = other && { courseId: other.course_id, academicPeriodId: other.academic_period_id };

  s1 = await login(emailOf.get(s1Row), DEMO_PASSWORD);
  s2 = await login(emailOf.get(s2Row), DEMO_PASSWORD);
});

afterAll(async () => {
  for (const id of created) {
    const { error } = await svc.from('assignments').delete().eq('id', id);
    if (error) console.error(`Could not delete test assignment ${id}: ${error.message}`);
  }
});

const dueAt = () => new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

describe('coursework assignments (live)', () => {
  let assignmentId;

  it('assigned lecturer creates an assignment for one student', async () => {
    const res = await api('post', '/assignments', lecturer.token).send({
      title: 'LIVE TEST essay (safe to delete)',
      description: 'Created by assignments.live.test.js',
      ...offering,
      dueAt: dueAt(),
      maxMarks: 15,
      studentIds: [s1Row],
    });
    expect(res.status).toBe(201);
    assignmentId = res.body.data.id;
    created.push(assignmentId);
    expect(res.body.data.assignedCount).toBe(1);
  });

  it('the assigned student sees it through the Data API and the API; the other student does not', async () => {
    expect(rows(await s1.client.from('assignments').select('id').eq('id', assignmentId))).toHaveLength(1);
    expect(rows(await s2.client.from('assignments').select('id').eq('id', assignmentId))).toHaveLength(0);
    expect((await api('get', `/students/me/assignments/${assignmentId}`, s1.token)).status).toBe(200);
    expect((await api('get', `/students/me/assignments/${assignmentId}`, s2.token)).status).toBe(404);
    const list = await api('get', '/students/me/assignments', s2.token);
    expect(list.body.data.map((a) => a.id)).not.toContain(assignmentId);
  });

  it('adding a student makes it visible to them; adding again does not duplicate', async () => {
    let res = await api('post', `/assignments/${assignmentId}/students`, lecturer.token).send({ studentIds: [s2Row] });
    expect(res.body.data).toMatchObject({ added: 1, skipped: 0 });
    res = await api('post', `/assignments/${assignmentId}/students`, lecturer.token).send({ studentIds: [s1Row, s2Row] });
    expect(res.body.data).toMatchObject({ added: 0, skipped: 2 });
    const links = rows(await svc.from('assignment_students').select('student_id').eq('assignment_id', assignmentId));
    expect(links.map((l) => l.student_id).sort()).toEqual([s1Row, s2Row].sort());
    expect(rows(await s2.client.from('assignments').select('id').eq('id', assignmentId))).toHaveLength(1);
  });

  it('the database rejects a duplicate link even when Express is bypassed', async () => {
    const res = await lecturer.client.from('assignment_students').insert({ assignment_id: assignmentId, student_id: s1Row });
    expect(res.error?.code).toBe('23505');
  });

  it('a student cannot add themselves, or remove anyone, through the Data API', async () => {
    await api('delete', `/assignments/${assignmentId}/students/${s2Row}`, lecturer.token).expect(200);
    const insert = await s2.client.from('assignment_students').insert({ assignment_id: assignmentId, student_id: s2Row });
    expect(insert.error).toBeTruthy();
    const del = await s1.client.from('assignment_students').delete().eq('assignment_id', assignmentId).select('id');
    expect(rows(del)).toHaveLength(0);
    // Re-add for the next test.
    await api('post', `/assignments/${assignmentId}/students`, lecturer.token).send({ studentIds: [s2Row] }).expect(200);
  });

  it('removing a student hides the assignment from them and keeps their enrollment', async () => {
    const before = rows(await svc.from('enrollments').select('id, enrollment_status').eq('student_id', s2Row));
    await api('delete', `/assignments/${assignmentId}/students/${s2Row}`, lecturer.token).expect(200);
    expect(rows(await s2.client.from('assignments').select('id').eq('id', assignmentId))).toHaveLength(0);
    expect((await api('get', `/students/me/assignments/${assignmentId}`, s2.token)).status).toBe(404);
    expect(rows(await svc.from('enrollments').select('id, enrollment_status').eq('student_id', s2Row))).toEqual(before);
    // Still visible to the student who was not removed.
    expect(rows(await s1.client.from('assignments').select('id').eq('id', assignmentId))).toHaveLength(1);
  });

  it('refuses a student who is not enrolled on the course offering', async () => {
    if (!outsiderId) return;
    const res = await api('post', `/assignments/${assignmentId}/students`, lecturer.token).send({ studentIds: [outsiderId] });
    expect(res.status).toBe(422);
    const direct = await lecturer.client.from('assignment_students').insert({ assignment_id: assignmentId, student_id: outsiderId });
    expect(direct.error).toBeTruthy();
  });

  it('a lecturer cannot create an assignment for a course they do not teach', async () => {
    if (!otherOffering) return;
    const res = await api('post', '/assignments', lecturer.token).send({
      title: 'LIVE TEST should fail',
      ...otherOffering,
      dueAt: dueAt(),
      maxMarks: 10,
      studentIds: [],
    });
    expect(res.status).toBe(403);
    const direct = await lecturer.client.from('assignments').insert({
      course_id: otherOffering.courseId,
      academic_period_id: otherOffering.academicPeriodId,
      title: 'LIVE TEST direct insert should fail',
      due_at: dueAt(),
      max_marks: 10,
    }).select('id');
    expect(direct.error).toBeTruthy();
    if (direct.data?.[0]?.id) created.push(direct.data[0].id);
  });
});
