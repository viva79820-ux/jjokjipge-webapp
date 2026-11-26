-- 회원 주문 조회 정책 적용 전 주문 스키마와 충돌 여부를 검사한다.
-- 마지막 SQLSTATE P0001과 MEMBER_ORDER_SELECT_PREFLIGHT_OK 예외만 성공이다.
rollback;
begin;

do $preflight$
declare
  missing text[] := '{}';
  conflicting text[] := '{}';
begin
  if to_regclass('public.orders') is null then
    missing := array_append(missing, 'public.orders');
  else
    if not exists (
      select 1
      from pg_attribute
      where attrelid = 'public.orders'::regclass
        and attname = 'user_id'
        and atttypid = 'uuid'::regtype
        and not attisdropped
    ) then
      missing := array_append(missing, 'orders.user_id');
    end if;
    if not (
      select relrowsecurity
      from pg_class
      where oid = 'public.orders'::regclass
    ) then
      missing := array_append(missing, 'public.orders RLS');
    end if;
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'orders_user_created_idx'
    ) then
      missing := array_append(missing, 'orders_user_created_idx');
    end if;
    if not has_table_privilege('authenticated', 'public.orders', 'SELECT')
      or has_table_privilege('anon', 'public.orders', 'SELECT')
    then
      missing := array_append(missing, 'orders SELECT 권한');
    end if;
  end if;
  if to_regclass('public.order_items') is null then
    missing := array_append(missing, 'public.order_items');
  else
    if not (
      select relrowsecurity
      from pg_class
      where oid = 'public.order_items'::regclass
    ) then
      missing := array_append(missing, 'public.order_items RLS');
    end if;
    if not has_table_privilege('authenticated', 'public.order_items', 'SELECT')
      or has_table_privilege('anon', 'public.order_items', 'SELECT')
    then
      missing := array_append(missing, 'order_items SELECT 권한');
    end if;
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in ('orders_select_admin', 'order_items_select_admin')
  ) <> 2 then
    missing := array_append(missing, '관리자 조회 정책');
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname = 'orders_select_own'
  ) then
    conflicting := array_append(conflicting, 'orders_select_own');
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname = 'order_items_select_own'
  ) then
    conflicting := array_append(conflicting, 'order_items_select_own');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREFLIGHT_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;
  if cardinality(conflicting) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREFLIGHT_CONFLICT: '
        || array_to_string(conflicting, ', ');
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'MEMBER_ORDER_SELECT_PREFLIGHT_OK: 주문 테이블·RLS·관리자 조회 정책·회원 user_id 인덱스·SELECT 권한 확인. 회원 본인 조회 정책은 아직 없음.';
end;
$preflight$;
