-- 1단계 스키마(teachers, lectures, lecture_upload_consents)가 이미 적용된 DB에서 전체 실행한다.
-- 1단계 마이그레이션은 이 파일에 다시 넣지 않는다. 아래 EXACT MIGRATION이 2단계 본문이다.
-- 마지막 SQLSTATE P0001과 LECTURE_LESSONS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 계정·profile·기존 업무 행은 바꾸지 않으며 성공 예외로 전체 롤백한다.
-- 실행 역할은 anon, authenticated, service_role로 set role 할 수 있어야 한다.
-- 선생님 둘과 일반 회원은 아직 teachers에 없는 기존 role=user profile이다.
-- 진도 외래 키 때문에 프로필 없는 인증 역할은 쓰지 않는다.
-- 실제 로그인·Auth 세션·Data API·Bunny 호출 검증이 아니다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  candidate_count integer;
begin
  if to_regclass('public.teachers') is null
    or to_regclass('public.lectures') is null
    or to_regclass('public.lecture_upload_consents') is null
  then
    missing := array_append(missing, '1단계 teachers, lectures, lecture_upload_consents');
  end if;
  if to_regclass('public.lecture_lessons') is not null
    or to_regclass('public.lecture_webhook_events') is not null
    or to_regclass('public.lecture_storage_state') is not null
    or to_regclass('public.lecture_progress') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_ALREADY_APPLIED: lecture_lessons, lecture_webhook_events, lecture_storage_state, lecture_progress';
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
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

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;

  select count(*) into candidate_count
  from public.profiles
  where role = 'user'
    and not exists (
      select 1
      from public.teachers
      where user_id = profiles.id
    );
  if candidate_count < 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_PREREQUISITE_FAILED: 선생님이 아닌 기존 일반 회원 profile 3명 필요';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.lectures'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_PREREQUISITE_FAILED: lectures RLS 비활성';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lectures'
      and policyname = 'lectures_delete_owner'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_PREFLIGHT_PREREQUISITE_FAILED: lectures_delete_owner 정책 필요';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.lecture_lessons_snapshot()
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

create temporary table lecture_lessons_baseline as
select jsonb_build_object(
  'format', 'lecture-lessons-preflight-v1',
  'eligible', true,
  'state', pg_temp.lecture_lessons_snapshot()
) as snapshot;

-- BEGIN EXACT MIGRATION
-- 강의 2단계 작업 1. 차시, 웹훅 수신 기록, 시청 진도, 저장 용량 한 행.
-- 1단계 마이그레이션(20261125120000_lectures_schema.sql)은 고치지 않는다.
-- 영상 바이트는 이 데이터베이스에 두지 않는다. 상태·provider·용량은 서버 비밀 키만 기록한다.
-- 주문 테이블에서 service_role 권한을 거둔 뒤 서버 조회가 42501로 실패한 적이 있다.
-- 새 네 테이블은 revoke 뒤에 service_role 권한을 준다. lectures는 1단계에서 거둔 권한을 여기서 되돌린다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.lecture_lessons') is not null
    or to_regclass('public.lecture_webhook_events') is not null
    or to_regclass('public.lecture_storage_state') is not null
    or to_regclass('public.lecture_progress') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_ALREADY_EXISTS: lecture_lessons, lecture_webhook_events, lecture_storage_state, lecture_progress';
  end if;

  if to_regclass('public.teachers') is null then
    missing := array_append(missing, 'public.teachers');
  end if;
  if to_regclass('public.lectures') is null then
    missing := array_append(missing, 'public.lectures');
  end if;
  if to_regclass('public.lecture_upload_consents') is null then
    missing := array_append(missing, 'public.lecture_upload_consents');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
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

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.lectures'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: lectures RLS 비활성';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lectures'
      and policyname = 'lectures_delete_owner'
  ) or not has_table_privilege('authenticated', 'public.lectures', 'DELETE') then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURE_LESSONS_SCHEMA_PREREQUISITE_FAILED: lectures 클라이언트 delete 정책과 권한 필요';
  end if;
end;
$prerequisite$;

