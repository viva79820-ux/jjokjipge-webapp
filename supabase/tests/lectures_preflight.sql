-- teachers, lectures, lecture_upload_consents가 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 LECTURES_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 계정·profile·기존 업무 행은 바꾸지 않으며 성공 예외로 전체 롤백한다.
-- 선생님 두 명은 기존 role=user profile을 그대로 쓰고, 일반 회원은 세 번째 profile 또는 프로필 없는 인증 역할이다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  user_count integer;
begin
  if to_regclass('public.teachers') is not null
    or to_regclass('public.lectures') is not null
    or to_regclass('public.lecture_upload_consents') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_ALREADY_APPLIED: teachers, lectures, lecture_upload_consents';
  end if;

  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regclass('public.classes') is null then
    missing := array_append(missing, 'public.classes');
  end if;
  if to_regclass('public.contents') is null then
    missing := array_append(missing, 'public.contents');
  end if;
  if to_regclass('storage.objects') is null then
    missing := array_append(missing, 'storage.objects');
  end if;
  if to_regclass('storage.buckets') is null then
    missing := array_append(missing, 'storage.buckets');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
  end if;
  if to_regprocedure('storage.foldername(text)') is null then
    missing := array_append(missing, 'storage.foldername(text)');
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
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;

  select count(*) into user_count from public.profiles where role = 'user';
  if user_count < 2 then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: 선생님 격리 검사에 기존 일반 회원 profile 2명 필요';
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.profiles'::regclass,
      'public.classes'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: profiles 또는 classes RLS 비활성';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'public-images'
      and public
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: public-images 공개 버킷 필요';
  end if;

  if (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'public_images_select_admin',
        'public_images_insert_admin',
        'public_images_update_admin',
        'public_images_delete_admin'
      )
  ) is not true
  or not has_table_privilege('authenticated', 'storage.objects', 'INSERT')
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_PREFLIGHT_PREREQUISITE_FAILED: 기존 Storage 관리자 정책과 INSERT 권한 필요';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.lectures_snapshot()
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

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table lectures_baseline as
select jsonb_build_object(
  'format', 'lectures-preflight-v1',
  'eligible', true,
  'state', pg_temp.lectures_snapshot()
) as snapshot;

-- BEGIN EXACT MIGRATION
-- 강의 업로드 1단계. 선생님 권한, 강의 정보, 업로드 동의만 만든다.
-- 기존 classes는 바꾸지 않는다. 영상 파일, 차시, 고객용 목록은 만들지 않는다.
-- 조회수는 나중에 올릴 자리만 두고 0으로 고정한다. 차시 수는 테이블에 두지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.teachers') is not null
    or to_regclass('public.lectures') is not null
    or to_regclass('public.lecture_upload_consents') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_ALREADY_EXISTS: teachers, lectures, lecture_upload_consents';
  end if;

  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regclass('public.classes') is null then
    missing := array_append(missing, 'public.classes');
  end if;
  if to_regclass('storage.objects') is null then
    missing := array_append(missing, 'storage.objects');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
  end if;
  if to_regprocedure('storage.foldername(text)') is null then
    missing := array_append(missing, 'storage.foldername(text)');
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
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.classes'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: profiles 또는 classes RLS 비활성';
  end if;

  if (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'public_images_select_admin',
        'public_images_insert_admin',
        'public_images_update_admin',
        'public_images_delete_admin'
      )
      and roles = array['authenticated']::name[]
  ) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'LECTURES_SCHEMA_PREREQUISITE_FAILED: public-images 관리자 Storage 정책 4개 필요';
  end if;
end;
$prerequisite$;

create table public.teachers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null
);

