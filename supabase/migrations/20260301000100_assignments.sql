-- Coursework assignments and the students each one is assigned to.
--
--   assignments          one row per assignment, tied to a course offering (course + period)
--   assignment_students  many-to-many junction: which students may see an assignment
--
-- Removing a student from an assignment deletes only the junction row; the student's account,
-- enrollment, results and other records are untouched.

create type public.assignment_student_status as enum ('assigned', 'submitted', 'graded');

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  academic_period_id uuid not null references public.academic_periods (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 150),
  description text check (char_length(description) <= 5000),
  due_at timestamptz not null,
  max_marks numeric(6, 2) not null check (max_marks > 0 and max_marks <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_course_period_idx on public.assignments (course_id, academic_period_id);
create index assignments_due_idx on public.assignments (due_at);

create table public.assignment_students (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  -- Only 'assigned' is used until a submissions workflow exists.
  assignment_status public.assignment_student_status not null default 'assigned',
  constraint assignment_students_unique unique (assignment_id, student_id)
);
create index assignment_students_student_idx on public.assignment_students (student_id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function private.can_manage_assignment(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.assignments a
    where a.id = p_assignment_id and private.lecturer_teaches(a.course_id, a.academic_period_id)
  )
$$;

create or replace function private.is_assigned_to(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assignment_students x
    where x.assignment_id = p_assignment_id and x.student_id = private.current_student_id()
  )
$$;

revoke all on function private.can_manage_assignment(uuid), private.is_assigned_to(uuid) from public;
grant execute on function private.can_manage_assignment(uuid), private.is_assigned_to(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.assignments_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.created_at := now();
  else
    if new.course_id <> old.course_id or new.academic_period_id <> old.academic_period_id then
      raise exception 'An assignment cannot be moved to another course or period' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger assignments_before_write before insert or update on public.assignments
  for each row execute function private.assignments_before_write();

-- Only students enrolled (not withdrawn) on the assignment's course offering can be added.
create or replace function private.assignment_students_before_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.assignments a
    join public.enrollments e
      on e.course_id = a.course_id and e.academic_period_id = a.academic_period_id
    where a.id = new.assignment_id
      and e.student_id = new.student_id
      and e.enrollment_status <> 'withdrawn'
  ) then
    raise exception 'The student is not enrolled on this course for the assignment''s period' using errcode = 'P0001';
  end if;
  if auth.uid() is not null then
    new.assigned_by := auth.uid();
    new.assigned_at := now();
    new.assignment_status := 'assigned';
  end if;
  return new;
end $$;

create trigger assignment_students_before_insert before insert on public.assignment_students
  for each row execute function private.assignment_students_before_insert();

create trigger assignments_audit after insert or update or delete on public.assignments
  for each row execute function private.audit_row();
create trigger assignment_students_audit after insert or update or delete on public.assignment_students
  for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
--   admins: everything
--   lecturers: assignments of course offerings assigned to them, and their student lists
--   students: read-only, only assignments they are assigned to and their own junction rows
-- ---------------------------------------------------------------------------
alter table public.assignments enable row level security;
alter table public.assignment_students enable row level security;

revoke all on public.assignments, public.assignment_students from anon, authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
-- No UPDATE on the junction: the list changes by adding and removing rows.
grant select, insert, delete on public.assignment_students to authenticated;

create policy assignments_select on public.assignments for select to authenticated using (
  private.is_admin()
  or private.lecturer_teaches(course_id, academic_period_id)
  or private.is_assigned_to(id)
);
create policy assignments_staff_insert on public.assignments for insert to authenticated
  with check (private.is_admin() or private.lecturer_teaches(course_id, academic_period_id));
create policy assignments_staff_update on public.assignments for update to authenticated
  using (private.is_admin() or private.lecturer_teaches(course_id, academic_period_id))
  with check (private.is_admin() or private.lecturer_teaches(course_id, academic_period_id));
create policy assignments_staff_delete on public.assignments for delete to authenticated
  using (private.is_admin() or private.lecturer_teaches(course_id, academic_period_id));

create policy assignment_students_select on public.assignment_students for select to authenticated using (
  private.can_manage_assignment(assignment_id) or student_id = private.current_student_id()
);
create policy assignment_students_staff_insert on public.assignment_students for insert to authenticated
  with check (private.can_manage_assignment(assignment_id));
create policy assignment_students_staff_delete on public.assignment_students for delete to authenticated
  using (private.can_manage_assignment(assignment_id));

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS and triggers apply). Each runs in one transaction.
-- ---------------------------------------------------------------------------

-- Creates an assignment and its student list together, so a failure leaves nothing behind.
create or replace function public.create_assignment(
  p_course_id uuid, p_period_id uuid, p_title text, p_description text,
  p_due_at timestamptz, p_max_marks numeric, p_student_ids uuid[] default '{}'
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.assignments (course_id, academic_period_id, title, description, due_at, max_marks)
  values (p_course_id, p_period_id, p_title, p_description, p_due_at, p_max_marks)
  returning id into v_id;

  insert into public.assignment_students (assignment_id, student_id)
  select v_id, s from (select distinct unnest(coalesce(p_student_ids, '{}'::uuid[])) as s) u;
  return v_id;
end $$;

-- Replaces an assignment's student list: removes students not listed, adds new ones.
create or replace function public.set_assignment_students(p_assignment_id uuid, p_student_ids uuid[])
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_student_ids, '{}'::uuid[]);
  v_added integer;
  v_removed integer;
begin
  if not private.can_manage_assignment(p_assignment_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.assignment_students
   where assignment_id = p_assignment_id and not (student_id = any (v_ids));
  get diagnostics v_removed = row_count;

  insert into public.assignment_students (assignment_id, student_id)
  select p_assignment_id, s from (select distinct unnest(v_ids) as s) u
  on conflict (assignment_id, student_id) do nothing;
  get diagnostics v_added = row_count;

  return jsonb_build_object('added', v_added, 'removed', v_removed);
end $$;

revoke execute on function public.create_assignment, public.set_assignment_students from public, anon;
grant execute on function public.create_assignment, public.set_assignment_students to authenticated;

-- ---------------------------------------------------------------------------
-- Read views (security_invoker: the caller's RLS applies)
-- ---------------------------------------------------------------------------
create view public.assignment_overview with (security_invoker = on) as
select a.id, a.course_id, a.academic_period_id, a.title, a.description, a.due_at, a.max_marks,
       a.created_by, a.created_at, a.updated_at,
       c.course_code, c.course_name,
       ap.academic_year, ap.semester, ap.start_date, ap.status as period_status,
       p.full_name as created_by_name,
       (select count(*) from public.assignment_students x where x.assignment_id = a.id)::int as assigned_count
from public.assignments a
join public.courses c on c.id = a.course_id
join public.academic_periods ap on ap.id = a.academic_period_id
left join public.profiles p on p.id = a.created_by;

create view public.assignment_student_details with (security_invoker = on) as
select x.id, x.assignment_id, x.student_id, x.assigned_at, x.assignment_status,
       sd.registration_number, sd.full_name, sd.email, sd.programme_code, sd.year_of_study, sd.account_status
from public.assignment_students x
join public.student_directory sd on sd.id = x.student_id;

revoke all on public.assignment_overview, public.assignment_student_details from anon, authenticated;
grant select on public.assignment_overview, public.assignment_student_details to authenticated;
