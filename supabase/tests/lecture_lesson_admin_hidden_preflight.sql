-- 1단계 스키마(teachers, lectures, lecture_upload_consents)와
-- 차시 스키마(lecture_lessons, lecture_webhook_events, lecture_storage_state, lecture_progress)는
-- 이미 운영에 적용되어 있다.
-- 차시 마이그레이션(20261127100219_lecture_lessons.sql)은 고치지 않고 이 파일에 다시 넣지 않는다.
-- 아래 EXACT MIGRATION이 차시 관리자 숨김 본문이다. admin_hidden 칸이 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 관리자는 기존 관리자 profile을 쓴다. 선생님과 일반 회원은 같은 트랜잭션의 임시 auth.users다.
-- 임시 계정은 고정 UUID와 example.invalid 메일이며, profile은 가입 트리거가 만들면 그대로 쓰고 없으면 role=user로 넣는다.
-- 진도 외래 키 때문에 profile이 있는 임시 회원을 쓴다. 프로필 없는 인증 역할은 쓰지 않는다.
-- 원본 보존 검사 전에 임시 사용자·profile을 지우고, 성공 예외로 트랜잭션 전체를 롤백한다.
-- storage.objects 정리 삭제는 그 구간에서만 set local storage.allow_delete_query = 'true'로 둔다.
-- 실제 계정·profile·기존 업무 행은 바꾸지 않는다.
-- 실행 역할은 anon, authenticated, service_role로 set role 할 수 있어야 한다.
-- 실제 로그인·Auth 세션·Data API·Bunny 호출 검증이 아니다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.teachers') is null
    or to_regclass('public.lectures') is null
    or to_regclass('public.lecture_upload_consents') is null
  then
    missing := array_append(missing, '1단계 teachers, lectures, lecture_upload_consents');
  end if;
  if to_regclass('public.lecture_lessons') is null
    or to_regclass('public.lecture_webhook_events') is null
    or to_regclass('public.lecture_storage_state') is null
    or to_regclass('public.lecture_progress') is null
  then
    missing := array_append(missing, '차시 lecture_lessons, lecture_webhook_events, lecture_storage_state, lecture_progress');
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
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
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if to_regrole('service_role') is null then
    missing := array_append(missing, 'service_role');
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lecture_lessons'
      and column_name = 'admin_hidden'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_ALREADY_APPLIED: lecture_lessons.admin_hidden';
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.lecture_lesson_hide_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  table_name text;
  component jsonb;
  policy_hash text;