create table public.lecture_upload_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  agreed_at timestamptz not null,
  statement text not null constraint lecture_upload_consents_statement_check
    check (statement = '본인이 권리를 가진 영상만 올린다')
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  title text not null constraint lectures_title_check
    check (title ~ '[^[:space:]]' and char_length(title) <= 100),
  description text not null constraint lectures_description_check
    check (description ~ '[^[:space:]]' and char_length(description) <= 5000),
  thumbnail_path text constraint lectures_thumbnail_path_check
    check (
      thumbnail_path is null
      or (
        thumbnail_path ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
        and split_part(thumbnail_path, '/', 2) = teacher_id::text
      )
    ),
  field text not null constraint lectures_field_check
    check (field in ('saju', 'tarot')),
  is_published boolean not null default false,
  view_count integer not null default 0 constraint lectures_view_count_check
    check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teachers enable row level security;
alter table public.lecture_upload_consents enable row level security;
alter table public.lectures enable row level security;

create index teachers_granted_by_idx on public.teachers (granted_by);
create index lectures_teacher_created_idx
on public.lectures (teacher_id, created_at desc, id desc);

create function private.assign_teacher_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_admin()) then
    raise exception using
      errcode = '42501',
      message = 'TEACHER_GRANT_ADMIN_REQUIRED';
  end if;
  new.granted_by := (select auth.uid());
  new.granted_at := pg_catalog.now();
  return new;
end;
$$;

create function private.assign_lecture_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from new.user_id
    or not exists (
      select 1
      from public.teachers
      where user_id = new.user_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_CONSENT_TEACHER_REQUIRED';
  end if;
  new.agreed_at := pg_catalog.now();
  return new;
end;
$$;

create function private.guard_lecture_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from new.teacher_id
    or not exists (
      select 1
      from public.teachers
      where user_id = new.teacher_id
    )
    or not exists (
      select 1
      from public.lecture_upload_consents
      where user_id = new.teacher_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_INSERT_TEACHER_CONSENT_REQUIRED';
  end if;
  new.view_count := 0;
  return new;
end;
$$;

create function private.guard_lecture_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.teacher_id is distinct from old.teacher_id
    or new.view_count is distinct from old.view_count
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_IDENTITY_IMMUTABLE';
  end if;

  if (select auth.uid()) is distinct from old.teacher_id then
    if not (select private.is_admin())
      or new.is_published
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.thumbnail_path is distinct from old.thumbnail_path
      or new.field is distinct from old.field
    then
      raise exception using
        errcode = '42501',
        message = 'LECTURE_ADMIN_UNPUBLISH_ONLY';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  ) then
    raise exception using
      errcode = '42501',
      message = 'LECTURE_UPDATE_TEACHER_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger teachers_assign_grant
before insert on public.teachers
for each row execute function private.assign_teacher_grant();

create trigger lecture_upload_consents_assign
before insert on public.lecture_upload_consents
for each row execute function private.assign_lecture_consent();

create trigger lectures_guard_insert
before insert on public.lectures
for each row execute function private.guard_lecture_insert();

create trigger lectures_guard_update
before update on public.lectures
for each row execute function private.guard_lecture_update();

create trigger lectures_set_updated_at
before update on public.lectures
for each row execute function private.set_updated_at();

create policy teachers_select_own_or_admin on public.teachers
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);
create policy teachers_insert_admin on public.teachers
for insert to authenticated
with check ((select private.is_admin()));
create policy teachers_delete_admin on public.teachers
for delete to authenticated
using ((select private.is_admin()));

create policy lecture_upload_consents_select_own_or_admin
on public.lecture_upload_consents
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
);
create policy lecture_upload_consents_insert_own
on public.lecture_upload_consents
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

create policy lectures_select_owner_or_admin on public.lectures
for select to authenticated
using (
  (
    teacher_id = (select auth.uid())
    and exists (
      select 1
      from public.teachers
      where user_id = (select auth.uid())
    )
  )
  or (select private.is_admin())
);
create policy lectures_insert_owner on public.lectures
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
);
create policy lectures_update_owner on public.lectures
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
create policy lectures_update_admin_unpublish on public.lectures
for update to authenticated
using ((select private.is_admin()))
with check (
  (select private.is_admin())
  and is_published = false
);
create policy lectures_delete_owner on public.lectures
for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

