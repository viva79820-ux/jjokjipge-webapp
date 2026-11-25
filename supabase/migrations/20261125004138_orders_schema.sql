-- 타로샵 주문은 서버 전용 RPC에서 상품 상태와 가격을 다시 확인한 뒤 원자적으로 생성한다.
do $prerequisite$
declare
  missing text[] := '{}';
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
      message = 'ORDERS_SCHEMA_ALREADY_EXISTS';
  end if;

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

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SCHEMA_PREREQUISITE_FAILED: '
        || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.products'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ORDERS_SCHEMA_PREREQUISITE_FAILED: public.products RLS 비활성';
  end if;
end;
$prerequisite$;

create table private.order_counters (
  day date primary key,
  last_no integer not null check (last_no > 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null constraint orders_order_no_check
    check (
      order_no
        ~ '^O-[0-9]{8}-([0-9]{3}[1-9]|[0-9]{2}[1-9][0-9]|[0-9][1-9][0-9]{2}|[1-9][0-9]{3,9})$'
    ),
  request_key uuid unique not null,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null constraint orders_customer_name_check
    check (
      customer_name = btrim(customer_name)
      and customer_name ~ '[^[:space:]]'
      and char_length(customer_name) <= 30
    ),
  customer_phone text not null constraint orders_customer_phone_check
    check (customer_phone ~ '^010-[0-9]{4}-[0-9]{4}$'),
  customer_email text not null constraint orders_customer_email_check
    check (
      customer_email = lower(btrim(customer_email))
      and char_length(customer_email) <= 254
      and customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  postal_code text not null constraint orders_postal_code_check
    check (postal_code ~ '^[0-9]{5}$'),
  address_line1 text not null constraint orders_address_line1_check
    check (
      address_line1 = btrim(address_line1)
      and address_line1 ~ '[^[:space:]]'
      and char_length(address_line1) <= 200
      and address_line1 !~ '[[:cntrl:]]'
    ),
  address_line2 text constraint orders_address_line2_check
    check (
      address_line2 is null
      or (
        address_line2 = btrim(address_line2)
        and address_line2 ~ '[^[:space:]]'
        and char_length(address_line2) <= 200
        and address_line2 !~ '[[:cntrl:]]'
      )
    ),
  subtotal numeric not null constraint orders_subtotal_check
    check (
      subtotal >= 1
      and subtotal <= 6378026431590
      and subtotal = trunc(subtotal)
    ),
  shipping_fee numeric not null constraint orders_shipping_fee_check
    check (
      shipping_fee >= 0
      and shipping_fee <= 2147483647
      and shipping_fee = trunc(shipping_fee)
    ),
  total numeric not null constraint orders_total_check
    check (
      total = subtotal + shipping_fee
      and total <= 6380173915237
      and total = trunc(total)
    ),
  status text not null default 'pending_payment'
    constraint orders_status_check
    check (
      status in (
        'pending_payment',
        'payment_confirmed',
        'shipping',
        'completed',
        'cancelled'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  line_no integer not null constraint order_items_line_no_check
    check (line_no between 1 and 30),
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null constraint order_items_product_name_check
    check (
      product_name ~ '[^[:space:]]'
      and char_length(product_name) <= 100
    ),
  unit_price numeric not null constraint order_items_unit_price_check
    check (
      unit_price >= 1
      and unit_price <= 2147483647
      and unit_price = trunc(unit_price)
    ),
  quantity integer not null constraint order_items_quantity_check
    check (quantity between 1 and 99),
  line_total numeric generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now(),
  unique (order_id, line_no),
  unique (order_id, product_id)
);

create index orders_user_created_idx
on public.orders (user_id, created_at desc, id desc)
where user_id is not null;

create index orders_status_created_idx
on public.orders (status, created_at desc, id desc);

create index order_items_order_id_idx
on public.order_items (order_id, line_no);

create function private.set_order_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_day date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
  next_no integer;
begin
  if new.order_no is null then
    insert into private.order_counters (day, last_no)
    values (order_day, 1)
    on conflict (day) do update
      set last_no = private.order_counters.last_no + 1
    returning last_no into next_no;

    new.order_no := 'O-'
      || pg_catalog.to_char(order_day, 'YYYYMMDD')
      || '-'
      || pg_catalog.lpad(
        next_no::text,
        greatest(4, pg_catalog.length(next_no::text)),
        '0'
      );
  end if;
  return new;
end;
$$;

create function private.order_request_matches(
  p_order_id uuid,
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_postal_code text,
  p_address_line1 text,
  p_address_line2 text,
  p_shipping_fee numeric,
  p_items jsonb
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.orders o
      where o.id = p_order_id
        and o.user_id is not distinct from p_user_id
        and o.customer_name = p_customer_name
        and o.customer_phone = p_customer_phone
        and o.customer_email = p_customer_email
        and o.postal_code = p_postal_code
        and o.address_line1 = p_address_line1
        and o.address_line2 is not distinct from p_address_line2
        and o.shipping_fee = p_shipping_fee
    )
    and (
      select count(*)
      from public.order_items oi
      where oi.order_id = p_order_id
    ) = jsonb_array_length(p_items)
    and not exists (
      select 1
      from jsonb_array_elements(p_items) requested
      left join public.order_items oi
        on oi.order_id = p_order_id
        and oi.product_id = (requested->>'product_id')::uuid
        and oi.quantity = (requested->>'quantity')::integer
      where oi.id is null
    );
$$;

create function private.create_shop_order(
  p_request_key uuid,
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_postal_code text,
  p_address_line1 text,
  p_address_line2 text,
  p_shipping_fee numeric,
  p_items jsonb
)
returns table (
  order_number text,
  subtotal_amount numeric,
  shipping_fee_amount numeric,
  total_amount numeric,
  order_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_product_count integer;
  v_subtotal numeric;
begin
  if p_request_key is null
    or p_customer_name is null
    or p_customer_name <> btrim(p_customer_name)
    or p_customer_name !~ '[^[:space:]]'
    or char_length(p_customer_name) > 30
    or p_customer_phone !~ '^010-[0-9]{4}-[0-9]{4}$'
    or p_customer_email is null
    or p_customer_email <> lower(btrim(p_customer_email))
    or char_length(p_customer_email) > 254
    or p_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_postal_code !~ '^[0-9]{5}$'
    or p_address_line1 is null
    or p_address_line1 <> btrim(p_address_line1)
    or p_address_line1 !~ '[^[:space:]]'
    or char_length(p_address_line1) > 200
    or p_address_line1 ~ '[[:cntrl:]]'
    or (
      p_address_line2 is not null
      and (
        p_address_line2 <> btrim(p_address_line2)
        or p_address_line2 !~ '[^[:space:]]'
        or char_length(p_address_line2) > 200
        or p_address_line2 ~ '[[:cntrl:]]'
      )
    )
    or p_shipping_fee is null
    or p_shipping_fee < 0
    or p_shipping_fee > 2147483647
    or p_shipping_fee <> trunc(p_shipping_fee)
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_INPUT_INVALID';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 30
    or exists (
      select 1
      from jsonb_array_elements(p_items) item
      where jsonb_typeof(item) <> 'object'
        or (
          select count(*)
          from jsonb_object_keys(item)
        ) <> 2
        or not item ? 'product_id'
        or not item ? 'quantity'
        or item->>'product_id'
          !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or item->>'quantity' !~ '^([1-9]|[1-9][0-9])$'
    )
    or (
      select count(*) <> count(distinct item->>'product_id')
      from jsonb_array_elements(p_items) item
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_ITEMS_INVALID';
  end if;

  select o.id
  into v_order_id
  from public.orders o
  where o.request_key = p_request_key;

  if found then
    if not private.order_request_matches(
      v_order_id,
      p_user_id,
      p_customer_name,
      p_customer_phone,
      p_customer_email,
      p_postal_code,
      p_address_line1,
      p_address_line2,
      p_shipping_fee,
      p_items
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      o.order_no,
      o.subtotal,
      o.shipping_fee,
      o.total,
      o.status,
      true
    from public.orders o
    where o.id = v_order_id;
    return;
  end if;

  perform p.id
  from public.products p
  where p.id in (
    select (item->>'product_id')::uuid
    from jsonb_array_elements(p_items) item
  )
  order by p.id
  for share;

  select
    count(*),
    sum(p.price * (item->>'quantity')::integer)
  into v_product_count, v_subtotal
  from jsonb_array_elements(p_items) item
  join public.products p
    on p.id = (item->>'product_id')::uuid
  where p.is_published
    and not p.is_sold_out;

  if v_product_count <> jsonb_array_length(p_items) then
    if exists (
      select 1
      from jsonb_array_elements(p_items) item
      join public.products p
        on p.id = (item->>'product_id')::uuid
      where p.is_published
        and p.is_sold_out
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_PRODUCT_SOLD_OUT';
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCT_UNAVAILABLE';
  end if;

  begin
    insert into public.orders (
      request_key,
      user_id,
      customer_name,
      customer_phone,
      customer_email,
      postal_code,
      address_line1,
      address_line2,
      subtotal,
      shipping_fee,
      total
    )
    values (
      p_request_key,
      p_user_id,
      p_customer_name,
      p_customer_phone,
      p_customer_email,
      p_postal_code,
      p_address_line1,
      p_address_line2,
      v_subtotal,
      p_shipping_fee,
      v_subtotal + p_shipping_fee
    )
    returning id into v_order_id;

    insert into public.order_items (
      order_id,
      line_no,
      product_id,
      product_name,
      unit_price,
      quantity
    )
    select
      v_order_id,
      item.ordinality::integer,
      p.id,
      p.name,
      p.price,
      (item.value->>'quantity')::integer
    from jsonb_array_elements(p_items) with ordinality item(value, ordinality)
    join public.products p
      on p.id = (item.value->>'product_id')::uuid;
  exception when unique_violation then
    select o.id
    into v_order_id
    from public.orders o
    where o.request_key = p_request_key;

    if not found
      or not private.order_request_matches(
        v_order_id,
        p_user_id,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_postal_code,
        p_address_line1,
        p_address_line2,
        p_shipping_fee,
        p_items
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_IDEMPOTENCY_CONFLICT';
    end if;

    return query
    select
      o.order_no,
      o.subtotal,
      o.shipping_fee,
      o.total,
      o.status,
      true
    from public.orders o
    where o.id = v_order_id;
    return;
  end;

  return query
  select
    o.order_no,
    o.subtotal,
    o.shipping_fee,
    o.total,
    o.status,
    false
  from public.orders o
  where o.id = v_order_id;
end;
$$;

create function public.create_shop_order(
  p_request_key uuid,
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_postal_code text,
  p_address_line1 text,
  p_address_line2 text,
  p_shipping_fee numeric,
  p_items jsonb
)
returns table (
  order_number text,
  subtotal_amount numeric,
  shipping_fee_amount numeric,
  total_amount numeric,
  order_status text,
  replayed boolean
)
language sql
volatile
set search_path = ''
as $$
  select *
  from private.create_shop_order(
    p_request_key,
    p_user_id,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_postal_code,
    p_address_line1,
    p_address_line2,
    p_shipping_fee,
    p_items
  );
$$;

create trigger orders_set_order_no
before insert on public.orders
for each row execute function private.set_order_no();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table private.order_counters enable row level security;

create policy orders_select_admin on public.orders
for select to authenticated
using ((select private.is_admin()));

create policy orders_update_status_admin on public.orders
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy order_items_select_admin on public.order_items
for select to authenticated
using ((select private.is_admin()));

revoke all on private.order_counters
from public, anon, authenticated, service_role;
revoke all on public.orders, public.order_items
from public, anon, authenticated, service_role;
grant select on public.orders, public.order_items to authenticated;
grant update (status) on public.orders to authenticated;

revoke all on function private.set_order_no(),
  private.order_request_matches(
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
  ),
  private.create_shop_order(
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
  ),
  public.create_shop_order(
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
  )
from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.create_shop_order(
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
) to service_role;
grant execute on function public.create_shop_order(
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
) to service_role;
