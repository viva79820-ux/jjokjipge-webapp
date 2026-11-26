-- member_consents 마이그레이션을 아직 적용하지 않은 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 MEMBER_CONSENTS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 회원·profile 자료를 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
begin
  if to_regclass('public.member_consents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_PREFLIGHT_ALREADY_APPLIED: public.member_consents';
  end if;
  if to_regclass('auth.users') is null
    or to_regclass('public.profiles') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_PREFLIGHT_PREREQUISITE_FAILED: auth.users 또는 public.profiles 없음';
  end if;
end;
$prerequisite$;

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

create temp table member_consents_preflight_baseline
on commit drop
as select pg_temp.member_consents_snapshot() as value;

-- BEGIN EXACT MIGRATION
-- 회원가입 당시 동의한 약관 버전과 시각만 별도 보관한다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.member_consents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_SCHEMA_ALREADY_EXISTS: public.member_consents';
  end if;

  if to_regclass('auth.users') is null then
    missing := array_append(missing, 'auth.users');
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
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
      message = 'MEMBER_CONSENTS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_SCHEMA_PREREQUISITE_FAILED: public.profiles RLS 비활성';
  end if;
end;
$prerequisite$;

create table public.member_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null default '1.0'
    constraint member_consents_terms_version_check
    check (terms_version = '1.0'),
  privacy_version text not null default '1.0'
    constraint member_consents_privacy_version_check
    check (privacy_version = '1.0'),
  agreed_at timestamptz not null default now()
);

alter table public.member_consents enable row level security;

create policy member_consents_select_own on public.member_consents
for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.member_consents
from public, anon, authenticated, service_role;
grant select on public.member_consents to authenticated;
grant insert on public.member_consents to service_role;
-- END EXACT MIGRATION

do $assertions$
declare
  baseline jsonb;
  current_state jsonb;
begin
  select value into baseline from member_consents_preflight_baseline;

  if not (
    select relrowsecurity and not relforcerowsecurity
    from pg_class
    where oid = 'public.member_consents'::regclass
  ) then
    raise exception 'MEMBER_CONSENTS_PREFLIGHT_FAILED: RLS 정의';
  end if;

  if (
    select count(*) = 4
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_consents'
      and column_name in (
        'user_id',
        'terms_version',
        'privacy_version',
        'agreed_at'
      )
  ) is not true then
    raise exception 'MEMBER_CONSENTS_PREFLIGHT_FAILED: 열 정의';
  end if;

  if (
    select count(*) = 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_consents'
      and policyname = 'member_consents_select_own'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%'
      and with_check is null
  ) is not true
  or (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'member_consents'
  ) <> 1 then
    raise exception 'MEMBER_CONSENTS_PREFLIGHT_FAILED: 본인 읽기 정책';
  end if;

  if has_table_privilege('anon', 'public.member_consents', 'SELECT')
    or has_table_privilege('anon', 'public.member_consents', 'INSERT')
    or has_table_privilege('authenticated', 'public.member_consents', 'INSERT')
    or has_table_privilege('authenticated', 'public.member_consents', 'UPDATE')
    or has_table_privilege('authenticated', 'public.member_consents', 'DELETE')
    or not has_table_privilege('authenticated', 'public.member_consents', 'SELECT')
    or not has_table_privilege('service_role', 'public.member_consents', 'INSERT')
    or has_table_privilege('service_role', 'public.member_consents', 'SELECT')
    or has_table_privilege('service_role', 'public.member_consents', 'UPDATE')
    or has_table_privilege('service_role', 'public.member_consents', 'DELETE')
  then
    raise exception 'MEMBER_CONSENTS_PREFLIGHT_FAILED: 최소 권한';
  end if;

  if coalesce(pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conrelid = 'public.member_consents'::regclass
        and conname = 'member_consents_terms_version_check'
    ),
    true
  ), '') not like '%terms_version%1.0%'
  or coalesce(pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conrelid = 'public.member_consents'::regclass
        and conname = 'member_consents_privacy_version_check'
    ),
    true
  ), '') not like '%privacy_version%1.0%'
  then
    raise exception 'MEMBER_CONSENTS_PREFLIGHT_FAILED: 동의 버전 제약';
  end if;

  current_state := pg_temp.member_consents_snapshot();
  if current_state <> baseline then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_PREFLIGHT_FAILED: 기존 상태 변경',
      detail = jsonb_build_object(
        'baseline', baseline,
        'current', current_state
      )::text;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'MEMBER_CONSENTS_PREFLIGHT_OK',
    detail = baseline::text;
end;
$assertions$;