create table public.lecture_lessons (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null constraint lecture_lessons_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  sort_order integer not null constraint lecture_lessons_sort_order_check
    check (sort_order >= 0),
  provider text not null default 'mock' constraint lecture_lessons_provider_check
    check (provider in ('mock', 'bunny')),
  provider_video_id text constraint lecture_lessons_provider_video_id_check
    check (
      provider_video_id is null
      or (
        provider_video_id ~ '[^[:space:]]'
        and char_length(provider_video_id) <= 200
      )
    ),
  status text not null default 'created' constraint lecture_lessons_status_check
    check (status in ('created', 'uploading', 'processing', 'ready', 'failed')),
  duration_seconds integer constraint lecture_lessons_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0),
  storage_bytes bigint constraint lecture_lessons_storage_bytes_check
    check (storage_bytes is null or storage_bytes >= 0),
  provider_status text constraint lecture_lessons_provider_status_check
    check (
      provider_status is null
      or (
        provider_status ~ '[^[:space:]]'
        and char_length(provider_status) <= 40
      )
    ),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lecture_webhook_events (
  event_id text primary key constraint lecture_webhook_events_event_id_check
    check (event_id ~ '[^[:space:]]' and char_length(event_id) <= 200),
  provider_video_id text not null constraint lecture_webhook_events_video_id_check
    check (
      provider_video_id ~ '[^[:space:]]'
      and char_length(provider_video_id) <= 200
    ),
  status integer not null,
  happened_at timestamptz not null
);

create table public.lecture_storage_state (
  id smallint primary key default 1 constraint lecture_storage_state_singleton_check
    check (id = 1),
  used_bytes bigint not null default 0 constraint lecture_storage_state_used_bytes_check
    check (used_bytes >= 0),
  limit_bytes bigint constraint lecture_storage_state_limit_bytes_check
    check (limit_bytes is null or limit_bytes >= 0),
  alerted_80_at timestamptz
);

create table public.lecture_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lecture_lessons(id) on delete cascade,
  position_seconds integer not null constraint lecture_progress_position_seconds_check
    check (position_seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table public.lecture_lessons enable row level security;
alter table public.lecture_webhook_events enable row level security;
alter table public.lecture_storage_state enable row level security;
alter table public.lecture_progress enable row level security;

create index lecture_lessons_lecture_sort_idx
on public.lecture_lessons (lecture_id, sort_order, id);
create index lecture_lessons_teacher_idx
on public.lecture_lessons (teacher_id);
create unique index lecture_lessons_provider_video_uidx
on public.lecture_lessons (provider, provider_video_id)
where provider_video_id is not null;
create index lecture_lessons_ready_idx
on public.lecture_lessons (lecture_id)
where status = 'ready';
create index lectures_published_idx
on public.lectures (created_at desc, id desc)
where is_published;
create index lecture_webhook_events_video_idx
on public.lecture_webhook_events (provider_video_id, happened_at);
create index lecture_progress_lesson_idx
on public.lecture_progress (lesson_id);

create function private.guard_lecture_lesson_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.lectures
    where id = new.lecture_id
      and teacher_id = new.teacher_id
  ) or not exists (
    select 1
    from public.teachers
    where user_id = new.teacher_id
  ) or not exists (
    select 1
    from public.lecture_upload_consents
    where user_id = new.teacher_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_LESSON_OWNER_REQUIRED';
  end if;

  if current_user is distinct from 'service_role' then
    if (select auth.uid()) is distinct from new.teacher_id then
      raise exception using
        errcode = '42501',
        message = 'LECTURE_LESSON_INSERT_TEACHER_REQUIRED';
    end if;
    new.provider := 'mock';
    new.provider_video_id := null;
    new.status := 'created';
    new.duration_seconds := null;
    new.storage_bytes := null;
    new.provider_status := null;
    new.last_event_at := null;
  end if;

  return new;
end;
$$;

create function private.guard_lecture_lesson_update()
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

create function private.guard_lecture_progress_write()
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

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = new.lesson_id
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

create trigger lecture_lessons_guard_insert
before insert on public.lecture_lessons
for each row execute function private.guard_lecture_lesson_insert();

create trigger lecture_lessons_guard_update
before update on public.lecture_lessons
for each row execute function private.guard_lecture_lesson_update();

create trigger lecture_lessons_set_updated_at
before update on public.lecture_lessons
for each row execute function private.set_updated_at();

create trigger lecture_progress_guard_write
before insert or update on public.lecture_progress
for each row execute function private.guard_lecture_progress_write();

create trigger lecture_progress_set_updated_at
before update on public.lecture_progress
for each row execute function private.set_updated_at();

create policy lectures_select_published on public.lectures
for select to anon, authenticated
using (is_published);

drop policy lectures_delete_owner on public.lectures;

create policy lecture_lessons_select_owner on public.lecture_lessons
for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy lecture_lessons_select_admin on public.lecture_lessons
for select to authenticated
using ((select private.is_admin()));
create policy lecture_lessons_select_published_ready on public.lecture_lessons
for select to anon, authenticated
using (
  status = 'ready'
  and exists (
    select 1
    from public.lectures
    where id = lecture_id
      and is_published
  )
);
create policy lecture_lessons_insert_owner on public.lecture_lessons
for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.lecture_upload_consents
    where user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.lectures
    where id = lecture_id
      and teacher_id = (select auth.uid())
  )
);
create policy lecture_lessons_update_owner on public.lecture_lessons
for update to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
)
with check (teacher_id = (select auth.uid()));

