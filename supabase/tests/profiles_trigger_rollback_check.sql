-- PROFILES_TRIGGER_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

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

do $rollback_check$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'profiles-trigger-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'missing_profile_count') is distinct from 'number'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('auth.users') is null
    or to_regclass('public.profiles') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_ROLLBACK_FAILED: auth.users 또는 public.profiles가 없습니다.';
  end if;

  if exists (
    select 1
    from auth.users
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
      or email = 'profile-trigger-test@example.invalid'
  ) or exists (
    select 1
    from public.profiles
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeb001'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_ROLLBACK_FAILED: 검사 계정 또는 profile이 남았습니다.';
  end if;

  current_state := pg_temp.profiles_trigger_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILES_TRIGGER_ROLLBACK_FAILED: baseline 상태 키가 다릅니다.';
  end if;

  for component in
    select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'PROFILES_TRIGGER_ROLLBACK_FAILED: 운영 원본과 다릅니다: ' || component;
    end if;
  end loop;

  raise notice 'PROFILES_TRIGGER_ROLLBACK_OK: 검사 계정 없음. 인증 계정·profiles·함수·트리거가 사전 검사 전 원본과 일치합니다.';
end;
$rollback_check$;

select 'PROFILES_TRIGGER_ROLLBACK_OK' as result;
