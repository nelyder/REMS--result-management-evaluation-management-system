-- public.delete_course: removes a mistaken course with its enrollments only when no marks
-- exist. Run with: supabase test db. Fictional fixtures inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- ---------------------------------------------------------------- fixtures (as postgres, RLS bypassed)
insert into auth.users (id, email, aud, role) values
  ('a7a7a7a7-0000-4000-8000-000000000001', 'admin.dc@example.edu', 'authenticated', 'authenticated'),
  ('a7a7a7a7-0000-4000-8000-000000000002', 'lect.dc@example.edu', 'authenticated', 'authenticated'),
  ('a7a7a7a7-0000-4000-8000-000000000003', 'stud.dc@example.edu', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, email, role) values
  ('a7a7a7a7-0000-4000-8000-000000000001', 'Dee Admin', 'admin.dc@example.edu', 'admin'),
  ('a7a7a7a7-0000-4000-8000-000000000002', 'Dee Lecturer', 'lect.dc@example.edu', 'lecturer'),
  ('a7a7a7a7-0000-4000-8000-000000000003', 'Dee Student', 'stud.dc@example.edu', 'student');
insert into public.departments (id, department_name, department_code) values
  ('b7b7b7b7-0000-4000-8000-000000000001', 'Deletion Dept', 'DEL');
insert into public.programmes (id, programme_name, programme_code, department_id) values
  ('b7b7b7b7-0000-4000-8000-000000000002', 'Deletion Programme', 'DEL-P', 'b7b7b7b7-0000-4000-8000-000000000001');
insert into public.lecturers (id, profile_id, staff_number, department_id) values
  ('c7c7c7c7-0000-4000-8000-000000000002', 'a7a7a7a7-0000-4000-8000-000000000002', 'DEL/L1', 'b7b7b7b7-0000-4000-8000-000000000001');
insert into public.students (id, profile_id, registration_number, programme_id, year_of_study) values
  ('d7d7d7d7-0000-4000-8000-000000000003', 'a7a7a7a7-0000-4000-8000-000000000003', 'DEL/0001', 'b7b7b7b7-0000-4000-8000-000000000002', 1);
insert into public.academic_periods (id, academic_year, semester, start_date, end_date, status) values
  ('f7f7f7f7-0000-4000-8000-000000000001', '2040/2041', 1, '2040-09-01', '2041-01-31', 'active');
insert into public.grading_scales (academic_period_id, grade, minimum_mark, maximum_mark, grade_point) values
  ('f7f7f7f7-0000-4000-8000-000000000001', 'P', 50, 100, 1),
  ('f7f7f7f7-0000-4000-8000-000000000001', 'F', 0, 49.99, 0);

-- Course 1: enrolled, lecturer assigned, empty draft result (no marks) -> deletable.
-- Course 2: one mark entered -> kept.  Course 3: coursework set -> kept.
insert into public.courses (id, course_code, course_name, credit_units, department_id) values
  ('e7e7e7e7-0000-4000-8000-000000000001', 'DEL 101', 'Mistaken course', 3, 'b7b7b7b7-0000-4000-8000-000000000001'),
  ('e7e7e7e7-0000-4000-8000-000000000002', 'DEL 102', 'Course with marks', 3, 'b7b7b7b7-0000-4000-8000-000000000001'),
  ('e7e7e7e7-0000-4000-8000-000000000003', 'DEL 103', 'Course with coursework', 3, 'b7b7b7b7-0000-4000-8000-000000000001');
insert into public.course_assignments (lecturer_id, course_id, academic_period_id) values
  ('c7c7c7c7-0000-4000-8000-000000000002', 'e7e7e7e7-0000-4000-8000-000000000001', 'f7f7f7f7-0000-4000-8000-000000000001');
insert into public.enrollments (id, student_id, course_id, academic_period_id) values
  ('97979797-0000-4000-8000-000000000001', 'd7d7d7d7-0000-4000-8000-000000000003', 'e7e7e7e7-0000-4000-8000-000000000001', 'f7f7f7f7-0000-4000-8000-000000000001'),
  ('97979797-0000-4000-8000-000000000002', 'd7d7d7d7-0000-4000-8000-000000000003', 'e7e7e7e7-0000-4000-8000-000000000002', 'f7f7f7f7-0000-4000-8000-000000000001');
insert into public.results (enrollment_id, coursework_mark, examination_mark) values
  ('97979797-0000-4000-8000-000000000001', null, null),
  ('97979797-0000-4000-8000-000000000002', 25, null);
insert into public.assignments (course_id, academic_period_id, title, due_at, max_marks) values
  ('e7e7e7e7-0000-4000-8000-000000000003', 'f7f7f7f7-0000-4000-8000-000000000001', 'Essay', now() + interval '7 days', 10);

-- ---------------------------------------------------------------- non-admins
set local role authenticated;
set local request.jwt.claims to '{"sub":"a7a7a7a7-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.delete_course('e7e7e7e7-0000-4000-8000-000000000001') $$,
  '42501', null, 'a lecturer cannot delete a course, even one they teach');

set local request.jwt.claims to '{"sub":"a7a7a7a7-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.delete_course('e7e7e7e7-0000-4000-8000-000000000001') $$,
  '42501', null, 'a student cannot delete a course');

-- ---------------------------------------------------------------- admin
set local request.jwt.claims to '{"sub":"a7a7a7a7-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok($$ select public.delete_course('e7e7e7e7-0000-4000-8000-000000000002') $$,
  'P0001', null, 'a course with any mark entered cannot be deleted');
select is((select count(*)::int from public.enrollments where course_id = 'e7e7e7e7-0000-4000-8000-000000000002'), 1,
  'the refused course keeps its enrollment');

select throws_ok($$ select public.delete_course('e7e7e7e7-0000-4000-8000-000000000003') $$,
  'P0001', null, 'a course with coursework cannot be deleted');

select throws_ok($$ select public.delete_course('e7e7e7e7-0000-4000-8000-0000000000ff') $$,
  'P0002', null, 'an unknown course reports not found');

select is(public.delete_course('e7e7e7e7-0000-4000-8000-000000000001'),
  '{"enrollments": 1, "emptyResults": 1}'::jsonb, 'an unmarked course is deleted with its enrollment and empty result');

reset role;
select is((select count(*)::int from public.courses where id = 'e7e7e7e7-0000-4000-8000-000000000001'), 0, 'the course is gone');
select is((select count(*)::int from public.enrollments where course_id = 'e7e7e7e7-0000-4000-8000-000000000001'), 0, 'its enrollments are gone');
select is((select count(*)::int from public.course_assignments where course_id = 'e7e7e7e7-0000-4000-8000-000000000001'), 0,
  'its lecturer assignments are removed by cascade');
select ok(exists (select 1 from public.audit_logs where entity_type = 'courses' and action = 'DELETE'
                  and entity_id = 'e7e7e7e7-0000-4000-8000-000000000001'
                  and actor_id = 'a7a7a7a7-0000-4000-8000-000000000001'),
  'the course deletion is audit-logged with the admin as actor');
select ok(exists (select 1 from public.audit_logs where entity_type = 'enrollments' and action = 'DELETE'
                  and entity_id = '97979797-0000-4000-8000-000000000001'),
  'the enrollment deletion is audit-logged');

select * from finish();
rollback;