create policy lecture_storage_state_select_admin on public.lecture_storage_state
for select to authenticated
using ((select private.is_admin()));

create policy lecture_progress_select_own on public.lecture_progress
for select to authenticated
using (user_id = (select auth.uid()));
create policy lecture_progress_insert_own on public.lecture_progress
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.lecture_lessons lesson
    join public.lectures lecture on lecture.id = lesson.lecture_id
    where lesson.id = lesson_id
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
create policy lecture_progress_update_own on public.lecture_progress
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- limit_bytes null은 한도를 아직 기록하지 않은 상태다. 0으로 두면 업로드가 막힌 것처럼 보인다.
insert into public.lecture_storage_state (id, used_bytes, limit_bytes)
values (1, 0, null);

revoke all on public.lecture_lessons,
  public.lecture_webhook_events,
  public.lecture_storage_state,
  public.lecture_progress
from public, anon, authenticated, service_role;

grant select, insert, update, delete on public.lecture_lessons to service_role;
grant select, insert, update, delete on public.lecture_webhook_events to service_role;
grant select, insert, update, delete on public.lecture_storage_state to service_role;
grant select, insert, update, delete on public.lecture_progress to service_role;
grant select, insert, update, delete on public.lectures to service_role;

grant select on public.lectures to anon;
revoke delete on public.lectures from authenticated;

grant select on public.lecture_lessons to anon, authenticated;
grant insert (
  id,
  lecture_id,
  teacher_id,
  title,
  sort_order
) on public.lecture_lessons to authenticated;
grant update (title, sort_order) on public.lecture_lessons to authenticated;

grant select on public.lecture_storage_state to authenticated;

grant select on public.lecture_progress to authenticated;
grant insert (user_id, lesson_id, position_seconds)
on public.lecture_progress to authenticated;
grant update (position_seconds) on public.lecture_progress to authenticated;

revoke all on function private.guard_lecture_lesson_insert()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_lesson_update()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_progress_write()
from public, anon, authenticated, service_role;
-- END EXACT MIGRATION

create temporary table lecture_lesson_actors (
  kind text primary key,
  id uuid not null unique
);
insert into lecture_lesson_actors (kind, id)
select 'admin', id
from public.profiles
where role = 'admin'
order by id
limit 1;
insert into lecture_lesson_actors (kind, id)
select 'teacher_a', id
from public.profiles
where role = 'user'
  and not exists (
    select 1 from public.teachers where user_id = profiles.id
  )
order by id
limit 1;
insert into lecture_lesson_actors (kind, id)
select 'teacher_b', id
from public.profiles
where role = 'user'
  and id <> (select id from lecture_lesson_actors where kind = 'teacher_a')
  and not exists (
    select 1 from public.teachers where user_id = profiles.id
  )
order by id
limit 1;
insert into lecture_lesson_actors (kind, id)
select 'member', id
from public.profiles
where role = 'user'
  and id not in (select id from lecture_lesson_actors)
  and not exists (
    select 1 from public.teachers where user_id = profiles.id
  )
order by id
limit 1;

create temporary table lecture_lesson_rows (
  kind text primary key,
  id uuid not null unique
);

create function pg_temp.lecture_lessons_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'LECTURE_LESSONS_ASSERT_FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.lecture_lessons_expected_error(
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
  raise exception 'LECTURE_LESSONS_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.lecture_lessons_no_rows(command text, label text)
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
    raise exception 'LECTURE_LESSONS_EXPECTED_NO_ROWS: % (% rows)', label, affected;
  end if;
