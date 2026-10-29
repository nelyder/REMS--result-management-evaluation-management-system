-- Row Level Security. Deny by default; every table has RLS enabled.
-- Roles come from public.profiles (server-controlled), never from JWT claims
-- a user could influence.

alter table public.departments enable row level security;
alter table public.programmes enable row level security;
alter table public.courses enable row level security;
alter table public.academic_periods enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.lecturers enable row level security;
alter table public.course_assignments enable row level security;
alter table public.enrollments enable row level security;
alter table public.evaluation_settings enable row level security;
alter table public.grading_scales enable row level security;
alter table public.results enable row level security;
alter table public.audit_logs enable row level security;

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- Reference data: readable by any active user; writable by admins.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['departments','programmes','courses','academic_periods','grading_scales','evaluation_settings']
  loop
    execute format('create policy %I_read on public.%I for select to authenticated
                    using (private.current_user_role() is not null)', t, t);
    execute format('create policy %I_admin_insert on public.%I for insert to authenticated
                    with check (private.is_admin())', t, t);
    execute format('create policy %I_admin_update on public.%I for update to authenticated
                    using (private.is_admin()) with check (private.is_admin())', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated
                    using (private.is_admin())', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or private.is_admin()
  -- staff can see lecturer names (assignments, reports)
  or (role = 'lecturer' and private.current_user_role() = 'lecturer')
  -- lecturers can see students enrolled on their courses
  or (role = 'student' and exists (
        select 1 from public.students s
        where s.profile_id = profiles.id and private.lecturer_can_see_student(s.id)))
);
create policy profiles_admin_insert on public.profiles for insert to authenticated with check (private.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- students / lecturers
-- ---------------------------------------------------------------------------
create policy students_select on public.students for select to authenticated using (
  profile_id = auth.uid() or private.is_admin() or private.lecturer_can_see_student(id)
);
create policy students_admin_insert on public.students for insert to authenticated with check (private.is_admin());
create policy students_admin_update on public.students for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy students_admin_delete on public.students for delete to authenticated using (private.is_admin());

create policy lecturers_select on public.lecturers for select to authenticated using (
  profile_id = auth.uid() or private.current_user_role() in ('admin', 'lecturer')
);
create policy lecturers_admin_insert on public.lecturers for insert to authenticated with check (private.is_admin());
create policy lecturers_admin_update on public.lecturers for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy lecturers_admin_delete on public.lecturers for delete to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- course_assignments
-- ---------------------------------------------------------------------------
create policy course_assignments_select on public.course_assignments for select to authenticated using (
  private.is_admin() or lecturer_id = private.current_lecturer_id()
);
create policy course_assignments_admin_insert on public.course_assignments for insert to authenticated
  with check (private.is_admin());
create policy course_assignments_admin_delete on public.course_assignments for delete to authenticated
  using (private.is_admin());

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
create policy enrollments_select on public.enrollments for select to authenticated using (
  private.is_admin()
  or private.lecturer_teaches(course_id, academic_period_id)
  or student_id = private.current_student_id()
);
create policy enrollments_admin_insert on public.enrollments for insert to authenticated with check (private.is_admin());
create policy enrollments_admin_update on public.enrollments for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy enrollments_admin_delete on public.enrollments for delete to authenticated using (private.is_admin());

-- ---------------------------------------------------------------------------
-- results
--   * students: read their own PUBLISHED/CORRECTED results only; never write.
--   * lecturers: read/write results of courses assigned to them for that period.
--     Workflow rules (publish/correct/lock) are enforced by results_before_write.
--   * admins: everything except deleting non-draft results.
-- ---------------------------------------------------------------------------
create policy results_select on public.results for select to authenticated using (
  private.can_manage_enrollment(enrollment_id)
  or (publication_status in ('published', 'corrected') and private.owns_enrollment(enrollment_id))
);
create policy results_staff_insert on public.results for insert to authenticated
  with check (private.can_manage_enrollment(enrollment_id));
create policy results_staff_update on public.results for update to authenticated
  using (private.can_manage_enrollment(enrollment_id))
  with check (private.can_manage_enrollment(enrollment_id));
create policy results_admin_delete on public.results for delete to authenticated
  using (private.is_admin() and publication_status = 'draft');

-- ---------------------------------------------------------------------------
-- audit_logs: read-only. Admins see all; lecturers see history of results
-- they manage. No INSERT/UPDATE/DELETE policy exists, and privileges are revoked.
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  private.is_admin()
  or (entity_type = 'results' and private.current_user_role() = 'lecturer' and exists (
        select 1 from public.results r
        where r.id::text = audit_logs.entity_id and private.can_manage_enrollment(r.enrollment_id)))
);
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
-- Note: immutable columns (profiles.role, results.enrollment_id, entered_by, ...)
-- are protected by the profiles_guard / results_before_write triggers.

-- Views run with the caller's privileges (security_invoker); grant read only.
grant select on public.student_directory, public.lecturer_directory, public.enrollment_details,
  public.result_details, public.assignment_details, public.course_result_summary, public.grade_counts
  to authenticated;
revoke all on public.student_directory, public.lecturer_directory, public.enrollment_details,
  public.result_details, public.assignment_details, public.course_result_summary, public.grade_counts
  from anon;
