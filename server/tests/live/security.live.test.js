// Live security tests against the real Supabase project in server/.env.
//
// They call the Data API directly with the public anon key + each role's JWT (exactly what an
// attacker could do, bypassing Express), plus the Express API in-process for the HTTP rules.
//
// Requires the demo data (`npm run seed:demo -w server`) and, in the environment or server/.env:
//   LIVE_DEMO_PASSWORD   password printed by seed:demo (or the DEMO_PASSWORD you seeded with)
//   LIVE_ADMIN_EMAIL / LIVE_ADMIN_PASSWORD   optional; enables the admin checks
// Everything the tests change (evaluation settings, result rows) is restored in afterAll.
// The restores are made with the service role, so they appear in audit_logs with actor = null.
// Run against development projects only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';

if (env.NODE_ENV === 'production') throw new Error('Refusing to run live tests with NODE_ENV=production.');
const DEMO_PASSWORD = process.env.LIVE_DEMO_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('Set LIVE_DEMO_PASSWORD to the demo account password printed by `npm run seed:demo`.');
const ADMIN = process.env.LIVE_ADMIN_EMAIL && process.env.LIVE_ADMIN_PASSWORD
  ? { email: process.env.LIVE_ADMIN_EMAIL, password: process.env.LIVE_ADMIN_PASSWORD }
  : null;

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const app = createApp();
const RESULT_FIELDS = 'id, coursework_mark, examination_mark, publication_status, correction_reason, version';

async function login(email, password) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

const rows = (r) => r.data ?? [];
const blocked = (r) => !!r.error || rows(r).length === 0;
const getResult = async (id) => (await svc.from('results').select(RESULT_FIELDS).eq('id', id).single()).data;
const api = (method, path, token) => request(app)[method](`/api${path}`).set('Authorization', `Bearer ${token}`);

// ---------------------------------------------------------------- restore bookkeeping
let originalSettings;
const touched = new Map(); // result id -> row before the first change
async function remember(...ids) {
  for (const id of ids) if (!touched.has(id)) touched.set(id, await getResult(id));
}
const setSettings = async (patch) => {
  const { error } = await svc.from('evaluation_settings').update(patch).eq('id', 1);
  if (error) throw error;
};
const changedMark = (m) => (Number(m) === 10 ? 11 : 10);
// PATCH /results/:id takes both marks; keep the exam mark and change coursework.
const marks = (row, courseworkMark) => ({ courseworkMark, examinationMark: row.examination_mark === null ? null : Number(row.examination_mark) });

// ---------------------------------------------------------------- fixtures (demo data)
let anon, student, lecturer, admin;
let all, s1, ownPublished, otherStudentResult, unassigned, assignedDraft, assignedPublished, offeringResults;

beforeAll(async () => {
  originalSettings = (await svc.from('evaluation_settings').select('lecturer_can_publish, lecturer_can_correct').eq('id', 1).single()).data;

  all = rows(await svc.from('result_details').select('id, student_id, course_id, academic_period_id, result_status, publication_status, version'));
  s1 = (await svc.from('student_directory').select('id').eq('email', 'student1@example.edu').maybeSingle()).data;
  const okafor = (await svc.from('lecturer_directory').select('id').eq('email', 'l.okafor@example.edu').maybeSingle()).data;
  if (!s1 || !okafor || !all.length) throw new Error('Demo data not found. Run `npm run seed:demo -w server` first.');
  const assignments = rows(await svc.from('course_assignments').select('course_id, academic_period_id').eq('lecturer_id', okafor.id));
  const teaches = (r) => assignments.some((a) => a.course_id === r.course_id && a.academic_period_id === r.academic_period_id);

  ownPublished = all.filter((r) => r.student_id === s1.id && ['published', 'corrected'].includes(r.publication_status));
  otherStudentResult = all.find((r) => r.student_id !== s1.id);
  unassigned = all.find((r) => !teaches(r));
  assignedDraft = all.find((r) => teaches(r) && r.publication_status === 'draft' && r.result_status !== 'incomplete');
  assignedPublished = all.find((r) => teaches(r) && ['published', 'corrected'].includes(r.publication_status));
  if (!ownPublished.length || !unassigned || !assignedDraft || !assignedPublished) {
    throw new Error('Demo data is missing a required case (re-run seed:demo on a fresh project).');
  }
  offeringResults = all.filter((r) => r.course_id === assignedDraft.course_id && r.academic_period_id === assignedDraft.academic_period_id);

  anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
  student = await login('student1@example.edu', DEMO_PASSWORD);
  lecturer = await login('l.okafor@example.edu', DEMO_PASSWORD);
  if (ADMIN) admin = await login(ADMIN.email, ADMIN.password);
});

