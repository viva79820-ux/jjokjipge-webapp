-- MEMBER_CONSENTS_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;
begin;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.member_consents_snapshot()
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
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.relname), ''))
  )
  into component
  from (
    select
      c.relname,
      c.relkind,
      c.relrowsecurity,
      c.relforcerowsecurity,
      c.relowner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname <> 'member_consents'
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
  ) s;
  state := state || jsonb_build_object('public_relations', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.table_name, s.column_name), ''))
  )
  into component
  from (
    select
      table_name,
      column_name,
      ordinal_position,
      column_default,
      is_nullable,
      data_type,
      udt_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name <> 'member_consents'
  ) s;
  state := state || jsonb_build_object('public_columns', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.table_name, s.constraint_name), ''))
  )
  into component
  from (
    select
      c.relname as table_name,
      x.conname as constraint_name,
      x.contype,
      x.convalidated,
      pg_get_constraintdef(x.oid, true) as definition
    from pg_constraint x
    join pg_class c on c.oid = x.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname <> 'member_consents'
  ) s;
  state := state || jsonb_build_object('public_constraints', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.tablename, p.policyname), ''))
  )
  into component
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename <> 'member_consents';
  state := state || jsonb_build_object('public_policies', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(g)::text), '' order by g.table_name, g.grantee, g.privilege_type), ''))
  )
  into component
  from information_schema.table_privileges g
  where g.table_schema = 'public'
    and g.table_name <> 'member_consents';
  state := state || jsonb_build_object('public_grants', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  )
  into component
  from public.profiles p;
  state := state || jsonb_build_object('profile_rows', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(u.id::text), '' order by u.id::text), ''))
  )
  into component
  from auth.users u;
  state := state || jsonb_build_object('auth_user_ids', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

do $rollback_check$
declare
  baseline jsonb := null;
  current_state jsonb;
begin
  if baseline is null then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_ROLLBACK_BASELINE_REQUIRED: 사전 검사 DETAIL의 baseline JSON을 입력하세요.';
  end if;

  if to_regclass('public.member_consents') is null then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_ROLLBACK_PREREQUISITE_FAILED: public.member_consents 없음';
  end if;

  execute 'drop table public.member_consents';
  current_state := pg_temp.member_consents_snapshot();

  if current_state <> baseline then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_ROLLBACK_FAILED: 기존 상태 불일치',
      detail = jsonb_build_object(
        'baseline', baseline,
        'current', current_state
      )::text;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'MEMBER_CONSENTS_ROLLBACK_OK';
end;
$rollback_check$;

-- 운영 역방향 SQL(승인 후 별도 마이그레이션으로 실행):
-- drop table public.member_consents;
