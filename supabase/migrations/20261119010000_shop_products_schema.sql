-- 타로샵의 옵션 없는 단일 실물 상품 기반만 만든다. 실제 상품·이미지·주문 자료는 넣지 않는다.
do $prerequisite$
declare
  missing text[] := '{}';
  table_name text;
begin
  if to_regclass('public.products') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_SCHEMA_ALREADY_EXISTS: public.products';
  end if;

  foreach table_name in array array[
    'profiles',
    'stores',
    'counselors',
    'consult_products',
    'reservations',
    'faqs',
    'inquiries',
    'notices',
    'classes',
    'contents'
  ]
  loop
    if to_regclass('public.' || table_name) is null then
      missing := array_append(missing, 'public.' || table_name);
    end if;
  end loop;

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

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.profiles'::regclass,
      'public.stores'::regclass,
      'public.counselors'::regclass,
      'public.consult_products'::regclass,
      'public.reservations'::regclass,
      'public.faqs'::regclass,
      'public.inquiries'::regclass,
      'public.notices'::regclass,
      'public.classes'::regclass,
      'public.contents'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_SCHEMA_PREREQUISITE_FAILED: 기존 업무 테이블 RLS 비활성';
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
      message = 'SHOP_PRODUCTS_SCHEMA_PREREQUISITE_FAILED: private.is_admin() 정의가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
      and pg_get_function_result(p.oid) = 'trigger'
      and not p.prosecdef
      and p.provolatile = 'v'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_SCHEMA_PREREQUISITE_FAILED: private.set_updated_at() 정의가 예상과 다릅니다.';
  end if;
end;
$prerequisite$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint products_name_check
    check (name ~ '[^[:space:]]' and char_length(name) <= 100),
  description text not null constraint products_description_check
    check (description ~ '[^[:space:]]' and char_length(description) <= 5000),
  price numeric not null constraint products_price_check
    check (
      price >= 1
      and price <= 2147483647
      and price = trunc(price)
    ),
  image_path text constraint products_image_path_check
    check (
      image_path ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    ),
  image_alt text constraint products_image_alt_check
    check (
      image_alt is null
      or (
        image_alt ~ '[^[:space:]]'
        and char_length(image_alt) <= 200
      )
    ),
  is_published boolean not null default false,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0 constraint products_sort_order_check
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_image_requires_alt_check
    check (image_path is null or image_alt is not null)
);

alter table public.products enable row level security;

create index products_published_sort_idx
on public.products (is_published, sort_order, created_at desc, id desc);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

create policy products_select_published_or_admin on public.products
for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy products_insert_admin on public.products
for insert to authenticated
with check ((select private.is_admin()));
create policy products_update_admin on public.products
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy products_delete_admin on public.products
for delete to authenticated
using ((select private.is_admin()));

revoke all on public.products
from public, anon, authenticated, service_role;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