afterAll(async () => {
  for (const [id, row] of touched) {
    const { error } = await svc
      .from('results')
      .update({
        coursework_mark: row.coursework_mark,
        examination_mark: row.examination_mark,
        publication_status: row.publication_status,
        correction_reason: row.correction_reason,
      })
      .eq('id', id);
    if (error) console.error(`Could not restore result ${id}: ${error.message}`);
  }
  if (originalSettings) await setSettings(originalSettings);
});

// ---------------------------------------------------------------- anonymous
describe('anonymous visitor (public anon key only)', () => {
  it.each(['results', 'profiles', 'students', 'result_details', 'audit_logs', 'enrollments'])('cannot read %s', async (table) => {
    expect(blocked(await anon.from(table).select('*').limit(1))).toBe(true);
  });
});

// ---------------------------------------------------------------- student
describe('student, via the Data API directly', () => {
  it('sees exactly their own published results', async () => {
    const ids = rows(await student.client.from('results').select('id')).map((r) => r.id).sort();
    expect(ids).toEqual(ownPublished.map((r) => r.id).sort());
  });
  it('cannot read another student’s result, even by id', async () => {
    expect(blocked(await student.client.from('results').select('id').eq('id', otherStudentResult.id))).toBe(true);
  });
  it('sees only their own profile and student record', async () => {
    expect(rows(await student.client.from('profiles').select('id'))).toEqual([{ id: student.userId }]);
    expect(rows(await student.client.from('students').select('id'))).toEqual([{ id: s1.id }]);
  });
  it('cannot see draft or submitted results through the views', async () => {
    expect(rows(await student.client.from('result_details').select('id').in('publication_status', ['draft', 'submitted']))).toEqual([]);
  });
  it('cannot read audit logs', async () => {
    expect(rows(await student.client.from('audit_logs').select('id').limit(1))).toEqual([]);
  });
  it('cannot edit marks on their own published result', async () => {
    const target = ownPublished[0].id;
    const before = await getResult(target);
    await student.client.from('results').update({ coursework_mark: 40, examination_mark: 60 }).eq('id', target);
    expect(await getResult(target)).toEqual(before);
  });
  it('cannot insert a result', async () => {
    const enrollment = (await svc.from('enrollments').select('id').eq('student_id', s1.id).limit(1).single()).data;
    expect((await student.client.from('results').insert({ enrollment_id: enrollment.id, coursework_mark: 40, examination_mark: 60 })).error).toBeTruthy();
  });
  it('cannot change their own role', async () => {
    await student.client.from('profiles').update({ role: 'admin' }).eq('id', student.userId);
    expect((await svc.from('profiles').select('role').eq('id', student.userId).single()).data.role).toBe('student');
  });
  it('cannot write audit logs or call staff/admin functions', async () => {
    expect((await student.client.from('audit_logs').insert({ action: 'FAKE', entity_type: 'results' })).error).toBeTruthy();
    const { course_id, academic_period_id } = otherStudentResult;
    expect((await student.client.rpc('transition_course_results', { p_course_id: course_id, p_period_id: academic_period_id, p_target: 'published' })).error).toBeTruthy();
    expect((await student.client.rpc('create_person_record', { p_profile_id: student.userId, p_full_name: 'X Y', p_email: 'x@example.edu', p_role: 'admin' })).error).toBeTruthy();
  });
  it('cannot change evaluation settings', async () => {
    expect(blocked(await student.client.from('evaluation_settings').update({ lecturer_can_publish: true }).eq('id', 1).select())).toBe(true);
  });
  it('is refused by staff API endpoints', async () => {
    await api('get', '/results', student.token).expect(403);
    await api('get', `/students/${s1.id}/statement`, student.token).expect(403);
    await api('patch', `/results/${ownPublished[0].id}`, student.token).send({ courseworkMark: 40, version: 1 }).expect(403);
  });
});

// ---------------------------------------------------------------- lecturer boundaries
describe('lecturer, course assignment boundaries', () => {
  it('sees only results of assigned courses', async () => {
    const ids = new Set(rows(await lecturer.client.from('results').select('id')).map((r) => r.id));
    expect(ids.has(assignedDraft.id)).toBe(true);
    expect(ids.has(unassigned.id)).toBe(false);
  });
  it('cannot edit an unassigned course result (Data API and Express)', async () => {
    const before = await getResult(unassigned.id);
    await lecturer.client.from('results').update({ coursework_mark: 1 }).eq('id', unassigned.id);
    await api('patch', `/results/${unassigned.id}`, lecturer.token).send({ ...marks(before, 1), version: before.version }).expect((res) => {
      expect([403, 404]).toContain(res.status);
    });
    expect(await getResult(unassigned.id)).toEqual(before);
  });
  it('cannot assign a course to themselves', async () => {
    const { data: me } = await svc.from('lecturers').select('id').eq('profile_id', lecturer.userId).single();
    const r = await lecturer.client.from('course_assignments').insert({ lecturer_id: me.id, course_id: unassigned.course_id, academic_period_id: unassigned.academic_period_id });
    expect(r.error).toBeTruthy();
  });
  it('sees audit history only for results', async () => {
    const entityTypes = new Set(rows(await lecturer.client.from('audit_logs').select('entity_type')).map((a) => a.entity_type));
    expect([...entityTypes].every((t) => t === 'results')).toBe(true);
  });
});

