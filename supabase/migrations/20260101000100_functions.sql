-- Helper functions, result evaluation + workflow guard, audit triggers, RPCs and views.

-- ---------------------------------------------------------------------------
-- Identity helpers (private schema: not exposed through the Data API).
-- SECURITY DEFINER so RLS policies can call them without recursion.
-- ---------------------------------------------------------------------------
create or replace function private.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.account_status = 'active'
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_user_role() = 'admin', false) $$;

create or replace function private.current_lecturer_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select l.id from public.lecturers l
  join public.profiles p on p.id = l.profile_id
  where l.profile_id = auth.uid() and p.account_status = 'active'
$$;

create or replace function private.current_student_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select s.id from public.students s
  join public.profiles p on p.id = s.profile_id
  where s.profile_id = auth.uid() and p.account_status = 'active'
$$;

create or replace function private.lecturer_teaches(p_course_id uuid, p_period_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.course_assignments ca
    where ca.course_id = p_course_id
      and ca.academic_period_id = p_period_id
      and ca.lecturer_id = private.current_lecturer_id()
  )
$$;

create or replace function private.can_manage_enrollment(p_enrollment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id and private.lecturer_teaches(e.course_id, e.academic_period_id)
  )
$$;

create or replace function private.owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id and e.student_id = private.current_student_id()
  )
$$;

-- Lecturers may see students enrolled on their courses.
create or replace function private.lecturer_can_see_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id and private.lecturer_teaches(e.course_id, e.academic_period_id)
  )
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['departments','programmes','courses','academic_periods','profiles',
                           'students','lecturers','enrollments','evaluation_settings']
  loop
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: role and id are immutable; only admins may change status/email.
-- ---------------------------------------------------------------------------
create or replace function private.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id then raise exception 'Profile id cannot change' using errcode = '42501'; end if;
  if new.role <> old.role then raise exception 'Role cannot be changed' using errcode = '42501'; end if;
  if auth.uid() is not null and not private.is_admin()
     and (new.account_status <> old.account_status or new.email <> old.email) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if auth.uid() is not null and new.id = auth.uid() and new.account_status <> 'active' then
    raise exception 'You cannot deactivate your own account' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- ---------------------------------------------------------------------------
-- Grade lookup: period-specific scale if one exists, else the default scale.
-- ---------------------------------------------------------------------------
create or replace function private.grade_band(p_total numeric, p_period_id uuid)
returns table (grade text, grade_point numeric)
language sql stable security definer set search_path = ''
as $$
  select g.grade, g.grade_point
  from public.grading_scales g
  where p_total between g.minimum_mark and g.maximum_mark
    and g.academic_period_id is not distinct from (
      case when exists (select 1 from public.grading_scales x where x.academic_period_id = p_period_id)
           then p_period_id else null end
    )
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Results: evaluation + workflow guard. The API computes the same values
-- (server/src/utils/evaluation.js); this trigger makes the database
-- authoritative so direct Data API writes cannot store a wrong grade or skip
-- the publication workflow.
-- ---------------------------------------------------------------------------
create or replace function private.results_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  s public.evaluation_settings;
  v_role public.user_role := private.current_user_role();
  v_actor uuid := auth.uid();
  v_course_id uuid;
  v_period_id uuid;
  v_enrollment_status public.enrollment_status;
  v_pass numeric;
  v_total numeric;
  v_band record;
  v_old_status public.publication_status;
  v_marks_changed boolean;
