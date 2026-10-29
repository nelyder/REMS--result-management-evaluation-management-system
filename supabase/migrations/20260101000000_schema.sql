-- REMS schema: tables, constraints, indexes.
-- Security (RLS), triggers and functions live in the following migrations.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'lecturer', 'student');
create type public.account_status as enum ('active', 'inactive');
create type public.period_status as enum ('planned', 'active', 'closed');
create type public.enrollment_status as enum ('enrolled', 'withdrawn', 'completed');
create type public.result_status as enum ('incomplete', 'pass', 'fail');
create type public.publication_status as enum ('draft', 'submitted', 'published', 'corrected');

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  department_name text not null check (char_length(department_name) between 2 and 120),
  department_code text not null unique check (department_code ~ '^[A-Z0-9-]{2,12}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  programme_name text not null check (char_length(programme_name) between 2 and 150),
  programme_code text not null unique check (programme_code ~ '^[A-Z0-9-]{2,16}$'),
  department_id uuid not null references public.departments (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programmes_department_idx on public.programmes (department_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique check (course_code ~ '^[A-Z]{2,6} ?[0-9]{3,4}[A-Z]?$'),
  course_name text not null check (char_length(course_name) between 2 and 150),
  credit_units smallint not null check (credit_units between 1 and 30),
  department_id uuid not null references public.departments (id) on delete restrict,
  -- NULL = use evaluation_settings.default_pass_mark
  pass_mark numeric(5, 2) check (pass_mark between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_department_idx on public.courses (department_id);

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null check (
    academic_year ~ '^[0-9]{4}/[0-9]{4}$'
    and split_part(academic_year, '/', 2)::int = split_part(academic_year, '/', 1)::int + 1
  ),
  semester smallint not null check (semester between 1 and 3),
  start_date date not null,
  end_date date not null,
  status public.period_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year, semester),
  check (end_date > start_date)
);

-- ---------------------------------------------------------------------------
-- People. profiles.id is the Supabase Auth user id.
-- Rows are created by the server (service role / admin) only; there is no
-- self-signup path that can choose a role.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  role public.user_role not null,
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  registration_number text not null unique check (registration_number ~ '^[A-Z0-9/-]{4,30}$'),
  programme_id uuid not null references public.programmes (id) on delete restrict,
  year_of_study smallint not null check (year_of_study between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_programme_idx on public.students (programme_id, year_of_study);

create table public.lecturers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  staff_number text not null unique check (staff_number ~ '^[A-Z0-9/-]{3,30}$'),
  department_id uuid not null references public.departments (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lecturers_department_idx on public.lecturers (department_id);

-- ---------------------------------------------------------------------------
-- Teaching and enrollment
-- ---------------------------------------------------------------------------
create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null references public.lecturers (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  academic_period_id uuid not null references public.academic_periods (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (lecturer_id, course_id, academic_period_id)
);
create index course_assignments_course_period_idx on public.course_assignments (course_id, academic_period_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  course_id uuid not null references public.courses (id) on delete restrict,
  academic_period_id uuid not null references public.academic_periods (id) on delete restrict,
  enrollment_status public.enrollment_status not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, course_id, academic_period_id)
);
create index enrollments_course_period_idx on public.enrollments (course_id, academic_period_id);
create index enrollments_period_idx on public.enrollments (academic_period_id);

-- ---------------------------------------------------------------------------
-- Evaluation configuration
-- ---------------------------------------------------------------------------
create table public.evaluation_settings (
  id smallint primary key default 1 check (id = 1), -- single-row table
  coursework_max numeric(5, 2) not null default 40 check (coursework_max between 0 and 100),
  exam_max numeric(5, 2) not null default 60 check (exam_max between 0 and 100),
  default_pass_mark numeric(5, 2) not null default 50 check (default_pass_mark between 0 and 100),
  lecturer_can_publish boolean not null default false,
  lecturer_can_correct boolean not null default false,
  updated_at timestamptz not null default now(),
  check (coursework_max + exam_max = 100)
);
insert into public.evaluation_settings (id) values (1);

create table public.grading_scales (
  id uuid primary key default gen_random_uuid(),
  -- NULL = institution default scale; otherwise overrides for that period.
  academic_period_id uuid references public.academic_periods (id) on delete cascade,
  grade text not null check (grade ~ '^[A-Z][+-]?$'),
  minimum_mark numeric(5, 2) not null,
  maximum_mark numeric(5, 2) not null,
  grade_point numeric(3, 2) check (grade_point between 0 and 5),
  description text check (char_length(description) <= 120),
  created_at timestamptz not null default now(),
  check (minimum_mark >= 0 and maximum_mark <= 100 and minimum_mark <= maximum_mark),
  -- Bands in the same scale may not overlap.
  constraint grading_scales_no_overlap exclude using gist (
    (coalesce(academic_period_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    numrange(minimum_mark, maximum_mark, '[]') with &&
  )
);
create unique index grading_scales_grade_unique
  on public.grading_scales (coalesce(academic_period_id, '00000000-0000-0000-0000-000000000000'::uuid), grade);

-- ---------------------------------------------------------------------------
-- Results. One row per enrollment. total_mark is a generated column so it can
-- never disagree with its components; a missing component leaves it NULL
-- (incomplete), never zero.
-- ---------------------------------------------------------------------------
create table public.results (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.enrollments (id) on delete restrict,
  coursework_mark numeric(5, 2) check (coursework_mark between 0 and 100),
  examination_mark numeric(5, 2) check (examination_mark between 0 and 100),
  total_mark numeric(5, 2) generated always as (coursework_mark + examination_mark) stored
    check (total_mark between 0 and 100),
  grade text,
  grade_point numeric(3, 2),
  result_status public.result_status not null default 'incomplete',
  publication_status public.publication_status not null default 'draft',
  correction_reason text check (char_length(correction_reason) <= 500),
  version integer not null default 1,
  entered_by uuid references public.profiles (id) on delete set null,
  last_modified_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint results_incomplete_consistent
    check ((coursework_mark is null or examination_mark is null) = (result_status = 'incomplete')),
  constraint results_grade_consistent check ((result_status = 'incomplete') = (grade is null)),
  constraint results_only_complete_leave_draft
    check (publication_status = 'draft' or result_status <> 'incomplete'),
  constraint results_published_at_consistent
    check ((publication_status in ('published', 'corrected')) = (published_at is not null))
);
create index results_publication_idx on public.results (publication_status);

-- ---------------------------------------------------------------------------
-- Audit log. Written only by SECURITY DEFINER triggers / the server.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
