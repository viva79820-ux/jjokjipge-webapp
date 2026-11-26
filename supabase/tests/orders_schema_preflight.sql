-- 주문 마이그레이션 적용 전 운영 DB의 선행 구조와 충돌 여부를 검사한다.
-- 마지막 SQLSTATE P0001과 ORDERS_PREFLIGHT_OK 예외만 성공이다.
rollback;
begin;

do $preflight$
declare
  missing text[] := '{}';
  conflicting text[] := '{}';
begin
  if to_regclass('public.products') is null then
    missing := array_append(missing, 'public.products');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regprocedure('private.set_updated_at()') is null then
    missing := array_append(missing, 'private.set_updated_at()');
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
  if not exists (select 1 from public.profiles where role = 'admin') then
    missing := array_append(missing, '관리자 profile');
  end if;

  if to_regclass('public.orders') is not null then
    conflicting := array_append(conflicting, 'public.orders');
  end if;
  if to_regclass('public.order_items') is not null then
    conflicting := array_append(conflicting, 'public.order_items');
  end if;
  if to_regclass('private.order_counters') is not null then
    conflicting := array_append(conflicting, 'private.order_counters');
  end if;
  if to_regprocedure('private.set_order_no()') is not null then
    conflicting := array_append(conflicting, 'private.set_order_no()');
  end if;
  if to_regprocedure(
    'private.create_shop_order(uuid,uuid,text,text,text,text,text,text,numeric,jsonb)'
  ) is not null then
    conflicting := array_append(
      conflicting,
      'private.create_shop_order(...)'
    );
  end if;
  if to_regprocedure(
    'public.create_shop_order(uuid,uuid,text,text,text,text,text,text,numeric,jsonb)'
  ) is not null then
    conflicting := array_append(
      conflicting,
      'public.create_shop_order(...)'
    );
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;
  if cardinality(conflicting) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_CONFLICT: '
        || array_to_string(conflicting, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.products'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: public.products RLS 비활성';
  end if;

  if (
    select count(*) = 4
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname in (
        'products_select_published_or_admin',
        'products_insert_admin',
        'products_update_admin',
        'products_delete_admin'
      )
  ) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: 상품 RLS 정책 불일치';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_price_check'
      and pg_get_constraintdef(oid, true) like '%price = trunc(price)%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: 상품 가격 제약 불일치';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.products'::regclass
      and attname = 'is_published'
      and atttypid = 'boolean'::regtype
      and attnotnull
      and not attisdropped
  )
  or not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.products'::regclass
      and attname = 'is_sold_out'
      and atttypid = 'boolean'::regtype
      and attnotnull
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: 상품 공개·품절 열 불일치';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_admin'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'boolean'
      and p.prosecdef
      and p.provolatile = 's'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_PREFLIGHT_PREREQUISITE_FAILED: private.is_admin() 불일치';
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'ORDERS_PREFLIGHT_OK: 주문 객체 충돌 없음, 상품 가격·공개·품절 구조와 RLS, 관리자 판정 함수, 필수 역할 확인. 마이그레이션 실행 검증은 격리 스키마 테스트에서 수행.';
end;
$preflight$;