begin
  select * into s from public.evaluation_settings where id = 1;

  if tg_op = 'UPDATE' and new.enrollment_id <> old.enrollment_id then
    raise exception 'A result cannot be moved to another enrollment' using errcode = '42501';
  end if;

  select e.course_id, e.academic_period_id, e.enrollment_status, coalesce(c.pass_mark, s.default_pass_mark)
    into v_course_id, v_period_id, v_enrollment_status, v_pass
  from public.enrollments e join public.courses c on c.id = e.course_id
  where e.id = new.enrollment_id;

  if v_enrollment_status = 'withdrawn' then
    raise exception 'Cannot record a result for a withdrawn enrollment' using errcode = 'P0001';
  end if;

  -- Validate marks against the configured scheme.
  if new.coursework_mark is not null and (new.coursework_mark < 0 or new.coursework_mark > s.coursework_max) then
    raise exception 'Coursework mark must be between 0 and %', s.coursework_max using errcode = '23514';
  end if;
  if new.examination_mark is not null and (new.examination_mark < 0 or new.examination_mark > s.exam_max) then
    raise exception 'Examination mark must be between 0 and %', s.exam_max using errcode = '23514';
  end if;

  -- Evaluate. Missing components => incomplete (never treated as zero).
  if new.coursework_mark is null or new.examination_mark is null then
    new.result_status := 'incomplete';
    new.grade := null;
    new.grade_point := null;
  else
    v_total := new.coursework_mark + new.examination_mark;
    select * into v_band from private.grade_band(v_total, v_period_id);
    if v_band.grade is null then
      raise exception 'No grade band covers a total of %', v_total using errcode = 'P0001';
    end if;
    new.grade := v_band.grade;
    new.grade_point := v_band.grade_point;
    new.result_status := case when v_total >= v_pass then 'pass' else 'fail' end;
  end if;

  -- Workflow guard for real users (service-role maintenance has auth.uid() = null).
  if v_actor is not null then
    if v_role is null or v_role = 'student' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;

    if tg_op = 'INSERT' then
      new.publication_status := 'draft';
      new.published_at := null;
      new.correction_reason := null;
      new.entered_by := v_actor;
      new.version := 1;
    else
      v_old_status := old.publication_status;
      v_marks_changed := new.coursework_mark is distinct from old.coursework_mark
                      or new.examination_mark is distinct from old.examination_mark;
      new.entered_by := old.entered_by;
      new.created_at := old.created_at;

      if v_old_status = 'draft' then
        new.correction_reason := null;
        if new.publication_status = 'published' and not (v_role = 'admin' or s.lecturer_can_publish) then
          raise exception 'You are not authorised to publish results' using errcode = '42501';
        elsif new.publication_status = 'corrected' then
          raise exception 'Invalid status transition' using errcode = 'P0001';
        end if;

      elsif v_old_status = 'submitted' then
        if v_role <> 'admin' then
          raise exception 'Submitted results are locked until an administrator returns them' using errcode = '42501';
        end if;
        if new.publication_status = 'corrected' then
          raise exception 'Invalid status transition' using errcode = 'P0001';
        end if;

      else -- published / corrected
        if new.publication_status in ('draft', 'submitted') then
          raise exception 'Published results cannot be unpublished' using errcode = 'P0001';
        end if;
        if v_marks_changed then
          if not (v_role = 'admin' or s.lecturer_can_correct) then
            raise exception 'You are not authorised to correct published results' using errcode = '42501';
          end if;
          if new.correction_reason is null or char_length(trim(new.correction_reason)) < 5 then
            raise exception 'A reason is required to correct a published result' using errcode = 'P0001';
          end if;
          new.publication_status := 'corrected';
        else
          new.publication_status := v_old_status;
          new.correction_reason := old.correction_reason;
        end if;
      end if;
    end if;
    new.last_modified_by := v_actor;
  end if;

  -- published_at bookkeeping
  if new.publication_status in ('published', 'corrected') then
    new.published_at := coalesce(case when tg_op = 'UPDATE' then old.published_at end, now());
  else
    new.published_at := null;
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger results_before_write before insert or update on public.results
  for each row execute function private.results_before_write();

