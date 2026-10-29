-- RLS and trigger tests. Run with: supabase test db
-- Uses fictional users created inside a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------- fixtures (as postgres, RLS bypassed)
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin.t@example.edu', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'lect1.t@example.edu', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'lect2.t@example.edu', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'stud1.t@example.edu', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'stud2.t@example.edu', 'authenticated', 'authenticated');

insert into public.profiles (id, full_name, email, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Test Admin', 'admin.t@example.edu', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Test Lecturer One', 'lect1.t@example.edu', 'lecturer'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Test Lecturer Two', 'lect2.t@example.edu', 'lecturer'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'Test Student One', 'stud1.t@example.edu', 'student'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'Test Student Two', 'stud2.t@example.edu', 'student');

insert into public.departments (id, department_name, department_code) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Test Department', 'TST');
insert into public.programmes (id, programme_name, programme_code, department_id) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Test Programme', 'TST-P', 'bbbbbbbb-0000-4000-8000-000000000001');
insert into public.lecturers (id, profile_id, staff_number, department_id) values
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'TST/L1', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003', 'TST/L2', 'bbbbbbbb-0000-4000-8000-000000000001');
insert into public.students (id, profile_id, registration_number, programme_id, year_of_study) values
  ('dddddddd-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000004', 'TST/0001', 'bbbbbbbb-0000-4000-8000-000000000002', 1),
  ('dddddddd-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000005', 'TST/0002', 'bbbbbbbb-0000-4000-8000-000000000002', 1);
insert into public.courses (id, course_code, course_name, credit_units, department_id) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'TST 101', 'Course A (lecturer one)', 3, 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'TST 102', 'Course B (lecturer two)', 3, 'bbbbbbbb-0000-4000-8000-000000000001');
insert into public.academic_periods (id, academic_year, semester, start_date, end_date, status) values
  ('ffffffff-0000-4000-8000-000000000001', '2030/2031', 1, '2030-09-01', '2031-01-31', 'active');
insert into public.course_assignments (lecturer_id, course_id, academic_period_id) values
  ('cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000001');
insert into public.enrollments (id, student_id, course_id, academic_period_id) values
  ('99999999-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001'),
  ('99999999-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000001'),
  ('99999999-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001');

-- Grading scale for the test period (A >= 70, B 60-69.99, C 50-59.99, F < 50).
insert into public.grading_scales (academic_period_id, grade, minimum_mark, maximum_mark, grade_point) values
  ('ffffffff-0000-4000-8000-000000000001', 'A', 70, 100, 4),
  ('ffffffff-0000-4000-8000-000000000001', 'B', 60, 69.99, 3),
  ('ffffffff-0000-4000-8000-000000000001', 'C', 50, 59.99, 2),
  ('ffffffff-0000-4000-8000-000000000001', 'F', 0, 49.99, 0);
update public.evaluation_settings set lecturer_can_publish = false, lecturer_can_correct = false where id = 1;

-- Results: student one has a PUBLISHED result in course A and a DRAFT in course B;
-- student two has a published result in course A.
insert into public.results (id, enrollment_id, coursework_mark, examination_mark, publication_status) values
  ('12121212-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000001', 30, 40, 'published'),
  ('12121212-0000-4000-8000-000000000002', '99999999-0000-4000-8000-000000000002', 20, 25, 'draft'),
  ('12121212-0000-4000-8000-000000000003', '99999999-0000-4000-8000-000000000003', 35, 50, 'published');

select is((select grade from public.results where id = '12121212-0000-4000-8000-000000000001'), 'A',
  'trigger computes the grade from the scale');

-- ---------------------------------------------------------------- student one
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000004","role":"authenticated"}';

select results_eq('select id from public.results',
  $$ values ('12121212-0000-4000-8000-000000000001'::uuid) $$,
  'student sees only their own PUBLISHED results (not drafts, not other students)');

select is((select count(*)::int from public.result_details where student_id = 'dddddddd-0000-4000-8000-000000000005'), 0,
  'student cannot read another student''s results through views');

