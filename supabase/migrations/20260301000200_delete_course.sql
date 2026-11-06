-- Deletes a mistakenly registered course together with its enrollments, as long as no
-- marks have been entered for it. Runs as the caller (SECURITY INVOKER), so RLS still
-- applies: only admins may delete enrollments, and only draft results. Every deleted row
-- is audit-logged by the existing AFTER triggers with auth.uid() as the actor.
--
-- Refused (P0001) when:
--   * any result of the course has a coursework or exam mark, or is no longer a draft;
--   * the course has coursework assignments (lecturer content, removed separately).
-- Lecturer assignments to the course are removed by the existing ON DELETE CASCADE.
create or replace function public.delete_course(p_course_id uuid)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_marked integer;
  v_results integer;
  v_enrollments integer;
begin
  if not private.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;

  -- Lock the course so no enrollment or mark can be added while we check and delete.
  perform 1 from public.courses where id = p_course_id for update;
  if not found then raise exception 'Course not found' using errcode = 'P0002'; end if;

  select count(*) into v_marked
    from public.results r
    join public.enrollments e on e.id = r.enrollment_id
   where e.course_id = p_course_id
     and (r.coursework_mark is not null or r.examination_mark is not null or r.publication_status <> 'draft');
  if v_marked > 0 then
    raise exception 'This course cannot be deleted because marks have been entered for % student(s). Courses with marks are kept as academic records.', v_marked
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.assignments where course_id = p_course_id) then
    raise exception 'This course has coursework assignments. Delete them on the Coursework page first, then delete the course.'
      using errcode = 'P0001';
  end if;

  -- Results here are empty drafts (no marks), which RLS lets admins delete.
  delete from public.results r
   using public.enrollments e
   where e.id = r.enrollment_id and e.course_id = p_course_id;
  get diagnostics v_results = row_count;

  delete from public.enrollments where course_id = p_course_id;
  get diagnostics v_enrollments = row_count;

  delete from public.courses where id = p_course_id;

  return jsonb_build_object('enrollments', v_enrollments, 'emptyResults', v_results);
end $$;

revoke execute on function public.delete_course(uuid) from public, anon;
grant execute on function public.delete_course(uuid) to authenticated;