-- ---------------------------------------------------------------------------
-- Audit logging (AFTER triggers, SECURITY DEFINER: users cannot write logs).
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_action text := tg_op;
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'results' then
    if (v_old->>'publication_status') <> (v_new->>'publication_status') then
      v_action := case v_new->>'publication_status'
        when 'published' then 'PUBLISH' when 'submitted' then 'SUBMIT'
        when 'corrected' then 'CORRECT' when 'draft' then 'RETURN' end;
    elsif v_new->>'publication_status' = 'corrected'
          and (v_old->>'coursework_mark', v_old->>'examination_mark')
              is distinct from (v_new->>'coursework_mark', v_new->>'examination_mark') then
      v_action := 'CORRECT';
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'profiles'
        and (v_old->>'account_status') <> (v_new->>'account_status') then
    v_action := 'STATUS_CHANGE';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, previous_values, new_values)
  values (auth.uid(), v_action, tg_table_name, coalesce(v_new->>'id', v_old->>'id'), v_old, v_new);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['departments','programmes','courses','academic_periods','profiles','students',
                           'lecturers','course_assignments','enrollments','results','grading_scales',
                           'evaluation_settings']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function private.audit_row()', t, t);
  end loop;
end $$;

-- Audit logs are append-only, even for privileged roles going through the API.
create or replace function private.audit_logs_immutable()
returns trigger language plpgsql set search_path = ''
as $$ begin raise exception 'Audit logs are append-only' using errcode = '42501'; end $$;