end;
$$;

grant select, insert on lecture_lesson_actors, lecture_lesson_rows
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lessons_assert(boolean, text)
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lessons_expected_error(text, text, text)
to anon, authenticated, service_role;
grant execute on function pg_temp.lecture_lessons_no_rows(text, text)
to anon, authenticated, service_role;

select pg_temp.lecture_lessons_assert(
  (select count(*) = 4 from lecture_lesson_actors),
  '관리자·선생님 둘·일반 회원 역할 준비'
);
select pg_temp.lecture_lessons_assert(
  has_table_privilege('service_role', 'public.lectures', 'SELECT')
  and has_table_privilege('service_role', 'public.lectures', 'INSERT')
  and has_table_privilege('service_role', 'public.lectures', 'UPDATE')
  and has_table_privilege('service_role', 'public.lectures', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_lessons', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_webhook_events', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_webhook_events', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_webhook_events', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_webhook_events', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_storage_state', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_storage_state', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_storage_state', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_storage_state', 'DELETE')
  and has_table_privilege('service_role', 'public.lecture_progress', 'SELECT')
  and has_table_privilege('service_role', 'public.lecture_progress', 'INSERT')
  and has_table_privilege('service_role', 'public.lecture_progress', 'UPDATE')
  and has_table_privilege('service_role', 'public.lecture_progress', 'DELETE'),
  'service_role 다섯 테이블 읽기 쓰기'
);
select pg_temp.lecture_lessons_assert(
  has_table_privilege('authenticated', 'public.lectures', 'DELETE') is not true
  and has_table_privilege('authenticated', 'public.lecture_lessons', 'DELETE') is not true
  and has_table_privilege('anon', 'public.lectures', 'SELECT')
  and has_table_privilege('anon', 'public.lecture_lessons', 'SELECT')
  and has_table_privilege('anon', 'public.lecture_webhook_events', 'SELECT') is not true
  and has_table_privilege('authenticated', 'public.lecture_webhook_events', 'SELECT') is not true
  and has_table_privilege('authenticated', 'public.lecture_storage_state', 'SELECT')
  and has_table_privilege('authenticated', 'public.lecture_storage_state', 'INSERT') is not true
  and has_table_privilege('authenticated', 'public.lecture_storage_state', 'UPDATE') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'title', 'UPDATE')
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'sort_order', 'UPDATE')
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'status', 'UPDATE') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'status', 'INSERT') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'provider', 'UPDATE') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'provider', 'INSERT') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'storage_bytes', 'UPDATE') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'storage_bytes', 'INSERT') is not true
  and has_column_privilege('authenticated', 'public.lecture_lessons', 'duration_seconds', 'UPDATE') is not true,
  '클라이언트 delete·상태·provider·용량 칸 권한 제한'
);
select pg_temp.lecture_lessons_assert(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lectures'
      and policyname = 'lectures_delete_owner'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lectures'
      and policyname = 'lectures_select_published'
  )
  and (
    select relrowsecurity
      and not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'lecture_webhook_events'
      )
    from pg_class
    where oid = 'public.lecture_webhook_events'::regclass
  )
  and (
    select count(*) = 1
      and bool_and(used_bytes = 0)
      and bool_and(limit_bytes is null)
    from public.lecture_storage_state
  ),
  '강의 delete 정책 제거, 웹훅 정책 없음, 용량 한 행'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.teachers (user_id)
select id from lecture_lesson_actors where kind = 'teacher_a';
insert into public.teachers (user_id)
select id from lecture_lesson_actors where kind = 'teacher_b';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'teacher_a'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'teacher_a'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.lecture_upload_consents (user_id, statement)
select id, '본인이 권리를 가진 영상만 올린다'
from lecture_lesson_actors
where kind = 'teacher_a'
  and not exists (
    select 1
    from public.lecture_upload_consents consent
    where consent.user_id = lecture_lesson_actors.id
  );
