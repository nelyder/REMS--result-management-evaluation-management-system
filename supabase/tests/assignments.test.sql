-- RLS, trigger and constraint tests for coursework assignments. Run with: supabase test db
-- Fictional fixtures inside a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ---------------------------------------------------------------- fixtures (as postgres, RLS bypassed)
insert into auth.users (id, email, aud, role) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'admin.a@example.edu', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'lect1.a@example.edu', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'lect2.a@example.edu', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'stud1.a@example.edu', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'stud2.a@example.edu', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'stud3.a@example.edu', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, email, role) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Assign Admin', 'admin.a@example.edu', 'admin'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'Assign Lecturer One', 'lect1.a@example.edu', 'lecturer'),
  ('a1a1a1a1-0000-4000-8000-000000000003', 'Assign Lecturer Two', 'lect2.a@example.edu', 'lecturer'),
  ('a1a1a1a1-0000-4000-8000-000000000004', 'Assign Student One', 'stud1.a@example.edu', 'student'),
  ('a1a1a1a1-0000-4000-8000-000000000005', 'Assign Student Two', 'stud2.a@example.edu', 'student'),
  ('a1a1a1a1-0000-4000-8000-000000000006', 'Assign Student Three', 'stud3.a@example.edu', 'student');
insert into public.departments (id, department_name, department_code) values
  ('b2b2b2b2-0000-4000-8000-000000000001', 'Assignment Test Dept', 'ATD');
insert into public.programmes (id, programme_name, programme_code, department_id) values
  ('b2b2b2b2-0000-4000-8000-000000000002', 'Assignment Test Programme', 'ATD-P', 'b2b2b2b2-0000-4000-8000-000000000001');
insert into public.lecturers (id, profile_id, staff_number, department_id) values
  ('c3c3c3c3-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000002', 'ATD/L1', 'b2b2b2b2-0000-4000-8000-000000000001'),
  ('c3c3c3c3-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000003', 'ATD/L2', 'b2b2b2b2-0000-4000-8000-000000000001');
insert into public.students (id, profile_id, registration_number, programme_id, year_of_study) values
  ('d4d4d4d4-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000004', 'ATD/0001', 'b2b2b2b2-0000-4000-8000-000000000002', 1),
  ('d4d4d4d4-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000005', 'ATD/0002', 'b2b2b2b2-0000-4000-8000-000000000002', 1),
  ('d4d4d4d4-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000006', 'ATD/0003', 'b2b2b2b2-0000-4000-8000-000000000002', 1);
insert into public.courses (id, course_code, course_name, credit_units, department_id) values
  ('e5e5e5e5-0000-4000-8000-000000000001', 'ATD 101', 'Course A (lecturer one)', 3, 'b2b2b2b2-0000-4000-8000-000000000001'),
  ('e5e5e5e5-0000-4000-8000-000000000002', 'ATD 102', 'Course B (lecturer two)', 3, 'b2b2b2b2-0000-4000-8000-000000000001');
insert into public.academic_periods (id, academic_year, semester, start_date, end_date, status) values
  ('f6f6f6f6-0000-4000-8000-000000000001', '2031/2032', 1, '2031-09-01', '2032-01-31', 'active');
insert into public.course_assignments (lecturer_id, course_id, academic_period_id) values
  ('c3c3c3c3-0000-4000-8000-000000000002', 'e5e5e5e5-0000-4000-8000-000000000001', 'f6f6f6f6-0000-4000-8000-000000000001'),
  ('c3c3c3c3-0000-4000-8000-000000000003', 'e5e5e5e5-0000-4000-8000-000000000002', 'f6f6f6f6-0000-4000-8000-000000000001');
-- Students one and two are enrolled on course A; student three only on course B.
insert into public.enrollments (id, student_id, course_id, academic_period_id) values
  ('97979797-0000-4000-8000-000000000001', 'd4d4d4d4-0000-4000-8000-000000000004', 'e5e5e5e5-0000-4000-8000-000000000001', 'f6f6f6f6-0000-4000-8000-000000000001'),
  ('97979797-0000-4000-8000-000000000002', 'd4d4d4d4-0000-4000-8000-000000000005', 'e5e5e5e5-0000-4000-8000-000000000001', 'f6f6f6f6-0000-4000-8000-000000000001'),
  ('97979797-0000-4000-8000-000000000003', 'd4d4d4d4-0000-4000-8000-000000000006', 'e5e5e5e5-0000-4000-8000-000000000002', 'f6f6f6f6-0000-4000-8000-000000000001');
-- Assignment on course B (lecturer two), assigned to student three.
insert into public.assignments (id, course_id, academic_period_id, title, due_at, max_marks) values
  ('a5a5a5a5-0000-4000-8000-00000000000b', 'e5e5e5e5-0000-4000-8000-000000000002', 'f6f6f6f6-0000-4000-8000-000000000001', 'Course B essay', now() + interval '7 days', 10);
insert into public.assignment_students (assignment_id, student_id) values
  ('a5a5a5a5-0000-4000-8000-00000000000b', 'd4d4d4d4-0000-4000-8000-000000000006');