// ---------------------------------------------------------------- publication workflow, settings OFF
describe('publication workflow with lecturer publishing and correcting disabled', () => {
  beforeAll(() => setSettings({ lecturer_can_publish: false, lecturer_can_correct: false }));

  it('lecturer cannot publish a draft by writing the row directly', async () => {
    const before = await getResult(assignedDraft.id);
    const r = await lecturer.client.from('results').update({ publication_status: 'published' }).eq('id', assignedDraft.id).select();
    expect(r.error?.code).toBe('42501');
    expect(await getResult(assignedDraft.id)).toEqual(before);
  });
  it('lecturer cannot publish the course through the RPC', async () => {
    const r = await lecturer.client.rpc('transition_course_results', {
      p_course_id: assignedDraft.course_id, p_period_id: assignedDraft.academic_period_id, p_target: 'published',
    });
    expect(r.error).toBeTruthy();
    expect((await getResult(assignedDraft.id)).publication_status).toBe('draft');
  });
  it('lecturer cannot publish through the API', async () => {
    await api('post', `/results/${assignedDraft.id}/publish`, lecturer.token).expect(403);
  });
  it('lecturer cannot correct a published result', async () => {
    const before = await getResult(assignedPublished.id);
    const r = await lecturer.client.from('results')
      .update({ coursework_mark: changedMark(before.coursework_mark), correction_reason: 'Live test correction' })
      .eq('id', assignedPublished.id).select();
    expect(r.error?.code).toBe('42501');
    expect(await getResult(assignedPublished.id)).toEqual(before);
  });
  it('submitting locks the results against further lecturer edits', async () => {
    await remember(...offeringResults.map((r) => r.id));
    const res = await api('post', `/courses/${assignedDraft.course_id}/results/submit`, lecturer.token)
      .send({ academicPeriodId: assignedDraft.academic_period_id }).expect(200);
    expect(res.body.data.count).toBeGreaterThan(0);
    const submitted = await getResult(assignedDraft.id);
    expect(submitted.publication_status).toBe('submitted');
    await api('patch', `/results/${assignedDraft.id}`, lecturer.token)
      .send({ ...marks(submitted, changedMark(submitted.coursework_mark)), version: submitted.version }).expect(403);
    // Direct write is refused by the database too.
    expect((await lecturer.client.from('results').update({ coursework_mark: 1 }).eq('id', assignedDraft.id).select()).error?.code).toBe('42501');
    await api('post', `/courses/${assignedDraft.course_id}/results/return`, lecturer.token)
      .send({ academicPeriodId: assignedDraft.academic_period_id }).expect(403);
  });
});

// ---------------------------------------------------------------- publication workflow, settings ON
describe('publication workflow with lecturer publishing and correcting enabled', () => {
  beforeAll(async () => {
    // Undo the submit from the previous block so the draft is editable again.
    for (const [id, row] of touched) await svc.from('results').update({ publication_status: row.publication_status }).eq('id', id);
    await setSettings({ lecturer_can_publish: true, lecturer_can_correct: true });
  });

  it('lecturer can publish a complete draft, and it becomes visible to the student', async () => {
    await remember(assignedDraft.id);
    const res = await api('post', `/results/${assignedDraft.id}/publish`, lecturer.token).expect(200);
    expect(res.body.data.publicationStatus).toBe('published');
    const owner = all.find((r) => r.id === assignedDraft.id).student_id;
    const visible = await svc.from('result_details').select('id').eq('student_id', owner).in('publication_status', ['published', 'corrected']);
    expect(rows(visible).map((r) => r.id)).toContain(assignedDraft.id);
  });
  it('a correction requires a reason', async () => {
    const current = await getResult(assignedPublished.id);
    const res = await api('patch', `/results/${assignedPublished.id}`, lecturer.token)
      .send({ ...marks(current, changedMark(current.coursework_mark)), version: current.version });
    expect([400, 422]).toContain(res.status);
    expect(await getResult(assignedPublished.id)).toEqual(current);
  });
  it('a correction with a reason marks the result corrected and is audit-logged with the actor', async () => {
    await remember(assignedPublished.id);
    const current = await getResult(assignedPublished.id);
    const newMark = changedMark(current.coursework_mark);
    const res = await api('patch', `/results/${assignedPublished.id}`, lecturer.token)
      .send({ ...marks(current, newMark), version: current.version, reason: 'Live test: script re-marked' }).expect(200);
    expect(res.body.data.publicationStatus).toBe('corrected');
    const log = (await svc.from('audit_logs').select('action, actor_id, previous_values, new_values')
      .eq('entity_type', 'results').eq('entity_id', assignedPublished.id).order('id', { ascending: false }).limit(1).single()).data;
    expect(log.action).toBe('CORRECT');
    expect(log.actor_id).toBe(lecturer.userId);
    expect(Number(log.previous_values.coursework_mark)).toBe(Number(current.coursework_mark));
    expect(Number(log.new_values.coursework_mark)).toBe(newMark);
    expect(log.new_values.correction_reason).toBe('Live test: script re-marked');
  });
});

