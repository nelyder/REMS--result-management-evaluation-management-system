-- Fix: progress and report views counted results of WITHDRAWN students.
-- A student can be withdrawn while their result is still a draft (possibly complete), so
-- "complete" could exceed "enrolled" (progress over 100 %), "incomplete" could go negative,
-- and pass/fail counts, means and grade counts included students no longer on the course.
-- Only non-withdrawn enrollments are counted now. Column lists are unchanged.

create or replace view public.assignment_details with (security_invoker = on) as
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
  select count(*)::int as enrolled,
         count(r.id) filter (where r.result_status <> 'incomplete')::int as complete,
         count(r.id) filter (where r.publication_status = 'draft')::int as draft,
         count(r.id) filter (where r.publication_status = 'submitted')::int as submitted,
         count(r.id) filter (where r.publication_status in ('published', 'corrected'))::int as published
  from public.enrollments e left join public.results r on r.enrollment_id = e.id
  where e.course_id = ca.course_id and e.academic_period_id = ca.academic_period_id
    and e.enrollment_status <> 'withdrawn'
) st on true;

create or replace view public.course_result_summary with (security_invoker = on) as
select e.course_id, e.academic_period_id,
       c.course_code, c.course_name,
       ap.academic_year, ap.semester, ap.start_date, ap.status as period_status,
       (select string_agg(p.full_name, ', ')
          from public.course_assignments ca
          join public.lecturers l on l.id = ca.lecturer_id
          join public.profiles p on p.id = l.profile_id
         where ca.course_id = e.course_id and ca.academic_period_id = e.academic_period_id) as lecturer_name,
       count(*)::int as enrolled,
       count(r.id)::int as results_entered,
       (count(*) - count(r.id) filter (where r.result_status <> 'incomplete'))::int as incomplete,
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
where e.enrollment_status <> 'withdrawn'
group by e.course_id, e.academic_period_id, c.course_code, c.course_name,
         ap.academic_year, ap.semester, ap.start_date, ap.status;

create or replace view public.grade_counts with (security_invoker = on) as
select e.course_id, e.academic_period_id, r.grade, r.publication_status, count(*)::int as total
from public.results r
join public.enrollments e on e.id = r.enrollment_id
where r.grade is not null and e.enrollment_status <> 'withdrawn'
group by e.course_id, e.academic_period_id, r.grade, r.publication_status;