begin
  foreach table_name in array array['profiles', 'classes', 'contents']
  loop
    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '
      || quote_literal('') || ' order by t.id::text), ' || quote_literal('') || '))) '
      || 'from public.' || quote_ident(table_name) || ' t'
    into component;
    state := state || jsonb_build_object(table_name || '_rows', component);

    execute
      'select jsonb_build_object('
      || quote_literal('columns') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || quote_literal('') || ' order by s.attnum), ' || quote_literal('') || ')) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a left join pg_attrdef d '
      || 'on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('policies') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '
      || quote_literal('') || ' order by p.policyname), ' || quote_literal('') || ')) '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || '))'
    into component;
    state := state || jsonb_build_object(table_name || '_catalog', component);
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(u)::text), '' order by u.id::text), ''))
  )
  into component
  from auth.users u;
  state := state || jsonb_build_object('auth_users', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(o)::text), '' order by o.id::text), ''))
  )
  into component
  from storage.objects o;
  state := state || jsonb_build_object('storage_objects', component);

  select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  into policy_hash
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname in (
      'public_images_select_admin',
      'public_images_insert_admin',
      'public_images_update_admin',
      'public_images_delete_admin'
    );
  state := state || jsonb_build_object('admin_storage_policies', to_jsonb(policy_hash));

  select jsonb_build_object(
    'anon_select', has_table_privilege('anon', 'public.lectures', 'SELECT'),
    'authenticated_delete', has_table_privilege('authenticated', 'public.lectures', 'DELETE'),
    'service_select', has_table_privilege('service_role', 'public.lectures', 'SELECT'),
    'service_insert', has_table_privilege('service_role', 'public.lectures', 'INSERT'),
    'service_update', has_table_privilege('service_role', 'public.lectures', 'UPDATE'),
    'service_delete', has_table_privilege('service_role', 'public.lectures', 'DELETE'),
    'policies', md5(coalesce((
      select string_agg(md5(to_jsonb(p)::text), '' order by p.policyname)
      from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'lectures'
    ), ''))
  )
  into component;
  state := state || jsonb_build_object('lectures_access', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table lecture_lesson_hide_baseline as
select jsonb_build_object(
  'format', 'lecture-lesson-admin-hidden-preflight-v1',
  'eligible', true,
  'state', pg_temp.lecture_lesson_hide_snapshot()
) as snapshot;

-- BEGIN EXACT MIGRATION
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
-- END EXACT MIGRATION

create temporary table lecture_lesson_hide_actors (
  kind text primary key,
  id uuid not null unique
);
insert into lecture_lesson_hide_actors (kind, id)
select 'admin', id
from public.profiles
where role = 'admin'
order by id
limit 1;
insert into lecture_lesson_hide_actors (kind, id)
values
  ('teacher', 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'),
  ('member', 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2');

do $temp_users$
begin
  if (select count(*) from lecture_lesson_hide_actors) <> 3
    or exists (
      select 1
      from auth.users
      where id in (
        'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid,
        'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'::uuid
      )
      or email in (
        'lecture-lesson-hide-teacher@example.invalid',
        'lecture-lesson-hide-member@example.invalid'
      )
    )
    or exists (
      select 1
      from public.profiles
      where id in (
        'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid,
        'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'::uuid
      )
    )
    or exists (
      select 1
      from storage.objects
      where strpos(name, 'lectures/a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1/') = 1
        or strpos(name, 'lectures/b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2/') = 1
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_PREREQUISITE_FAILED: 임시 검사 계정을 만들 수 없습니다';
  end if;
end;
$temp_users$;

insert into auth.users (id, email)
values
  ('a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1', 'lecture-lesson-hide-teacher@example.invalid'),
  ('b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2', 'lecture-lesson-hide-member@example.invalid');

insert into public.profiles (id, role)
select actor.id, 'user'
from lecture_lesson_hide_actors as actor
where actor.kind in ('teacher', 'member')
  and not exists (
    select 1
    from public.profiles as profile
    where profile.id = actor.id
  );

do $temp_profiles$
begin
  if (
    select count(*)
    from public.profiles as profile
    join lecture_lesson_hide_actors as actor on actor.id = profile.id
    where actor.kind in ('teacher', 'member')
      and profile.role = 'user'
  ) <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_PREREQUISITE_FAILED: 임시 일반 회원 profile 2명 필요';
  end if;
end;
$temp_profiles$;

create temporary table lecture_lesson_hide_rows (
  kind text primary key,
  id uuid not null unique
);

create function pg_temp.lecture_lesson_hide_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'LECTURE_LESSON_ADMIN_HIDDEN_ASSERT_FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.lecture_lesson_hide_expected_error(
  command text,
  expected_state text,
  label text
)
returns void
language plpgsql
security invoker
as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate <> expected_state then
      raise;
    end if;
    return;
  end;
  raise exception 'LECTURE_LESSON_ADMIN_HIDDEN_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.lecture_lesson_hide_no_rows(command text, label text)
returns void
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  execute command;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'LECTURE_LESSON_ADMIN_HIDDEN_EXPECTED_NO_ROWS: % (% rows)', label, affected;
  end if;
end;
$$;

grant select, insert on lecture_lesson_hide_actors, lecture_lesson_hide_rows
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lesson_hide_assert(boolean, text)
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lesson_hide_expected_error(text, text, text)
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lesson_hide_no_rows(text, text)
to anon, authenticated, service_role;

select pg_temp.lecture_lesson_hide_assert(
  (
    select attnotnull
      and pg_get_expr(ad.adbin, ad.adrelid) = 'false'
    from pg_attribute as attribute
    left join pg_attrdef as ad
      on ad.adrelid = attribute.attrelid
      and ad.adnum = attribute.attnum
    where attribute.attrelid = 'public.lecture_lessons'::regclass
      and attribute.attname = 'admin_hidden'
      and not attribute.attisdropped
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname = 'lecture_lessons_update_admin_hide'
      and qual like '%is_admin%'
      and with_check like '%is_admin%'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname = 'lecture_lessons_select_published_ready'
      and qual like '%admin_hidden = false%'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lecture_lessons'
      and policyname in (
        'lecture_lessons_select_owner',
        'lecture_lessons_select_admin'
      )
      and qual like '%admin_hidden%'
  )
  and to_regclass('public.lecture_lessons_public_ready_idx') is not null,
  'admin_hidden 기본값과 공개 조회·관리자 수정 정책'
);
select pg_temp.lecture_lesson_hide_assert(
  has_column_privilege('authenticated', 'public.lecture_lessons', 'admin_hidden', 'UPDATE')
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'title', 'UPDATE')
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'sort_order', 'UPDATE')
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'status', 'UPDATE') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'admin_hidden', 'INSERT') is not true
  and has_table_privilege('service_role', 'public.lecture_lessons', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_progress', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_progress', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_progress', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_progress', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_webhook_events', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_storage_state', 'UPDATE'),
  'authenticated admin_hidden 수정 추가와 service_role 권한 유지'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.teachers (user_id)