with inserted as (
  insert into public.lectures (teacher_id, title, description, field, is_published)
  select id, '사전검사 사주 강의', '롤백되는 소개', 'saju', true
  from lecture_lesson_actors
  where kind = 'teacher_a'
  returning id
)
insert into lecture_lesson_rows (kind, id)
select 'lecture_a', id from inserted;
with inserted as (
  insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order)
  select
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    id,
    '1강',
    0
  from lecture_lesson_actors
  where kind = 'teacher_a'
  returning id
)
insert into lecture_lesson_rows (kind, id)
select 'lesson_a', id from inserted;
select pg_temp.lecture_lessons_assert(
  (
    select status = 'created'
      and provider = 'mock'
      and provider_video_id is null
      and duration_seconds is null
      and storage_bytes is null
      and title = '1강'
      and sort_order = 0
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '선생님 A 차시 작성과 서버 칸 기본값'
);
update public.lecture_lessons
set title = '1강 수정', sort_order = 2
where id = (select id from lecture_lesson_rows where kind = 'lesson_a');
select pg_temp.lecture_lessons_assert(
  (
    select title = '1강 수정' and sort_order = 2 and status = 'created'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '선생님 A 제목·순서 수정'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'update public.lecture_lessons set status = %L where id = %L::uuid',
    'ready',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '42501',
  '선생님 A 상태 변경 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'update public.lecture_lessons set provider = %L where id = %L::uuid',
    'bunny',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '42501',
  '선생님 A provider 변경 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'update public.lecture_lessons set storage_bytes = %s where id = %L::uuid',
    '10',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '42501',
  '선생님 A 용량 변경 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order, status) select %L::uuid, id, %L, %s, %L from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    '상태 직접 입력',
    '1',
    'ready',
    'teacher_a'
  ),
  '42501',
  '상태 칸 직접 insert 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order) select %L::uuid, id, %L, %s from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    '   ',
    '3',
    'teacher_a'
  ),
  '23514',
  '공백 제목 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order) select %L::uuid, id, %L, %s from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    repeat('가', 101),
    '4',
    'teacher_a'
  ),
  '23514',
  '101자 제목 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'delete from public.lecture_lessons where id = %L::uuid',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '42501',
  '선생님 A 차시 삭제 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'delete from public.lectures where id = %L::uuid',
    (select id from lecture_lesson_rows where kind = 'lecture_a')
  ),
  '42501',
  '선생님 A 강의 삭제 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'teacher_b'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'teacher_b'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.lecture_upload_consents (user_id, statement)
select id, '본인이 권리를 가진 영상만 올린다'
from lecture_lesson_actors
where kind = 'teacher_b'
  and not exists (
    select 1
    from public.lecture_upload_consents consent
    where consent.user_id = lecture_lesson_actors.id
  );