create policy public_images_select_teacher_lecture on storage.objects
for select to authenticated
using (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_insert_teacher_lecture on storage.objects
for insert to authenticated
with check (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_update_teacher_lecture on storage.objects
for update to authenticated
using (
  bucket_id = 'public-images'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'public-images'
  and name ~ '^lectures/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);
create policy public_images_delete_teacher_lecture on storage.objects
for delete to authenticated
using (
  bucket_id = 'public-images'
  and (storage.foldername(name))[1] = 'lectures'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.teachers
    where user_id = (select auth.uid())
  )
);

revoke all on public.teachers, public.lecture_upload_consents, public.lectures
from public, anon, authenticated, service_role;
grant select on public.teachers, public.lecture_upload_consents, public.lectures
to authenticated;
grant insert (user_id) on public.teachers to authenticated;
grant delete on public.teachers to authenticated;
grant insert (user_id, statement) on public.lecture_upload_consents to authenticated;
grant insert (
  id,
  teacher_id,
  title,
  description,
  thumbnail_path,
  field,
  is_published
) on public.lectures to authenticated;
grant update (
  title,
  description,
  thumbnail_path,
  field,
  is_published
) on public.lectures to authenticated;
grant delete on public.lectures to authenticated;

revoke all on function private.assign_teacher_grant()
from public, anon, authenticated, service_role;
revoke all on function private.assign_lecture_consent()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_insert()
from public, anon, authenticated, service_role;
revoke all on function private.guard_lecture_update()
from public, anon, authenticated, service_role;
-- END EXACT MIGRATION

create temporary table lecture_actors (
  kind text primary key,
  id uuid not null unique
);
insert into lecture_actors (kind, id)
select 'admin', id
from public.profiles
where role = 'admin'
order by id
limit 1;
insert into lecture_actors (kind, id)
select 'teacher_a', id
from public.profiles
where role = 'user'
order by id
limit 1;
insert into lecture_actors (kind, id)
select 'teacher_b', id
from public.profiles
where role = 'user'
  and id <> (select id from lecture_actors where kind = 'teacher_a')
order by id
limit 1;
insert into lecture_actors (kind, id)
select 'member', id
from public.profiles
where role = 'user'
  and id not in (select id from lecture_actors)
order by id
limit 1;
insert into lecture_actors (kind, id)
select 'member', '00000000-0000-4000-8000-000000000091'::uuid
where not exists (select 1 from lecture_actors where kind = 'member');

create temporary table lecture_member_mode (mode text primary key);
insert into lecture_member_mode (mode)
select case
  when exists (
    select 1
    from public.profiles profile
    join lecture_actors actor on actor.kind = 'member' and actor.id = profile.id
  ) then 'existing_user'
  else 'profileless'
end;

create temporary table lecture_rows (
  kind text primary key,
  id uuid not null unique
);

create function pg_temp.lectures_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'LECTURES_ASSERT_FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.lectures_expected_error(
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
  raise exception 'LECTURES_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.lectures_no_rows(command text, label text)
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
    raise exception 'LECTURES_EXPECTED_NO_ROWS: % (% rows)', label, affected;
  end if;
end;
$$;

grant select, insert, delete on lecture_actors, lecture_rows to anon, authenticated;
grant select on lecture_member_mode to anon, authenticated;
grant execute on function pg_temp.lectures_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.lectures_expected_error(text, text, text) to anon, authenticated;
grant execute on function pg_temp.lectures_no_rows(text, text) to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_assert(
  auth.uid() = (select id from lecture_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 확인'
);
insert into public.teachers (user_id)
select id from lecture_actors where kind = 'teacher_a';
insert into public.teachers (user_id)
select id from lecture_actors where kind = 'teacher_b';
select pg_temp.lectures_assert(
  (
    select count(*) = 2
      and bool_and(granted_by = (select id from lecture_actors where kind = 'admin'))
      and bool_and(granted_at = now())
    from public.teachers
  ),
  '관리자가 선생님 권한을 부여하고 시각을 기록'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'teacher_a'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'teacher_a'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_assert(
  auth.uid() = (select id from lecture_actors where kind = 'teacher_a')
  and not (select private.is_admin())
  and (select count(*) = 1 from public.teachers),
  '선생님 A는 자신의 권한만 본다'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lecture_upload_consents (user_id, statement)
    select id, '다른 문장' from lecture_actors where kind = 'teacher_a'$$,
  '23514',
  '동의 문장 불일치 차단'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (teacher_id, title, description, field)
    select id, '동의 전 강의', '소개', 'saju' from lecture_actors where kind = 'teacher_a'$$,
  '42501',
  '동의 전 강의 작성 차단'
);
insert into public.lecture_upload_consents (user_id, statement)
select id, '본인이 권리를 가진 영상만 올린다'
from lecture_actors
where kind = 'teacher_a';
select pg_temp.lectures_assert(
  (
    select agreed_at = now()
      and statement = '본인이 권리를 가진 영상만 올린다'
    from public.lecture_upload_consents
    where user_id = (select id from lecture_actors where kind = 'teacher_a')
  ),
  '선생님 A 동의 시각 기록'
);
with inserted as (
  insert into public.lectures (teacher_id, title, description, field, is_published)
  select id, '테스트 사주 강의', '사전 검사에서 롤백되는 소개', 'saju', true
  from lecture_actors
  where kind = 'teacher_a'
  returning id
)
insert into lecture_rows (kind, id)
select 'lecture_a', id from inserted;
select pg_temp.lectures_assert(
  (
    select is_published and view_count = 0 and field = 'saju'
    from public.lectures
    where id = (select id from lecture_rows where kind = 'lecture_a')
  ),
  '선생님 A 강의 작성과 조회수 0'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (teacher_id, title, description, field, view_count)
    select id, '조회수 위조', '소개', 'saju', 9 from lecture_actors where kind = 'teacher_a'$$,
  '42501',
  '조회수 직접 입력 차단'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (teacher_id, title, description, field)
    select id, '분야 오류', '소개', 'naming' from lecture_actors where kind = 'teacher_a'$$,
  '23514',
  '사주·타로 외 분야 차단'
);
select pg_temp.lectures_expected_error(
  format(
    'insert into public.lectures (teacher_id, title, description, field, thumbnail_path) select id, %L, %L, %L, %L from lecture_actors where kind = %L',
    '경로 오류',
    '소개',
    'saju',
    'lectures/' || (select id::text from lecture_actors where kind = 'teacher_b') || '/123e4567-e89b-42d3-a456-426614174000.webp',
    'teacher_a'
  ),
  '23514',
  '다른 선생님 폴더의 썸네일 경로 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'teacher_b'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'teacher_b'),
    'role', 'authenticated'
  )::text,
  true
);
insert into public.lecture_upload_consents (user_id, statement)
select id, '본인이 권리를 가진 영상만 올린다'
from lecture_actors
where kind = 'teacher_b';
with inserted as (
  insert into public.lectures (teacher_id, title, description, field, is_published)
  select id, '테스트 타로 강의', '다른 선생님 소개', 'tarot', false
  from lecture_actors
  where kind = 'teacher_b'
  returning id
)
insert into lecture_rows (kind, id)
select 'lecture_b', id from inserted;
select pg_temp.lectures_assert(
  (select count(*) = 1 from public.lectures)
  and not exists (
    select 1
    from public.lectures
    where id = (select id from lecture_rows where kind = 'lecture_a')
  )
  and (select count(*) = 1 from public.teachers),
  '선생님 B는 자신의 강의와 권한만 본다'
);
select pg_temp.lectures_no_rows(
  format(
    'update public.lectures set title = %L where id = %L',
    '침범',
    (select id from lecture_rows where kind = 'lecture_a')
  ),
  '다른 선생님 강의 수정 0행'
);
select pg_temp.lectures_no_rows(
  format(
    'delete from public.lectures where id = %L',
    (select id from lecture_rows where kind = 'lecture_a')
  ),
  '다른 선생님 강의 삭제 0행'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lectures_assert(
  (
    select title = '테스트 사주 강의'
    from public.lectures
    where id = (select id from lecture_rows where kind = 'lecture_a')
  ),
  '다른 선생님 수정이 원본 제목을 유지'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_assert(
  auth.uid() = (select id from lecture_actors where kind = 'member')
  and not (select private.is_admin())
  and (select count(*) = 0 from public.teachers)
  and (select count(*) = 0 from public.lectures)
  and (select count(*) = 0 from public.lecture_upload_consents),
  '일반 회원은 선생님 권한·강의·동의를 보지 못한다'
);
select pg_temp.lectures_expected_error(
  $$insert into public.teachers (user_id)
    select id from lecture_actors where kind = 'member'$$,
  '42501',
  '일반 회원 선생님 권한 부여 차단'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (teacher_id, title, description, field)
    select id, '침범', '소개', 'tarot' from lecture_actors where kind = 'member'$$,
  '42501',
  '일반 회원 강의 작성 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.lectures_assert(
  auth.uid() is null and not (select private.is_admin()),
  '비로그인 역할 확인'
);
select pg_temp.lectures_expected_error(
  $$select id, is_published from public.lectures$$,
  '42501',
  '비로그인 공개 강의 조회 차단'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (title, description, field) values ('침범', '소개', 'saju')$$,
  '42501',
  '비로그인 강의 작성 차단'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'admin'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_assert(
  (select count(*) = 2 from public.lectures)
  and (select count(*) = 2 from public.teachers)
  and (select count(*) = 2 from public.lecture_upload_consents),
  '관리자는 모든 강의·권한·동의를 본다'
);
update public.lectures
set is_published = false
where id = (select id from lecture_rows where kind = 'lecture_a');
select pg_temp.lectures_assert(
  (
    select not is_published and title = '테스트 사주 강의' and view_count = 0
    from public.lectures
    where id = (select id from lecture_rows where kind = 'lecture_a')
  ),
  '관리자 강제 비공개'
);
select pg_temp.lectures_expected_error(
  format(
    'update public.lectures set title = %L, is_published = false where id = %L',
    '관리자 제목 변경',
    (select id from lecture_rows where kind = 'lecture_a')
  ),
  '42501',
  '관리자 제목 변경 차단'
);
select pg_temp.lectures_expected_error(
  format(
    'update public.lectures set is_published = true where id = %L',
    (select id from lecture_rows where kind = 'lecture_a')
  ),
  '42501',
  '관리자 재공개 차단'
);
select pg_temp.lectures_no_rows(
  format(
    'delete from public.lectures where id = %L',
    (select id from lecture_rows where kind = 'lecture_a')
  ),
  '관리자 강의 삭제 0행'
);
delete from public.teachers
where user_id = (select id from lecture_actors where kind = 'teacher_b');
select pg_temp.lectures_assert(
  not exists (
    select 1
    from public.teachers
    where user_id = (select id from lecture_actors where kind = 'teacher_b')
  ),
  '관리자 선생님 권한 회수'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'teacher_a'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'teacher_a'),
    'role', 'authenticated'
  )::text,
  true
);
update public.lectures
set title = '테스트 사주 강의 수정', is_published = true
where id = (select id from lecture_rows where kind = 'lecture_a');
select pg_temp.lectures_assert(
  (
    select title = '테스트 사주 강의 수정' and is_published and view_count = 0
    from public.lectures
    where id = (select id from lecture_rows where kind = 'lecture_a')
  ),
  '선생님은 자기 강의를 수정하고 다시 공개할 수 있다'
);
insert into storage.objects (bucket_id, name)
values (
  'public-images',
  'lectures/' || (select id::text from lecture_actors where kind = 'teacher_a')
    || '/123e4567-e89b-42d3-a456-426614174000.webp'
);
select pg_temp.lectures_assert(
  (
    select count(*) = 1
    from storage.objects
    where bucket_id = 'public-images'
      and name = 'lectures/' || (select id::text from lecture_actors where kind = 'teacher_a')
        || '/123e4567-e89b-42d3-a456-426614174000.webp'
  ),
  '선생님 썸네일 경로 업로드'
);
select pg_temp.lectures_expected_error(
  format(
    'insert into storage.objects (bucket_id, name) values (%L, %L)',
    'public-images',
    'lectures/' || (select id::text from lecture_actors where kind = 'teacher_b')
      || '/123e4567-e89b-42d3-a456-426614174000.webp'
  ),
  '42501',
  '다른 선생님 썸네일 폴더 업로드 차단'
);
select pg_temp.lectures_expected_error(
  $$insert into storage.objects (bucket_id, name) values ('public-images', 'classes/123e4567-e89b-42d3-a456-426614174000.webp')$$,
  '42501',
  '강의 폴더 밖 업로드 차단'
);
delete from storage.objects
where bucket_id = 'public-images'
  and name = 'lectures/' || (select id::text from lecture_actors where kind = 'teacher_a')
    || '/123e4567-e89b-42d3-a456-426614174000.webp';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'teacher_b'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'teacher_b'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_assert(
  (select count(*) = 0 from public.lectures)
  and (select count(*) = 0 from public.teachers),
  '권한을 회수당한 계정은 강의와 권한 행을 보지 못한다'
);
select pg_temp.lectures_expected_error(
  $$insert into public.lectures (teacher_id, title, description, field)
    select id, '회수 후 강의', '소개', 'tarot' from lecture_actors where kind = 'teacher_b'$$,
  '42501',
  '권한 회수 후 강의 작성 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from lecture_actors where kind = 'member'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from lecture_actors where kind = 'member'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.lectures_expected_error(
  format(
    'insert into storage.objects (bucket_id, name) values (%L, %L)',
    'public-images',
    'lectures/' || (select id::text from lecture_actors where kind = 'teacher_a')
      || '/123e4567-e89b-42d3-a456-426614174001.webp'
  ),
  '42501',
  '일반 회원 썸네일 업로드 차단'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

select pg_temp.lectures_assert(
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'public_images_select_teacher_lecture',
        'public_images_insert_teacher_lecture',
        'public_images_update_teacher_lecture',
        'public_images_delete_teacher_lecture'
      )
  ),
  '선생님 썸네일 Storage 정책 4개'
);
select pg_temp.lectures_assert(
  to_regclass('public.classes') is not null
  and not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.classes'::regclass
      and attname in ('teacher_id', 'view_count', 'thumbnail_path')
      and attnum > 0
      and not attisdropped
  ),
  '기존 classes 테이블은 그대로'
);
select pg_temp.lectures_assert(
  pg_temp.lectures_snapshot() = (
    select snapshot->'state'
    from lectures_baseline
  ),
  '기존 profile·클래스·콘텐츠·인증·Storage 원본 보존'
);

do $success$
declare
  baseline jsonb;
  member_mode text;
  member_description text;
begin
  select snapshot into baseline from lectures_baseline;
  select mode into member_mode from lecture_member_mode;
  member_description := case member_mode
    when 'existing_user' then '일반 회원은 기존 profile의 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    else '일반 회원은 프로필 없는 비관리자 인증 역할의 DB RLS 검사(실제 로그인·Auth 세션 검증 아님)'
  end;
  raise exception using
    errcode = 'P0001',
    message = format(
      'LECTURES_PREFLIGHT_OK: 선생님·일반 회원·관리자 RLS, 동의 시각, 강제 비공개, 썸네일 폴더, classes 불변 검사 통과. %s. 테스트 행은 의도된 전체 롤백으로 제거됨. 실제 Data API·브라우저 세션·Storage MIME·파일 크기는 미검증.',
      member_description
    ),
    detail = baseline::text;
end;
$success$;