select is((select count(*)::int from public.students), 1, 'student sees only their own student record');

select throws_ok(
  $$ insert into public.results (enrollment_id, coursework_mark, examination_mark)
     values ('99999999-0000-4000-8000-000000000002', 40, 60) $$,
  '42501', null, 'student cannot insert results');

update public.results set coursework_mark = 40 where id = '12121212-0000-4000-8000-000000000001';
select is((select count(*)::int from public.results where coursework_mark = 40), 0, 'student update of marks has no effect');

update public.profiles set full_name = 'Hacked' where id = 'aaaaaaaa-0000-4000-8000-000000000004';
select is((select full_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000004'), 'Test Student One',
  'student cannot modify their own profile');

select throws_ok($$ insert into public.audit_logs (action, entity_type) values ('FAKE', 'results') $$,
  '42501', null, 'student cannot write audit logs');

select is((select count(*)::int from public.audit_logs), 0, 'student cannot read audit logs');

-- ---------------------------------------------------------------- lecturer one (assigned to course A only)
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';

select is((select count(*)::int from public.results), 2, 'lecturer sees results of assigned course only (2 in course A)');

update public.results set coursework_mark = 1 where id = '12121212-0000-4000-8000-000000000002';
reset role;
select is((select coursework_mark from public.results where id = '12121212-0000-4000-8000-000000000002'), 20.00::numeric,
  'lecturer cannot edit a result of an unassigned course');

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ update public.results set coursework_mark = 31, correction_reason = 'Re-marked script'
     where id = '12121212-0000-4000-8000-000000000001' $$,
  '42501', null, 'lecturer cannot correct a published result without permission');

select throws_ok(
  $$ insert into public.results (enrollment_id, coursework_mark, examination_mark)
     values ('99999999-0000-4000-8000-000000000002', 10, 10) $$,
  '42501', null, 'lecturer cannot insert results for an unassigned course');

-- ---------------------------------------------------------------- admin
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::int from public.results), 3, 'admin sees all results');

select lives_ok(
  $$ update public.results set coursework_mark = 25, examination_mark = 30, grade = 'A'
     where id = '12121212-0000-4000-8000-000000000002' $$,
  'admin can edit a draft result');

select is((select grade from public.results where id = '12121212-0000-4000-8000-000000000002'), 'C',
  'client-supplied grade is overridden by the trigger (55 => C)');

select is((select version from public.results where id = '12121212-0000-4000-8000-000000000002'), 2,
  'version increments on update (optimistic locking)');

select ok(exists (
  select 1 from public.audit_logs
  where entity_type = 'results' and entity_id = '12121212-0000-4000-8000-000000000002'
    and action = 'UPDATE' and actor_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'result update creates an audit record with the acting user');

select throws_ok(
  $$ update public.results set examination_mark = 61 where id = '12121212-0000-4000-8000-000000000002' $$,
  '23514', null, 'marks above the configured maximum are rejected');

select throws_ok(
  $$ update public.results set examination_mark = null, publication_status = 'published'
     where id = '12121212-0000-4000-8000-000000000002' $$,
  null, 'incomplete results cannot be published');

select throws_ok(
  $$ update public.results set coursework_mark = 26 where id = '12121212-0000-4000-8000-000000000001' $$,
  'P0001', 'A reason is required to correct a published result', 'correcting a published result requires a reason');

select lives_ok(
  $$ update public.results set coursework_mark = 26, correction_reason = 'Moderation adjustment'
     where id = '12121212-0000-4000-8000-000000000001' $$,
  'admin can correct a published result with a reason');

select is((select publication_status::text from public.results where id = '12121212-0000-4000-8000-000000000001'), 'corrected',
  'corrected results are flagged as corrected');

select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'even admins cannot delete audit logs');

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000004' $$,
  '42501', 'Role cannot be changed', 'roles are immutable');

reset role;
select * from finish();
rollback;