with inserted as (
  insert into public.lectures (teacher_id, title, description, field, is_published)
  select id, '사전검사 타로 강의', '비공개 소개', 'tarot', false
  from lecture_lesson_actors
  where kind = 'teacher_b'
  returning id
)
insert into lecture_lesson_rows (kind, id)
select 'lecture_b', id from inserted;
with inserted as (
  insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order)
  select
    (select id from lecture_lesson_rows where kind = 'lecture_b'),
    id,
    '비공개 1강',
    0
  from lecture_lesson_actors
  where kind = 'teacher_b'
  returning id
)
insert into lecture_lesson_rows (kind, id)
select 'lesson_b', id from inserted;
select pg_temp.lecture_lessons_assert(
  not exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  )
  and exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_b')
  )
  and exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_a')
      and is_published
  )
  and exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_b')
      and is_published = false
  ),
  '선생님 B는 공개 강의와 자기 차시만 보고 준비 전인 A 차시는 보지 못한다'
);
select pg_temp.lecture_lessons_no_rows(
  format(
    'update public.lecture_lessons set title = %L where id = %L::uuid',
    '침범',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '선생님 B의 A 차시 수정 0행'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order) select %L::uuid, id, %L, %s from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    '남의 강의 차시',
    '1',
    'teacher_b'
  ),
  '42501',
  '선생님 B가 A 강의에 차시 추가 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lecture_lessons_assert(
  (
    select title = '1강 수정'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '다른 선생님 수정이 원본 제목을 유지'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_a')
  )
  and not exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_b')
  )
  and not exists (
    select 1
    from public.lecture_lessons
    where id in (
      select id from lecture_lesson_rows where kind in ('lesson_a', 'lesson_b')
    )
  ),
  '일반 회원은 공개 강의만 보고 준비 전 차시와 비공개 강의는 보지 못한다'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_lessons (lecture_id, teacher_id, title, sort_order) select %L::uuid, id, %L, %s from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lecture_a'),
    '회원 차시',
    '1',
    'member'
  ),
  '42501',
  '일반 회원 차시 작성 차단'
);
select pg_temp.lecture_lessons_no_rows(
  format(
    'update public.lecture_lessons set title = %L where id = %L::uuid',
    '회원 수정',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '일반 회원 차시 제목 수정 0행'
);
select pg_temp.lecture_lessons_expected_error(
  'select id from public.lecture_webhook_events',
  '42501',
  '일반 회원 웹훅 조회 차단'
);
select pg_temp.lecture_lessons_no_rows(
  'select id from public.lecture_storage_state',
  '일반 회원 용량 행 조회 0행'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lecture_lessons_assert(
  exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_a')
  )
  and not exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_b')
  )
  and not exists (
    select 1
    from public.lecture_lessons
    where id in (
      select id from lecture_lesson_rows where kind in ('lesson_a', 'lesson_b')
    )
  ),
  '비로그인은 공개 강의만 보고 준비 전 차시와 비공개 강의는 보지 못한다'
);
select pg_temp.lecture_lessons_expected_error(
  'select id from public.lecture_progress',
  '42501',
  '비로그인 진도 조회 차단'
);
select pg_temp.lecture_lessons_expected_error(
  'select id from public.lecture_webhook_events',
  '42501',
  '비로그인 웹훅 조회 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.lecture_lessons
set
  provider = 'bunny',
  provider_video_id = 'video-a',
  status = 'ready',
  duration_seconds = 120,
  storage_bytes = 1000,
  provider_status = '4',
  last_event_at = now()
where id = (select id from lecture_lesson_rows where kind = 'lesson_a');
update public.lecture_lessons
set
  provider = 'bunny',
  provider_video_id = 'video-b',
  status = 'ready',
  duration_seconds = 30,
  storage_bytes = 20,
  provider_status = '3'
where id = (select id from lecture_lesson_rows where kind = 'lesson_b');
select pg_temp.lecture_lessons_assert(
  (
    select status = 'ready'
      and provider = 'bunny'
      and provider_video_id = 'video-a'
      and duration_seconds = 120
      and storage_bytes = 1000
      and provider_status = '4'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  )
  and exists (
    select 1
    from public.lectures
    where id = (select id from lecture_lesson_rows where kind = 'lecture_b')
      and is_published = false
  ),
  'service_role 차시 상태·용량 기록과 비공개 강의 조회'
);
insert into public.lecture_webhook_events (
  event_id,
  provider_video_id,
  status,
  happened_at
)
values ('evt-1', 'video-a', 3, now()), ('evt-resolution', 'video-a', 4, now());
select pg_temp.lecture_lessons_assert(
  (
    select count(*) = 2
      and bool_or(status = 3)
      and bool_or(status = 4)
    from public.lecture_webhook_events
    where event_id in ('evt-1', 'evt-resolution')
  ),
  'service_role 웹훅 기록. 웹훅 4는 숫자 그대로 남는다'
);
select pg_temp.lecture_lessons_expected_error(
  $$insert into public.lecture_webhook_events (event_id, provider_video_id, status, happened_at)
    values ('evt-1', 'video-a', 3, now())$$,
  '23505',
  '같은 웹훅 event_id 재기록 차단'
);
update public.lecture_storage_state
set used_bytes = 1020, limit_bytes = 5000
where id = 1;
select pg_temp.lecture_lessons_assert(
  (
    select used_bytes = 1020 and limit_bytes = 5000 and alerted_80_at is null
    from public.lecture_storage_state
    where id = 1
  ),
  'service_role 용량 행 수정'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lecture_lessons_assert(
  exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
      and status = 'ready'
  )
  and not exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_b')
  ),
  '비로그인은 공개 강의의 ready 차시만 본다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
      and status = 'ready'
  )
  and not exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_b')
  ),
  '일반 회원은 공개 강의의 ready 차시만 본다'
);
insert into public.lecture_progress (user_id, lesson_id, position_seconds)
select id, (select id from lecture_lesson_rows where kind = 'lesson_a'), 15
from lecture_lesson_actors
where kind = 'member';
update public.lecture_progress
set position_seconds = 20
where user_id = (select id from lecture_lesson_actors where kind = 'member')
  and lesson_id = (select id from lecture_lesson_rows where kind = 'lesson_a');