// ---------------------------------------------------------------- audit trail
describe('audit trail', () => {
  it('a draft edit records actor, previous and new values', async () => {
    const draft = all.find((r) => r.id !== assignedDraft.id && offeringResults.some((o) => o.id === r.id) && r.publication_status === 'draft');
    const target = draft?.id ?? assignedDraft.id;
    await remember(target);
    // Make sure the target is a draft (an earlier block may have published it).
    await svc.from('results').update({ publication_status: 'draft' }).eq('id', target);
    const current = await getResult(target);
    const newMark = changedMark(current.coursework_mark);
    await api('patch', `/results/${target}`, lecturer.token).send({ ...marks(current, newMark), version: current.version }).expect(200);
    const log = (await svc.from('audit_logs').select('action, actor_id, previous_values, new_values')
      .eq('entity_type', 'results').eq('entity_id', target).order('id', { ascending: false }).limit(1).single()).data;
    expect(log).toMatchObject({ action: 'UPDATE', actor_id: lecturer.userId });
    expect(Number(log.previous_values.coursework_mark)).toBe(Number(current.coursework_mark));
    expect(Number(log.new_values.coursework_mark)).toBe(newMark);
  });
  it('audit rows cannot be altered, even with the service role', async () => {
    const row = (await svc.from('audit_logs').select('id, action').order('id', { ascending: false }).limit(1).single()).data;
    // A same-value update: harmless if the guard were missing, still rejected by the trigger.
    const r = await svc.from('audit_logs').update({ action: row.action }).eq('id', row.id);
    expect(r.error).toBeTruthy();
  });
  it('lecturers cannot delete audit rows', async () => {
    const count = async () => (await svc.from('audit_logs').select('*', { count: 'exact', head: true })).count;
    const before = await count();
    await lecturer.client.from('audit_logs').delete().eq('entity_type', 'results');
    expect(await count()).toBeGreaterThanOrEqual(before);
  });
});

// ---------------------------------------------------------------- concurrency
describe('concurrent edits (optimistic locking)', () => {
  let target;
  beforeAll(async () => {
    target = assignedDraft.id;
    await remember(target);
    await svc.from('results').update({ publication_status: 'draft' }).eq('id', target);
  });

  it('two simultaneous API saves with the same version: one succeeds, one gets 409', async () => {
    const current = await getResult(target);
    const send = (mark) => api('patch', `/results/${target}`, lecturer.token).send({ ...marks(current, mark), version: current.version });
    const statuses = (await Promise.all([send(12), send(13)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect((await getResult(target)).version).toBe(current.version + 1);
  });
  it('the database applies only one of two racing versioned writes', async () => {
    const current = await getResult(target);
    const write = (mark) => lecturer.client.from('results').update({ coursework_mark: mark })
      .eq('id', target).eq('version', current.version).select('id');
    const results = await Promise.all([write(14), write(15)]);
    expect(results.map((r) => rows(r).length).sort()).toEqual([0, 1]);
    expect((await getResult(target)).version).toBe(current.version + 1);
  });
});

// ---------------------------------------------------------------- admin
describe.skipIf(!ADMIN)('administrator', () => {
  it('sees every result', async () => {
    expect(rows(await admin.client.from('results').select('id')).length).toBe(all.length);
  });
  it('gets a student statement with published results only', async () => {
    const res = await api('get', `/students/${s1.id}/statement`, admin.token).expect(200);
    const statuses = new Set(res.body.data.results.map((r) => r.publicationStatus));
    expect([...statuses].every((s) => ['published', 'corrected'].includes(s))).toBe(true);
    expect(res.body.data.results.length).toBe(ownPublished.length);
  });
  it('cannot delete audit logs', async () => {
    const r = await admin.client.from('audit_logs').delete().eq('entity_type', 'results').select();
    expect(blocked(r)).toBe(true);
  });
});