select id from lecture_lesson_hide_actors where kind = 'teacher';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.lecture_upload_consents (user_id, statement)
select id, '본인이 권리를 가진 영상만 올린다'
from lecture_lesson_hide_actors
where kind = 'teacher';
with inserted as (
  insert into public.lectures (teacher_id, title, description, field, is_published)
  select id, '숨김검사 사주 강의', '롤백되는 소개', 'saju', true
  from lecture_lesson_hide_actors
  where kind = 'teacher'
  returning id
)
insert into lecture_lesson_hide_rows (kind, id)
select 'lecture', id from inserted;
with inserted as (
  insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order)
  select
    (select id from lecture_lesson_hide_rows where kind = 'lecture'),
    id,
    '1강',
    0
  from lecture_lesson_hide_actors
  where kind = 'teacher'
  returning id
)
insert into lecture_lesson_hide_rows (kind, id)
select 'lesson_visible', id from inserted;
with inserted as (
  insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order)
  select
    (select id from lecture_lesson_hide_rows where kind = 'lecture'),
    id,
    '2강',
    1
  from lecture_lesson_hide_actors
  where kind = 'teacher'
  returning id
)
insert into lecture_lesson_hide_rows (kind, id)
select 'lesson_keep', id from inserted;
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order, admin_hidden) select %L::uuid, id, %L, %s, true from lecture_lesson_hide_actors where kind = %L',
    (select id from lecture_lesson_hide_rows where kind = 'lecture'),
    '숨긴 채 작성',
    '2',
    'teacher'
  ),
  '42501',
  '선생님 admin_hidden 직접 insert 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.lecture_lessons
