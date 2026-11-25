-- 운영 DB의 새 SQL Editor에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 PROFILES_TRIGGER_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 직접 auth.users를 넣는 검사 계정은 메일을 보내지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
begin
  if to_regclass('auth.users') is null
    or to_regclass('public.profiles') is null
    or to_regnamespace('private') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_PREFLIGHT_PREREQUISITE_FAILED: auth.users, public.profiles, private 스키마가 필요합니다.';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_PREFLIGHT_PREREQUISITE_FAILED: public.profiles RLS가 꺼져 있습니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
      and convalidated
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_PREFLIGHT_PREREQUISITE_FAILED: profiles.id의 auth.users CASCADE FK가 예상과 다릅니다.';
  end if;
end;
$prerequisite$;

lock table auth.users, public.profiles in share row exclusive mode;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.profiles_trigger_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  component jsonb;
begin
  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', users.id,
        'created_at', users.created_at,
        'raw_user_meta_data', users.raw_user_meta_data
      )::text),
      '' order by users.id::text
    ), ''))
  )
  into component
  from auth.users as users;
  state := state || jsonb_build_object('auth_users', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(profiles)::text),
      '' order by profiles.id::text
    ), ''))
  )
  into component
  from public.profiles as profiles;
  state := state || jsonb_build_object('profiles_rows', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(functions)::text),
      '' order by functions.oid
    ), ''))
  )
  into component
  from (
    select
      procedures.oid,
      procedures.prosecdef,
      procedures.proconfig,
      procedures.proacl,
      pg_get_functiondef(procedures.oid) as definition
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'private'
      and procedures.proname = 'handle_new_user'
      and pg_get_function_identity_arguments(procedures.oid) = ''
  ) as functions;
  state := state || jsonb_build_object('handle_new_user', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(triggers)::text),
      '' order by triggers.tgname
    ), ''))
  )
  into component
  from (
    select
      trigger_rows.tgname,
      trigger_rows.tgenabled,
      pg_get_triggerdef(trigger_rows.oid, true) as definition
    from pg_trigger as trigger_rows
    where trigger_rows.tgrelid = 'auth.users'::regclass
      and trigger_rows.tgname = 'on_auth_user_created'
      and not trigger_rows.tgisinternal
  ) as triggers;
  state := state || jsonb_build_object('profile_trigger', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table profiles_trigger_missing_users as
select
  users.id,
  nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'name'), '') as expected_name
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);

create temporary table profiles_trigger_existing_profiles as
select
  profiles.id,
  md5(to_jsonb(profiles)::text) as row_hash
from public.profiles as profiles;

create temporary table profiles_trigger_baseline as
select jsonb_build_object(
  'format', 'profiles-trigger-preflight-v1',
  'eligible', true,
  'missing_profile_count', (
    select count(*)
    from profiles_trigger_missing_users
  ),
  'state', pg_temp.profiles_trigger_snapshot()
) as snapshot;

create temporary table profiles_trigger_results (
  label text not null
);

create function pg_temp.profiles_trigger_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'PROFILES_TRIGGER_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.profiles_trigger_results values (label);
end;
$$;

do $collision$
begin
  if exists (
    select 1
    from auth.users
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
      or email = 'profile-trigger-test@example.invalid'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_PREFLIGHT_PREREQUISITE_FAILED: 검사 계정이 이미 있습니다.';
  end if;
end;
$collision$;

-- BEGIN EXACT MIGRATION
-- 가입 시 profile을 만드는 트리거를 복구하고 누락된 기존 계정을 보정한다.
-- 기존 profile의 이름과 역할은 변경하지 않는다.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user()
from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();

insert into public.profiles (id, name)
select
  users.id,
  nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'name'), '')
from auth.users as users
where not exists (
  select 1
  from public.profiles as profiles
  where profiles.id = users.id
);
-- END EXACT MIGRATION

select pg_temp.profiles_trigger_assert(
  not exists (
    select 1
    from auth.users as users
    where not exists (
      select 1
      from public.profiles as profiles
      where profiles.id = users.id
    )
  ),
  '기존 인증 계정 profile 누락 0건'
);

