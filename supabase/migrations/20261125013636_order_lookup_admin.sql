-- 주문 배송 처리 기록을 추가하고 허용된 상태 전이만 DB에서 받는다.
alter table public.orders
add column tracking_number text
  constraint orders_tracking_number_check
  check (
    tracking_number is null
    or (
      tracking_number = btrim(tracking_number)
      and tracking_number ~ '[^[:space:]]'
      and char_length(tracking_number) <= 100
      and tracking_number !~ '[[:cntrl:]]'
    )
  ),
add column payment_confirmed_at timestamptz,
add column shipped_at timestamptz,
add column completed_at timestamptz,
add column cancelled_at timestamptz;

create function private.enforce_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    if new.tracking_number is distinct from old.tracking_number then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_WITHOUT_SHIPPING';
    end if;
    return new;
  end if;

  if old.status = 'pending_payment'
    and new.status = 'payment_confirmed'
  then
    if new.tracking_number is not null then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_WITHOUT_SHIPPING';
    end if;
    new.payment_confirmed_at := pg_catalog.now();
    return new;
  end if;

  if old.status = 'payment_confirmed'
    and new.status = 'shipping'
  then
    if new.tracking_number is null then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_REQUIRED';
    end if;
    new.shipped_at := pg_catalog.now();
    return new;
  end if;

  if old.status = 'shipping'
    and new.status = 'completed'
  then
    if new.tracking_number is null
      or new.tracking_number is distinct from old.tracking_number
    then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_REQUIRED';
    end if;
    new.completed_at := pg_catalog.now();
    return new;
  end if;

  if old.status in ('pending_payment', 'payment_confirmed', 'shipping')
    and new.status = 'cancelled'
  then
    if old.status <> 'shipping' and new.tracking_number is not null then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_WITHOUT_SHIPPING';
    end if;
    if old.status = 'shipping'
      and (
        new.tracking_number is null
        or new.tracking_number is distinct from old.tracking_number
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'ORDER_TRACKING_NUMBER_REQUIRED';
    end if;
    new.cancelled_at := pg_catalog.now();
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'ORDER_STATUS_TRANSITION_INVALID';
end;
$$;

create trigger orders_enforce_transition
before update on public.orders
for each row execute function private.enforce_order_transition();

revoke all on function private.enforce_order_transition()
from public, anon, authenticated, service_role;

grant update (tracking_number) on public.orders to authenticated;