set status = 'ready', duration_seconds = 90, storage_bytes = 10
where id in (
  select id from lecture_lesson_hide_rows where kind in ('lesson_visible', 'lesson_keep')
);
select pg_temp.lecture_lesson_hide_assert(
  (
    select count(*) = 2
      and bool_and(status = 'ready')
      and bool_and(admin_hidden = false)
    from public.lecture_lessons
    where id in (
      select id from lecture_lesson_hide_rows where kind in ('lesson_visible', 'lesson_keep')
    )
  ),
  'service_role은 숨김 칸을 유지한 채 ready로 기록'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lecture_lesson_hide_assert(
  (
    select count(*) = 2
    from public.lecture_lessons
    where id in (
      select id from lecture_lesson_hide_rows where kind in ('lesson_visible', 'lesson_keep')
    )
  ),
  '비로그인은 숨기기 전 ready 차시를 본다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.lecture_progress (user_id, lesson_id, position_seconds)
select id, (select id from lecture_lesson_hide_rows where kind = 'lesson_visible'), 15
from lecture_lesson_hide_actors
where kind = 'member';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'update public.lecture_lessons set admin_hidden = true where id = %L::uuid',
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '42501',
  '선생님 admin_hidden 변경 거부'
);
select pg_temp.lecture_lesson_hide_assert(
  (
    select admin_hidden = false and title = '1강' and status = 'ready'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '선생님 변경 거부 뒤 숨김 칸은 그대로다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'update public.lecture_lessons set title = %L where id = %L::uuid',
    '관리자 수정',
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '42501',
  '관리자 제목 변경 거부'
);
update public.lecture_lessons
set admin_hidden = true
where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible');
select pg_temp.lecture_lesson_hide_assert(
  (
    select admin_hidden
      and title = '1강'
      and status = 'ready'
      and sort_order = 0
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  )
  and (
    select admin_hidden = false and title = '2강'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_keep')
  ),
  '관리자 숨김 성공'
);
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'update public.lecture_lessons set admin_hidden = false where id = %L::uuid',
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '42501',
  '관리자 다시 공개 거부'
);
select pg_temp.lecture_lesson_hide_assert(
  (
    select admin_hidden and title = '1강'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '다시 공개 거부 뒤에도 숨김이 유지된다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lecture_lesson_hide_assert(
  not exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  )
  and exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_keep')
      and admin_hidden = false
      and status = 'ready'
  ),
  '비로그인에서 숨긴 차시가 안 보임'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'teacher'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'update public.lecture_lessons set admin_hidden = false where id = %L::uuid',
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '42501',
  '선생님은 숨긴 차시를 다시 공개하지 못한다'
);
update public.lecture_lessons
set title = '1강 수정'
where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible');
select pg_temp.lecture_lesson_hide_assert(
  (
    select admin_hidden and title = '1강 수정'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '선생님은 숨긴 차시를 보고 제목만 고친다'
);
select pg_temp.lecture_lesson_hide_expected_error(
  format(
    'insert into public.lecture_progress (user_id, lesson_id, position_seconds) select id, %L::uuid, %s from lecture_lesson_hide_actors where kind = %L',
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible'),
    '4',
    'teacher'
  ),
  '42501',
  '선생님도 숨긴 차시 진도를 쓰지 못한다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_hide_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_hide_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lesson_hide_no_rows(
  format(
    'update public.lecture_progress set position_seconds = %s where user_id = %L::uuid and lesson_id = %L::uuid',
    '30',
    (select id from lecture_lesson_hide_actors where kind = 'member'),
    (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  '숨긴 차시 진도 수정 0행'
);
insert into public.lecture_progress (user_id, lesson_id, position_seconds)
select id, (select id from lecture_lesson_hide_rows where kind = 'lesson_keep'), 5
from lecture_lesson_hide_actors
where kind = 'member';
select pg_temp.lecture_lesson_hide_assert(
  (
    select position_seconds = 15
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_hide_actors where kind = 'member')
      and lesson_id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  )
  and (
    select position_seconds = 5
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_hide_actors where kind = 'member')
      and lesson_id = (select id from lecture_lesson_hide_rows where kind = 'lesson_keep')
  ),
  '숨긴 차시 진도는 그대로고 보이는 차시 진도는 저장된다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.lecture_lessons
set status = 'ready', provider_status = '4', last_event_at = now()
where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible');
select pg_temp.lecture_lesson_hide_assert(
  (
    select admin_hidden and status = 'ready' and provider_status = '4'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_hide_rows where kind = 'lesson_visible')
  ),
  'service_role 상태 기록은 숨김을 되돌리지 않는다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local storage.allow_delete_query = 'true';
delete from storage.objects
where strpos(name, 'lectures/a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1/') = 1
  or strpos(name, 'lectures/b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2/') = 1;
set local storage.allow_delete_query = 'false';

delete from public.lectures
where teacher_id in (
  select id
  from lecture_lesson_hide_actors
  where kind in ('teacher', 'member')
);
delete from auth.users
where id in (
  select id
  from lecture_lesson_hide_actors
  where kind in ('teacher', 'member')
);
select pg_temp.lecture_lesson_hide_assert(
  (
    select count(*) = 0
    from auth.users
    where id in (
      'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid,
      'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'::uuid
    )
    or email in (
      'lecture-lesson-hide-teacher@example.invalid',
      'lecture-lesson-hide-member@example.invalid'
    )
  )
  and (
    select count(*) = 0
    from public.profiles
    where id in (
      'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1'::uuid,
      'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'::uuid
    )
  )
  and (
    select count(*) = 0
    from storage.objects
    where strpos(name, 'lectures/a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1/') = 1
      or strpos(name, 'lectures/b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2/') = 1
  ),
  '임시 사용자·profile·Storage 객체를 원본 보존 검사 전에 제거'
);
select pg_temp.lecture_lesson_hide_assert(
  pg_temp.lecture_lesson_hide_snapshot() = (
    select snapshot->'state'
    from lecture_lesson_hide_baseline
  ),
  '기존 profile·클래스·콘텐츠·인증·Storage·강의 권한 원본 보존'
);

do $success$
declare
  baseline jsonb;
begin
  select snapshot into baseline from lecture_lesson_hide_baseline;
  raise exception using
    errcode = 'P0001',
    message = 'LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_OK: 비로그인 숨김 차시 조회 차단, 관리자 숨김과 다시 공개 거부, 선생님 admin_hidden 변경 거부, 숨긴 차시 진도 차단을 통과. 테스트 행은 의도된 전체 롤백으로 제거됨. 실제 Data API·브라우저 세션·Bunny 호출은 미검증. 선생님과 일반 회원은 임시 auth.users·profile의 DB 역할 검사(실제 로그인 검증 아님).',
    detail = baseline::text;
end;
$success$;
