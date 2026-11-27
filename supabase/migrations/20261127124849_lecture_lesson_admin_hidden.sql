-- 강의 2단계 작업 1 다음. 관리자가 차시 하나만 강제 비공개한다.
-- 차시 마이그레이션(20261127100219_lecture_lessons.sql)은 고치지 않는다.
-- 상태로 숨기면 웹훅이 ready로 덮으므로 admin_hidden으로 상태와 분리한다.
-- 다시 공개는 두지 않는다. 강의 강제 비공개와 같이 한 방향으로만 숨긴다.
-- service_role 권한은 1단계에서 준 그대로 둔다. 여기서 revoke하거나 다시 grant하지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lecture_lessons'
      and column_name = 'admin_hidden'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_ALREADY_EXISTS: lecture_lessons.admin_hidden';
  end if;

  if to_regclass('public.lecture_lessons') is null then
    missing := array_append(missing, 'public.lecture_lessons');
  end if;
  if to_regclass('public.lecture_progress') is null then
    missing := array_append(missing, 'public.lecture_progress');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.guard_lecture_lesson_update()') is null then
    missing := array_append(missing, 'private.guard_lecture_lesson_update()');
  end if;
  if to_regprocedure('private.guard_lecture_progress_write()') is null then
    missing := array_append(missing, 'private.guard_lecture_progress_write()');
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname = 'lecture_lessons_select_published_ready'
  ) then
    missing := array_append(missing, 'lecture_lessons_select_published_ready');
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname = 'lecture_lessons_select_owner'
  ) then
    missing := array_append(missing, 'lecture_lessons_select_owner');
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname = 'lecture_lessons_select_admin'
  ) then
    missing := array_append(missing, 'lecture_lessons_select_admin');
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_progress'
      and policyname = 'lecture_progress_insert_own'
  ) then
    missing := array_append(missing, 'lecture_progress_insert_own');
  end if;
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_progress'
      and policyname = 'lecture_progress_update_own'
  ) then
    missing := array_append(missing, 'lecture_progress_update_own');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;
end;
$prerequisite$;

alter table public.lecture_lessons
add column admin_hidden boolean not null default false;

drop policy lecture_lessons_select_published_ready on public.lecture_lessons;
create policy lecture_lessons_select_published_ready on public.lecture_lessons
for select to anon, authenticated
using (
  status = 'ready'
  and admin_hidden = false
  and exists (
    select 1
    from public.lectures
    where id = lecture_id
      and is_published
  )
);

create policy lecture_lessons_update_admin_hide on public.lecture_lessons
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

grant update (admin_hidden) on public.lecture_lessons to authenticated;

create or replace function private.guard_lecture_lesson_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.lecture_id is distinct from old.lecture_id
    or new.teacher_id is distinct from old.teacher_id
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_IDENTITY_IMMUTABLE';
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if (select private.is_admin())
    and new.admin_hidden is distinct from old.admin_hidden
  then
    if old.admin_hidden
      or not new.admin_hidden
      or new.title is distinct from old.title
      or new.sort_order is distinct from old.sort_order
      or new.provider is distinct from old.provider
      or new.provider_video_id is distinct from old.provider_video_id
      or new.status is distinct from old.status
      or new.duration_seconds is distinct from old.duration_seconds
      or new.storage_bytes is distinct from old.storage_bytes
      or new.provider_status is distinct from old.provider_status
      or new.last_event_at is distinct from old.last_event_at
      or new.updated_at is distinct from old.updated_at
    then
      raise exception using
        errcode = '42501',
        message = 'LECTURE_LESSON_ADMIN_HIDE_ONLY';
    end if;
    return new;
  end if;

  if (select auth.uid()) is distinct from old.teacher_id
    or not exists (
      select 1
      from public.teachers
      where user_id = (select auth.uid())
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_UPDATE_TEACHER_REQUIRED';
  end if;

  if new.admin_hidden is distinct from old.admin_hidden then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_IMMUTABLE';
  end if;

  if new.provider is distinct from old.provider
    or new.provider_video_id is distinct from old.provider_video_id
    or new.status is distinct from old.status
    or new.duration_seconds is distinct from old.duration_seconds
    or new.storage_bytes is distinct from old.storage_bytes
    or new.provider_status is distinct from old.provider_status
    or new.last_event_at is distinct from old.last_event_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_SERVER_FIELDS_IMMUTABLE';
  end if;

  return new;
end;
$$;

create or replace function private.guard_lecture_progress_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and (
      new.user_id is distinct from old.user_id
      or new.lesson_id is distinct from old.lesson_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_IDENTITY_IMMUTABLE';
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if (select auth.uid()) is distinct from new.user_id then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_OWNER_REQUIRED';
  end if;

  if exists (
    select 1
    from public.lecture_lessons as lesson
    where lesson.id = new.lesson_id
      and lesson.admin_hidden
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_LESSON_HIDDEN';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = new.lesson_id
      and lesson.admin_hidden = false
      and (
        (lecture.is_published and lesson.status = 'ready')
        or (
          lesson.teacher_id = (select auth.uid())
          and exists (
            select 1
            from public.teachers
            where user_id = (select auth.uid())
          )
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_PROGRESS_LESSON_NOT_VISIBLE';
  end if;

  return new;
end;
$$;

drop policy lecture_progress_insert_own on public.lecture_progress;
create policy lecture_progress_insert_own on public.lecture_progress
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = lesson_id
      and lesson.admin_hidden = false
      and (
        (lecture.is_published and lesson.status = 'ready')
        or (
          lesson.teacher_id = (select auth.uid())
          and exists (
            select 1
            from public.teachers
            where user_id = (select auth.uid())
          )
        )
      )
  )
);

drop policy lecture_progress_update_own on public.lecture_progress;
create policy lecture_progress_update_own on public.lecture_progress
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.lecture_lessons lesson
    where lesson.id = lesson_id
      and lesson.admin_hidden = false
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.lecture_lessons lesson
    where lesson.id = lesson_id
      and lesson.admin_hidden = false
  )
);

create index lecture_lessons_public_ready_idx
on public.lecture_lessons (lecture_id, sort_order, id)
where status = 'ready' and admin_hidden = false;
