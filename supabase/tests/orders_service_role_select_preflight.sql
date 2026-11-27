-- 운영 적용 전에 한 트랜잭션에서 권한만 검사한다.
-- 적용 전 service_role은 orders, order_items에 SELECT가 없어야 한다.
-- 같은 트랜잭션에서 마이그레이션과 같은 GRANT SELECT를 적용한 뒤 SELECT만 있어야 한다.
-- anon 권한은 적용 전후 모두 없다.
-- 마지막 SQLSTATE P0001과 ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외로 트랜잭션이 중단되므로 GRANT는 남지 않는다.
rollback;
begin;

create or replace function pg_temp.orders_table_privileges(actor text, relation regclass)
returns text[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    pg_catalog.array_agg(privilege order by privilege),
    '{}'::text[]
  )
  from pg_catalog.unnest(array[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER'
  ]::text[]) as privilege
  where pg_catalog.has_table_privilege(actor, relation, privilege);
$$;

do $before$
declare
  missing text[] := '{}';
  relation text;
begin
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if to_regrole('service_role') is null then
    missing := array_append(missing, 'service_role');
  end if;
  if to_regclass('public.orders') is null then
    missing := array_append(missing, 'public.orders');
  end if;
  if to_regclass('public.order_items') is null then
    missing := array_append(missing, 'public.order_items');
  end if;
  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;

  foreach relation in array array['orders', 'order_items']
  loop
    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%s', relation)::regclass
    ) then
      missing := array_append(missing, relation || ' RLS');
    end if;
    if pg_temp.orders_table_privileges(
      'service_role',
      format('public.%s', relation)::regclass
    ) <> '{}'::text[] then
      missing := array_append(missing, 'service_role ' || relation || ' 기존 권한');
    end if;
    if pg_temp.orders_table_privileges(
      'anon',
      format('public.%s', relation)::regclass
    ) <> '{}'::text[] then
      missing := array_append(missing, 'anon ' || relation || ' 권한');
    end if;
    if not has_table_privilege(
      'authenticated',
      format('public.%s', relation)::regclass,
      'SELECT'
    ) then
      missing := array_append(missing, 'authenticated ' || relation || ' SELECT');
    end if;
  end loop;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;
end;
$before$;

create temp table orders_service_role_select_authenticated_before as
select
  relation,
  pg_temp.orders_table_privileges(
    'authenticated',
    format('public.%s', relation)::regclass
  ) as privileges
from pg_catalog.unnest(array['orders', 'order_items']::text[]) as listed(relation);

-- 마이그레이션 supabase/migrations/20261127005622_orders_service_role_select.sql 과 같다.
grant select on public.orders, public.order_items to service_role;

do $after$
declare
  relation text;
  failed text[] := '{}';
begin
  foreach relation in array array['orders', 'order_items']
  loop
    if pg_temp.orders_table_privileges(
      'service_role',
      format('public.%s', relation)::regclass
    ) <> array['SELECT']::text[] then
      failed := array_append(failed, 'service_role ' || relation || ' SELECT');
    end if;
    if pg_temp.orders_table_privileges(
      'anon',
      format('public.%s', relation)::regclass
    ) <> '{}'::text[] then
      failed := array_append(failed, 'anon ' || relation || ' 권한');
    end if;
    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%s', relation)::regclass
    ) then
      failed := array_append(failed, relation || ' RLS');
    end if;
  end loop;

  if exists (
    select 1
    from orders_service_role_select_authenticated_before as before_grant
    where pg_temp.orders_table_privileges(
      'authenticated',
      format('public.%s', before_grant.relation)::regclass
    ) is distinct from before_grant.privileges
  ) then
    failed := array_append(failed, 'authenticated 권한 변경');
  end if;

  if exists (
    select 1
    from pg_class as rel
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    cross join lateral aclexplode(rel.relacl) as acl
    where nsp.nspname = 'public'
      and rel.relname in ('orders', 'order_items')
      and acl.grantee = 0
  ) then
    failed := array_append(failed, 'public 권한');
  end if;

  if cardinality(failed) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_FAILED: '
        || array_to_string(failed, ', ');
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_OK: 적용 전 service_role SELECT 없음, 적용 후 SELECT만 있음, anon 권한 없음. 예외로 롤백.';
end;
$after$;
