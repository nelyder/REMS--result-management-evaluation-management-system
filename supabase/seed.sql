-- Reference data for development. Fictional institution data only.
-- User accounts are NOT created here: run `npm run create-admin -w server`
-- (and optionally `npm run seed:demo -w server`) after migrations.

insert into public.departments (id, department_name, department_code) values
  ('11111111-0000-4000-8000-000000000001', 'Computer Science', 'CSC'),
  ('11111111-0000-4000-8000-000000000002', 'Mathematics', 'MTH'),
  ('11111111-0000-4000-8000-000000000003', 'Business Administration', 'BUS')
on conflict do nothing;

insert into public.programmes (id, programme_name, programme_code, department_id) values
  ('22222222-0000-4000-8000-000000000001', 'BSc Computer Science', 'BSC-CS', '11111111-0000-4000-8000-000000000001'),
  ('22222222-0000-4000-8000-000000000002', 'BSc Mathematics', 'BSC-MTH', '11111111-0000-4000-8000-000000000002'),
  ('22222222-0000-4000-8000-000000000003', 'BBA Business Administration', 'BBA', '11111111-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.courses (id, course_code, course_name, credit_units, department_id, pass_mark) values
  ('33333333-0000-4000-8000-000000000001', 'CSC 101', 'Introduction to Programming', 4, '11111111-0000-4000-8000-000000000001', null),
  ('33333333-0000-4000-8000-000000000002', 'CSC 102', 'Data Structures', 4, '11111111-0000-4000-8000-000000000001', null),
  ('33333333-0000-4000-8000-000000000003', 'CSC 201', 'Database Systems', 3, '11111111-0000-4000-8000-000000000001', null),
  ('33333333-0000-4000-8000-000000000004', 'MTH 101', 'Calculus I', 3, '11111111-0000-4000-8000-000000000002', null),
  ('33333333-0000-4000-8000-000000000005', 'MTH 102', 'Linear Algebra', 3, '11111111-0000-4000-8000-000000000002', 45),
  ('33333333-0000-4000-8000-000000000006', 'BUS 101', 'Principles of Management', 2, '11111111-0000-4000-8000-000000000003', null)
on conflict do nothing;

insert into public.academic_periods (id, academic_year, semester, start_date, end_date, status) values
  ('44444444-0000-4000-8000-000000000001', '2025/2026', 1, '2025-09-01', '2026-01-31', 'closed'),
  ('44444444-0000-4000-8000-000000000002', '2025/2026', 2, '2026-02-01', '2026-06-30', 'closed'),
  ('44444444-0000-4000-8000-000000000003', '2026/2027', 1, '2026-09-01', '2027-01-31', 'active')
on conflict do nothing;

-- Default (institution-wide) grading scale. Example values; configure in the app.
insert into public.grading_scales (academic_period_id, grade, minimum_mark, maximum_mark, grade_point, description) values
  (null, 'A', 80, 100, 4.0, 'Excellent'),
  (null, 'B', 70, 79.99, 3.5, 'Very good'),
  (null, 'C', 60, 69.99, 3.0, 'Good'),
  (null, 'D', 50, 59.99, 2.0, 'Satisfactory'),
  (null, 'F', 0, 49.99, 0.0, 'Fail')
on conflict do nothing;
