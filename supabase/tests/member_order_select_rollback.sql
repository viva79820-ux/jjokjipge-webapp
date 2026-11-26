-- 회원 본인 주문 조회 정책만 제거한다. 주문 행과 기존 관리자 정책은 유지한다.
begin;

do $safety$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_ROLLBACK_PREREQUISITE_FAILED: 주문 테이블이 없습니다.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'orders_select_own'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_items'
      and policyname = 'order_items_select_own'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_ROLLBACK_PREREQUISITE_FAILED: 회원 조회 정책이 없습니다.';
  end if;
end;
$safety$;

drop policy orders_select_own on public.orders;
drop policy order_items_select_own on public.order_items;

do $verify$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname in ('orders_select_own', 'order_items_select_own')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_ROLLBACK_FAILED: 회원 조회 정책이 남았습니다.';
  end if;

  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname = 'orders_select_admin'
    )
    or not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname = 'order_items_select_admin'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_ROLLBACK_FAILED: 주문 테이블이나 관리자 정책이 손상됐습니다.';
  end if;
end;
$verify$;

commit;
select 'MEMBER_ORDER_SELECT_ROLLBACK_OK' as result;
