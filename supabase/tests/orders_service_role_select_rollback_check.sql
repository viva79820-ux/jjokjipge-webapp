-- 실행 전제:
-- 1. orders_service_role_select_preflight.sql이 SQLSTATE P0001
--    ORDERS_SERVICE_ROLE_SELECT_PREFLIGHT_OK로 끝난 뒤에만 실행한다.
-- 2. 다른 작업이 없는 세션에서 BEGIN 한 뒤,
--    supabase/migrations/20261127005622_orders_service_role_select.sql 을
--    같은 트랜잭션에서 적용한 다음에 이 파일을 실행한다.
-- 3. 이 파일은 BEGIN, COMMIT, ROLLBACK을 하지 않는다.
--    결과가 ORDERS_SERVICE_ROLE_SELECT_ROLLBACK_CHECK_OK이면 호출자가 ROLLBACK 한다.
-- 4. 그 ROLLBACK이 끝난 뒤에만 운영 DB에 마이그레이션을 적용한다.

do $check$
declare
  relation text;
  failed text[] := '{}';
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SERVICE_ROLE_SELECT_ROLLBACK_CHECK_PREREQUISITE_FAILED: 주문 테이블 또는 역할이 없습니다.';
  end if;

  foreach relation in array array['orders', 'order_items']
  loop
    if not has_table_privilege(
      'service_role',
      format('public.%s', relation)::regclass,
      'SELECT'
    ) then
      failed := array_append(failed, 'service_role ' || relation || ' SELECT 없음');
    end if;

    if has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'INSERT'
      )
      or has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'UPDATE'
      )
      or has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'DELETE'
      )
      or has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'TRUNCATE'
      )
      or has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'REFERENCES'
      )
      or has_table_privilege(
        'service_role',
        format('public.%s', relation)::regclass,
        'TRIGGER'
      )
    then
      failed := array_append(failed, 'service_role ' || relation || ' SELECT 외 권한');
    end if;

    if has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'SELECT'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'INSERT'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'UPDATE'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'DELETE'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'TRUNCATE'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'REFERENCES'
      )
      or has_table_privilege(
        'anon',
        format('public.%s', relation)::regclass,
        'TRIGGER'
      )
    then
      failed := array_append(failed, 'anon ' || relation || ' 권한');
    end if;

    if not has_table_privilege(
      'authenticated',
      format('public.%s', relation)::regclass,
      'SELECT'
    ) then
      failed := array_append(failed, 'authenticated ' || relation || ' SELECT 없음');
    end if;

    if not (
      select relrowsecurity
      from pg_class
      where oid = format('public.%s', relation)::regclass
    ) then
      failed := array_append(failed, relation || ' RLS 비활성');
    end if;
  end loop;

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
      message = 'ORDERS_SERVICE_ROLE_SELECT_ROLLBACK_CHECK_FAILED: '
        || array_to_string(failed, ', ');
  end if;
end;
$check$;

select 'ORDERS_SERVICE_ROLE_SELECT_ROLLBACK_CHECK_OK' as result;