create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: RLS and triggers still apply to every row touched).
-- Each runs in a single transaction.
-- ---------------------------------------------------------------------------
create or replace function public.create_person_record(
  p_profile_id uuid, p_full_name text, p_email text, p_role public.user_role,
  p_registration_number text default null, p_programme_id uuid default null, p_year_of_study smallint default null,
  p_staff_number text default null, p_department_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.profiles (id, full_name, email, role) values (p_profile_id, p_full_name, lower(p_email), p_role);
  if p_role = 'student' then
    insert into public.students (profile_id, registration_number, programme_id, year_of_study)
    values (p_profile_id, p_registration_number, p_programme_id, p_year_of_study) returning id into v_id;
  elsif p_role = 'lecturer' then
    insert into public.lecturers (profile_id, staff_number, department_id)
    values (p_profile_id, p_staff_number, p_department_id) returning id into v_id;
  else
    v_id := p_profile_id;
  end if;
  return v_id;
end $$;

create or replace function public.update_student_record(
  p_student_id uuid, p_full_name text, p_registration_number text, p_programme_id uuid, p_year_of_study smallint
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.students set registration_number = p_registration_number, programme_id = p_programme_id,
         year_of_study = p_year_of_study where id = p_student_id;
  if not found then raise exception 'Student not found' using errcode = 'P0002'; end if;
  update public.profiles set full_name = p_full_name
   where id = (select profile_id from public.students where id = p_student_id);
end $$;

create or replace function public.update_lecturer_record(
  p_lecturer_id uuid, p_full_name text, p_staff_number text, p_department_id uuid
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.lecturers set staff_number = p_staff_number, department_id = p_department_id where id = p_lecturer_id;
  if not found then raise exception 'Lecturer not found' using errcode = 'P0002'; end if;
  update public.profiles set full_name = p_full_name
   where id = (select profile_id from public.lecturers where id = p_lecturer_id);
end $$;

-- Moves every eligible result of a course offering to p_target in one transaction.
create or replace function public.transition_course_results(
  p_course_id uuid, p_period_id uuid, p_target public.publication_status
) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare v_count integer;
begin
  if not (private.is_admin() or private.lecturer_teaches(p_course_id, p_period_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_target = 'corrected' then raise exception 'Invalid target status' using errcode = 'P0001'; end if;

  update public.results r
     set publication_status = p_target
    from public.enrollments e
   where e.id = r.enrollment_id
     and e.course_id = p_course_id
     and e.academic_period_id = p_period_id
     and e.enrollment_status <> 'withdrawn'
     and r.result_status <> 'incomplete'
     and case p_target
           when 'submitted' then r.publication_status = 'draft'
           when 'published' then r.publication_status in ('draft', 'submitted')
           when 'draft' then r.publication_status = 'submitted'
         end;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Replaces a grading scale atomically and checks that it covers 0–100 without gaps.
create or replace function public.replace_grading_scale(p_period_id uuid, p_bands jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  b record;
  v_prev numeric := null;
  v_first boolean := true;
begin
  if not private.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.grading_scales where academic_period_id is not distinct from p_period_id;
  insert into public.grading_scales (academic_period_id, grade, minimum_mark, maximum_mark, grade_point, description)
  select p_period_id, x.grade, x."minimumMark", x."maximumMark", x."gradePoint", x.description
  from jsonb_to_recordset(p_bands) as x(grade text, "minimumMark" numeric, "maximumMark" numeric,
                                        "gradePoint" numeric, description text);

  for b in select minimum_mark, maximum_mark from public.grading_scales
           where academic_period_id is not distinct from p_period_id order by minimum_mark loop
    if v_first and b.minimum_mark <> 0 then raise exception 'The lowest band must start at 0' using errcode = 'P0001'; end if;
    if not v_first and b.minimum_mark - v_prev <> 0.01 then
      raise exception 'Grade bands must be contiguous (gap or overlap near %)', b.minimum_mark using errcode = 'P0001';
    end if;
    v_prev := b.maximum_mark;
    v_first := false;
  end loop;
  if v_first then raise exception 'At least one band is required' using errcode = 'P0001'; end if;
  if v_prev <> 100 then raise exception 'The highest band must end at 100' using errcode = 'P0001'; end if;
end $$;

revoke execute on function public.create_person_record, public.update_student_record, public.update_lecturer_record,
  public.transition_course_results, public.replace_grading_scale from public, anon;
grant execute on function public.create_person_record, public.update_student_record, public.update_lecturer_record,
  public.transition_course_results, public.replace_grading_scale to authenticated;

-- ---------------------------------------------------------------------------
-- Read views. security_invoker = on means the caller's RLS applies.
-- ---------------------------------------------------------------------------
create view public.student_directory with (security_invoker = on) as
select s.id, s.profile_id, s.registration_number, s.programme_id, s.year_of_study, s.created_at,
       p.full_name, p.email, p.account_status,
       pr.programme_code, pr.programme_name, pr.department_id
from public.students s
join public.profiles p on p.id = s.profile_id
join public.programmes pr on pr.id = s.programme_id;

create view public.lecturer_directory with (security_invoker = on) as
select l.id, l.profile_id, l.staff_number, l.department_id, l.created_at,
       p.full_name, p.email, p.account_status,
       d.department_code, d.department_name,
       (select count(*) from public.course_assignments ca where ca.lecturer_id = l.id)::int as assigned_courses
from public.lecturers l
join public.profiles p on p.id = l.profile_id
join public.departments d on d.id = l.department_id;

create view public.enrollment_details with (security_invoker = on) as
select e.id, e.student_id, e.course_id, e.academic_period_id, e.enrollment_status, e.created_at,
       sd.registration_number, sd.full_name, sd.programme_code, sd.programme_name, sd.year_of_study,
       r.id as result_id, r.coursework_mark, r.examination_mark, r.total_mark, r.grade, r.grade_point,
       r.result_status, r.publication_status, r.version, r.updated_at as result_updated_at, r.published_at
from public.enrollments e
join public.student_directory sd on sd.id = e.student_id
left join public.results r on r.enrollment_id = e.id;

create view public.result_details with (security_invoker = on) as
select r.id, r.enrollment_id, r.coursework_mark, r.examination_mark, r.total_mark, r.grade, r.grade_point,
       r.result_status, r.publication_status, r.version, r.correction_reason,
       r.created_at, r.updated_at, r.published_at,
       e.student_id, e.course_id, e.academic_period_id,
       s.registration_number, p.full_name as student_name,
       c.course_code, c.course_name, c.credit_units,
       ap.academic_year, ap.semester, ap.start_date, ap.status as period_status
from public.results r
join public.enrollments e on e.id = r.enrollment_id
join public.students s on s.id = e.student_id
join public.profiles p on p.id = s.profile_id
join public.courses c on c.id = e.course_id
join public.academic_periods ap on ap.id = e.academic_period_id;

create view public.assignment_details with (security_invoker = on) as
select ca.id, ca.lecturer_id, ca.course_id, ca.academic_period_id, ca.created_at,
       p.full_name as lecturer_name, l.staff_number,
       c.course_code, c.course_name, c.credit_units, c.pass_mark,
       ap.academic_year, ap.semester, ap.start_date, ap.status as period_status,
       coalesce(st.enrolled, 0) as enrolled_count,
       coalesce(st.complete, 0) as complete_count,
       coalesce(st.draft, 0) as draft_count,
       coalesce(st.submitted, 0) as submitted_count,
       coalesce(st.published, 0) as published_count
from public.course_assignments ca
join public.lecturers l on l.id = ca.lecturer_id
left join public.profiles p on p.id = l.profile_id
join public.courses c on c.id = ca.course_id
join public.academic_periods ap on ap.id = ca.academic_period_id
left join lateral (
  select count(*) filter (where e.enrollment_status <> 'withdrawn')::int as enrolled,
         count(r.id) filter (where r.result_status <> 'incomplete')::int as complete,
         count(r.id) filter (where r.publication_status = 'draft')::int as draft,
         count(r.id) filter (where r.publication_status = 'submitted')::int as submitted,
         count(r.id) filter (where r.publication_status in ('published', 'corrected'))::int as published
  from public.enrollments e left join public.results r on r.enrollment_id = e.id
  where e.course_id = ca.course_id and e.academic_period_id = ca.academic_period_id
) st on true;

-- Per course offering: progress and performance (complete results of any status).
create view public.course_result_summary with (security_invoker = on) as
select e.course_id, e.academic_period_id,
       c.course_code, c.course_name,
       ap.academic_year, ap.semester, ap.start_date, ap.status as period_status,
       (select string_agg(p.full_name, ', ')
          from public.course_assignments ca
          join public.lecturers l on l.id = ca.lecturer_id
          join public.profiles p on p.id = l.profile_id
         where ca.course_id = e.course_id and ca.academic_period_id = e.academic_period_id) as lecturer_name,
       count(*) filter (where e.enrollment_status <> 'withdrawn')::int as enrolled,
       count(r.id)::int as results_entered,
       (count(*) filter (where e.enrollment_status <> 'withdrawn')
         - count(r.id) filter (where r.result_status <> 'incomplete'))::int as incomplete,
       count(r.id) filter (where r.publication_status = 'draft')::int as draft,
       count(r.id) filter (where r.publication_status = 'submitted')::int as submitted,
       count(r.id) filter (where r.publication_status in ('published', 'corrected'))::int as published,
       count(r.id) filter (where r.result_status <> 'incomplete' and r.publication_status in ('draft', 'submitted'))::int as ready_to_publish,
       count(r.id) filter (where r.result_status = 'pass')::int as pass_count,
       count(r.id) filter (where r.result_status = 'fail')::int as fail_count,
       round(avg(r.total_mark), 2) as mean_mark,
       max(r.total_mark) as highest_mark,
       min(r.total_mark) as lowest_mark
from public.enrollments e
join public.courses c on c.id = e.course_id
join public.academic_periods ap on ap.id = e.academic_period_id
left join public.results r on r.enrollment_id = e.id
group by e.course_id, e.academic_period_id, c.course_code, c.course_name,
         ap.academic_year, ap.semester, ap.start_date, ap.status;

create view public.grade_counts with (security_invoker = on) as
select e.course_id, e.academic_period_id, r.grade, r.publication_status, count(*)::int as total
from public.results r
join public.enrollments e on e.id = r.enrollment_id
where r.grade is not null
group by e.course_id, e.academic_period_id, r.grade, r.publication_status;