select pg_temp.profiles_trigger_assert(
  not exists (
    select 1
    from profiles_trigger_existing_profiles as before_profiles
    join public.profiles as after_profiles
      on after_profiles.id = before_profiles.id
    where md5(to_jsonb(after_profiles)::text) <> before_profiles.row_hash
  )
  and (
    select count(*)
    from profiles_trigger_existing_profiles
  ) = (
    select count(*)
    from public.profiles
    where id in (
      select id
      from profiles_trigger_existing_profiles
    )
  ),
  '기존 profile 행 내용 보존'
);

select pg_temp.profiles_trigger_assert(
  not exists (
    select 1
    from profiles_trigger_missing_users as missing_users
    join public.profiles as profiles
      on profiles.id = missing_users.id
    where profiles.name is distinct from missing_users.expected_name
      or profiles.role <> 'user'
  ),
  '누락 profile 이름 복원 및 일반 회원 역할 적용'
);

select pg_temp.profiles_trigger_assert(
  (
    select count(*) = 1
      and bool_and(procedures.prosecdef)
      and bool_and(procedures.proconfig = array['search_path=""'])
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'private'
      and procedures.proname = 'handle_new_user'
      and pg_get_function_identity_arguments(procedures.oid) = ''
  )
  and not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    cross join lateral aclexplode(
      coalesce(
        procedures.proacl,
        acldefault('f', procedures.proowner)
      )
    ) as privileges
    left join pg_roles as roles
      on roles.oid = privileges.grantee
    where namespaces.nspname = 'private'
      and procedures.proname = 'handle_new_user'
      and pg_get_function_identity_arguments(procedures.oid) = ''
      and privileges.privilege_type = 'EXECUTE'
      and (
        privileges.grantee = 0
        or roles.rolname in ('anon', 'authenticated')
      )
  ),
  'profile 생성 함수 SECURITY DEFINER·빈 search_path·실행 권한 차단'
);

select pg_temp.profiles_trigger_assert(
  (
    select count(*) = 1
      and bool_and(trigger_rows.tgenabled = 'O')
      and bool_and(trigger_rows.tgtype = 5)
      and bool_and(
        trigger_rows.tgfoid = 'private.handle_new_user()'::regprocedure
      )
    from pg_trigger as trigger_rows
    where trigger_rows.tgrelid = 'auth.users'::regclass
      and trigger_rows.tgname = 'on_auth_user_created'
      and not trigger_rows.tgisinternal
  ),
  'auth.users 가입 트리거 1개 활성'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001',
  'profile-trigger-test@example.invalid',
  '{"name":"프로필 트리거 테스트"}'::jsonb
);

select pg_temp.profiles_trigger_assert(
  (
    select count(*) = 1
      and bool_and(name = '프로필 트리거 테스트')
      and bool_and(role = 'user')
    from public.profiles
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
  ),
  '신규 인증 계정 profile 자동 생성'
);

delete from auth.users
where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001';

select pg_temp.profiles_trigger_assert(
  not exists (
    select 1
    from auth.users
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
  )
  and not exists (
    select 1
    from public.profiles
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
  ),
  '검사 계정 삭제 시 profile CASCADE 삭제'
);

select pg_temp.profiles_trigger_assert(
  (
    select count(*)
    from public.profiles
  ) = (
    select (snapshot->'state'->'profiles_rows'->>'count')::bigint
      + (snapshot->>'missing_profile_count')::bigint
    from profiles_trigger_baseline
  ),
  '기존 누락 계정 외 profile 추가 없음'
);

do $success$
declare
  total integer;
  baseline jsonb;
begin
  select count(*) into total from profiles_trigger_results;
  select snapshot into baseline from profiles_trigger_baseline;

  raise exception using
    errcode = 'P0001',
    message = format(
      'PROFILES_TRIGGER_PREFLIGHT_OK: 검사 %s개 통과. 트리거 복구, 기존 profile 보존, 누락 계정 보정, 신규 가입 자동 생성과 CASCADE 삭제 확인. 의도된 전체 롤백.',
      total
    ),
    detail = baseline::text;
end;
$success$;
