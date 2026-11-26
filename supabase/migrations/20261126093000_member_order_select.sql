-- 로그인한 회원은 본인 주문과 그 상품만 읽는다.
-- 다른 회원·비회원 주문은 기존처럼 막는다. 쓰기는 관리자 정책만 허용한다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.orders') is null then
    missing := array_append(missing, 'public.orders');
  end if;
  if to_regclass('public.order_items') is null then
    missing := array_append(missing, 'public.order_items');
  end if;
  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.orders'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.order_items'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREREQUISITE_FAILED: 주문 RLS 비활성';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname in ('orders_select_own', 'order_items_select_own')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_ALREADY_EXISTS';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and policyname in ('orders_select_admin', 'order_items_select_admin')
  ) <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREREQUISITE_FAILED: 관리자 조회 정책 없음';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.orders'::regclass
      and attname = 'user_id'
      and atttypid = 'uuid'::regtype
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_ORDER_SELECT_PREREQUISITE_FAILED: orders.user_id 없음';
  end if;
end;
$prerequisite$;

create policy orders_select_own
on public.orders
for select
to authenticated
using (user_id = (select auth.uid()));

create policy order_items_select_own
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders as member_order
    where member_order.id = order_id
      and member_order.user_id = (select auth.uid())
  )
);