select pg_temp.lecture_lessons_assert(
  (
    select position_seconds = 20
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_actors where kind = 'member')
      and lesson_id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '일반 회원 본인 진도 저장·수정'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_progress (user_id, lesson_id, position_seconds) select %L::uuid, %L::uuid, %s',
    (select id from lecture_lesson_actors where kind = 'teacher_a'),
    (select id from lecture_lesson_rows where kind = 'lesson_a'),
    '1'
  ),
  '42501',
  '일반 회원 타인 진도 작성 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'insert into public.lecture_progress (user_id, lesson_id, position_seconds) select id, %L::uuid, %s from lecture_lesson_actors where kind = %L',
    (select id from lecture_lesson_rows where kind = 'lesson_b'),
    '1',
    'member'
  ),
  '42501',
  '일반 회원 비공개 차시 진도 차단'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'update public.lecture_progress set position_seconds = %s where user_id = %L::uuid and lesson_id = %L::uuid',
    '-1',
    (select id from lecture_lesson_actors where kind = 'member'),
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '23514',
  '음수 진도 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'teacher_a'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'teacher_a'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  not exists (
    select 1
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_actors where kind = 'member')
  )
  and (
    select status = 'ready' and storage_bytes = 1000 and title = '1강 수정'
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '선생님 A는 회원 진도를 보지 못하고 자기 차시 상태와 용량은 읽는다'
);
select pg_temp.lecture_lessons_expected_error(
  format(
    'update public.lecture_lessons set status = %L where id = %L::uuid',
    'failed',
    (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '42501',
  'ready 이후에도 선생님 A 상태 변경 차단'
);
insert into public.lecture_progress (user_id, lesson_id, position_seconds)
select id, (select id from lecture_lesson_rows where kind = 'lesson_a'), 4
from lecture_lesson_actors
where kind = 'teacher_a';
select pg_temp.lecture_lessons_assert(
  (
    select position_seconds = 4
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_actors where kind = 'teacher_a')
      and lesson_id = (select id from lecture_lesson_rows where kind = 'lesson_a')
  ),
  '선생님 A 자기 차시 진도 저장'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'teacher_b'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'teacher_b'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_a')
      and status = 'ready'
  )
  and exists (
    select 1
    from public.lecture_lessons
    where id = (select id from lecture_lesson_rows where kind = 'lesson_b')
  )
  and not exists (
    select 1
    from public.lecture_progress
    where user_id = (select id from lecture_lesson_actors where kind = 'teacher_a')
  ),
  '선생님 B는 공개 ready 차시와 자기 차시를 보고 다른 사람 진도는 보지 못한다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  (select count(*) = 1 from public.lecture_progress),
  '일반 회원은 자기 진도만 본다'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_lesson_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_lesson_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lecture_lessons_assert(
  (
    select count(*) = 2
    from public.lecture_lessons
    where id in (
      select id from lecture_lesson_rows where kind in ('lesson_a', 'lesson_b')
    )
  )
  and (
    select used_bytes = 1020 and limit_bytes = 5000
    from public.lecture_storage_state
    where id = 1
  ),
  '관리자는 차시와 용량 행을 본다'
);
select pg_temp.lecture_lessons_expected_error(
  'update public.lecture_storage_state set used_bytes = 0 where id = 1',
  '42501',
  '관리자 용량 행 수정 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

select pg_temp.lecture_lessons_assert(
  (pg_temp.lecture_lessons_snapshot() - 'lectures_access') = (
    select (snapshot->'state') - 'lectures_access'
    from lecture_lessons_baseline
  ),
  '기존 profile·클래스·콘텐츠·인증·Storage 원본 보존'
);

do $success$
declare
  baseline jsonb;
begin
  select snapshot into baseline from lecture_lessons_baseline;
  raise exception using
    errcode = 'P0001',
    message = 'LECTURE_LESSONS_PREFLIGHT_OK: 선생님 A·B, 일반 회원, 비로그인, service_role 권한 검사 통과. 테스트 행은 의도된 전체 롤백으로 제거됨. 실제 Data API·브라우저 세션·Bunny 호출은 미검증. 일반 회원은 기존 profile의 DB 역할 검사(실제 로그인 검증 아님).',
    detail = baseline::text;
end;
$success$;