-- ---------------------------------------------------------------- lecturer one
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1a1a1a1-0000-4000-8000-000000000002","role":"authenticated"}';

select lives_ok($$
  select public.create_assignment('e5e5e5e5-0000-4000-8000-000000000001', 'f6f6f6f6-0000-4000-8000-000000000001',
    'Course A essay', 'Write 500 words.', now() + interval '7 days', 20,
    array['d4d4d4d4-0000-4000-8000-000000000004'::uuid])
$$, 'assigned lecturer creates an assignment with a student in one call');

select is((select count(*)::int from public.assignment_students x join public.assignments a on a.id = x.assignment_id
           where a.title = 'Course A essay'), 1, 'the student list was saved with the assignment');

select is((select created_by from public.assignments where title = 'Course A essay'),
  'a1a1a1a1-0000-4000-8000-000000000002'::uuid, 'created_by is set by the trigger from auth.uid()');

select throws_ok($$
  insert into public.assignments (course_id, academic_period_id, title, due_at, max_marks)
  values ('e5e5e5e5-0000-4000-8000-000000000002', 'f6f6f6f6-0000-4000-8000-000000000001', 'Not my course', now() + interval '1 day', 5)
$$, '42501', null, 'lecturer cannot create an assignment for a course they do not teach');

select is((select count(*)::int from public.assignments where title = 'Course B essay'), 0,
  'lecturer cannot see assignments of courses they do not teach');

select throws_ok($$
  insert into public.assignment_students (assignment_id, student_id)
  select id, 'd4d4d4d4-0000-4000-8000-000000000004' from public.assignments where title = 'Course A essay'
$$, '23505', null, 'the same student cannot be assigned twice (unique constraint)');

select throws_ok($$
  insert into public.assignment_students (assignment_id, student_id)
  select id, 'd4d4d4d4-0000-4000-8000-000000000006' from public.assignments where title = 'Course A essay'
$$, 'P0001', null, 'a student not enrolled on the course cannot be assigned');

select lives_ok($$
  insert into public.assignment_students (assignment_id, student_id)
  select id, 'd4d4d4d4-0000-4000-8000-000000000005' from public.assignments where title = 'Course A essay'
$$, 'lecturer adds an enrolled student');

select throws_ok($$
  update public.assignment_students set assignment_status = 'graded'
$$, '42501', null, 'the junction table has no UPDATE privilege');

select throws_ok($$
  update public.assignments set course_id = 'e5e5e5e5-0000-4000-8000-000000000002' where title = 'Course A essay'
$$, null, null, 'an assignment cannot be moved to another course');

-- ---------------------------------------------------------------- student one (assigned)
set local request.jwt.claims to '{"sub":"a1a1a1a1-0000-4000-8000-000000000004","role":"authenticated"}';

select results_eq($$ select title from public.assignments $$, $$ values ('Course A essay') $$,
  'student sees only the assignment they are assigned to');
select is((select count(*)::int from public.assignment_students), 1, 'student sees only their own junction row');
select is((select count(*)::int from public.assignment_overview), 1, 'the overview view respects RLS');

select throws_ok($$
  insert into public.assignment_students (assignment_id, student_id)
  select id, 'd4d4d4d4-0000-4000-8000-000000000004' from public.assignments where title = 'Course A essay'
$$, '42501', null, 'students cannot assign themselves');

delete from public.assignment_students;
select is((select count(*)::int from public.assignment_students), 1, 'students cannot delete junction rows (RLS filters the delete)');

update public.assignments set title = 'Hacked' where title = 'Course A essay';
select is((select count(*)::int from public.assignments where title = 'Hacked'), 0, 'students cannot edit assignments');

-- ---------------------------------------------------------------- lecturer one removes student one
set local request.jwt.claims to '{"sub":"a1a1a1a1-0000-4000-8000-000000000002","role":"authenticated"}';
delete from public.assignment_students
 where student_id = 'd4d4d4d4-0000-4000-8000-000000000004'
   and assignment_id = (select id from public.assignments where title = 'Course A essay');

set local request.jwt.claims to '{"sub":"a1a1a1a1-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.assignments), 0, 'a removed student can no longer see the assignment');

reset role;
select is((select count(*)::int from public.enrollments where id = '97979797-0000-4000-8000-000000000001'), 1,
  'removing a student keeps their enrollment');
select is((select count(*)::int from public.students where id = 'd4d4d4d4-0000-4000-8000-000000000004'), 1,
  'removing a student keeps their student record');
select ok(exists (select 1 from public.audit_logs where entity_type = 'assignment_students' and action = 'DELETE'),
  'removal is audit-logged');

-- ---------------------------------------------------------------- set_assignment_students (lecturer one)
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1a1a1a1-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.set_assignment_students((select id from public.assignments where title = 'Course A essay'),
    array['d4d4d4d4-0000-4000-8000-000000000004'::uuid]),
  '{"added": 1, "removed": 1}'::jsonb,
  'replacing the list adds and removes in one call');

select throws_ok($$
  select public.set_assignment_students('a5a5a5a5-0000-4000-8000-00000000000b', '{}'::uuid[])
$$, '42501', null, 'lecturer cannot replace the list of another lecturer''s assignment');

select * from finish();
rollback;
