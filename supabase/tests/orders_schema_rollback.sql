-- 주문 데이터가 한 건도 없을 때만 S-03 주문 스키마를 되돌린다.
-- 운영 주문이 생긴 뒤에는 이 파일을 실행하지 말고 별도 보존·이관 계획을 먼저 세운다.
begin;

do $safety$
begin
  if to_regclass('public.orders') is null
    or to_regclass('public.order_items') is null
    or to_regclass('private.order_counters') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_ROLLBACK_PREREQUISITE_FAILED: 주문 스키마가 없습니다.';
  end if;

  if exists (select 1 from public.orders)
    or exists (select 1 from public.order_items)
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_ROLLBACK_REFUSED: 주문 데이터가 있어 자동 롤백하지 않습니다.';
  end if;
end;
$safety$;

drop function public.create_shop_order(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  jsonb
);
drop function private.create_shop_order(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  jsonb
);
drop function private.order_request_matches(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  jsonb
);
drop table public.order_items;
drop table public.orders;
drop function private.set_order_no();
drop table private.order_counters;

do $verify$
begin
  if to_regclass('public.orders') is not null
    or to_regclass('public.order_items') is not null
    or to_regclass('private.order_counters') is not null
    or to_regprocedure('private.set_order_no()') is not null
    or to_regprocedure(
      'public.create_shop_order(uuid,uuid,text,text,text,text,text,text,numeric,jsonb)'
    ) is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_ROLLBACK_FAILED: 주문 객체가 남았습니다.';
  end if;

  if to_regclass('public.products') is null
    or to_regprocedure('private.is_admin()') is null
    or to_regprocedure('private.set_updated_at()') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_ROLLBACK_FAILED: 선행 상품·공통 객체가 손상됐습니다.';
  end if;
end;
$verify$;

commit;
select 'ORDERS_ROLLBACK_OK' as result;
