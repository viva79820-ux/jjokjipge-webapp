create extension if not exists btree_gist with schema extensions;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  address text,
  hours text,
  phone text,
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.counselors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  store_id uuid references public.stores(id) on delete set null,
  name text not null,
  field text not null check (field in ('tarot', 'saju')),
  tags text[] not null default '{}',
  intro text,
  description text,
  image_path text,
  is_recommended boolean not null default false,
  is_new boolean not null default false,
  affiliation text not null default 'store' check (affiliation in ('store', 'partner')),
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  expert_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consult_products (
  id uuid primary key default gen_random_uuid(),
  counselor_id uuid not null references public.counselors(id) on delete cascade,
  name text not null,
  minutes integer not null check (minutes > 0),
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.reservation_counters (
  day date primary key,
  last_no integer not null
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_no text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  counselor_id uuid not null references public.counselors(id) on delete restrict,
  product_id uuid not null references public.consult_products(id) on delete restrict,
  product_name text not null,
  minutes integer not null check (minutes > 0),
  price integer not null check (price >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  payment_method text not null check (payment_method in ('bank_transfer', 'card')),
  depositor_name text,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'completed', 'cancelled')),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at = starts_at + make_interval(mins => minutes)),
  exclude using gist (
    counselor_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed'))
);

create index counselors_store_id_idx on public.counselors (store_id);
create index consult_products_counselor_id_idx on public.consult_products (counselor_id);
create index reservations_user_id_idx on public.reservations (user_id);
create index reservations_counselor_starts_at_idx on public.reservations (counselor_id, starts_at);
create index reservations_product_id_idx on public.reservations (product_id);

create function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data ->> 'name');
  return new;
end;
$$;

create function private.set_reservation_no()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  reservation_day date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
  next_no integer;
begin
  if new.reservation_no is null then
    insert into private.reservation_counters (day, last_no)
    values (reservation_day, 1)
    on conflict (day) do update
      set last_no = private.reservation_counters.last_no + 1
    returning last_no into next_no;
    new.reservation_no := 'R-' || pg_catalog.to_char(reservation_day, 'YYYYMMDD') || '-' || pg_catalog.lpad(next_no::text, greatest(4, pg_catalog.length(next_no::text)), '0');
  end if;
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger stores_set_updated_at before update on public.stores for each row execute function private.set_updated_at();
create trigger counselors_set_updated_at before update on public.counselors for each row execute function private.set_updated_at();
create trigger consult_products_set_updated_at before update on public.consult_products for each row execute function private.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations for each row execute function private.set_updated_at();
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
create trigger reservations_set_reservation_no before insert on public.reservations for each row execute function private.set_reservation_no();

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.counselors enable row level security;
alter table public.consult_products enable row level security;
alter table public.reservations enable row level security;

create policy profiles_select_own_or_admin on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy stores_select_active_or_admin on public.stores for select to anon, authenticated using (is_active or (select private.is_admin()));
create policy stores_insert_admin on public.stores for insert to authenticated with check ((select private.is_admin()));
create policy stores_update_admin on public.stores for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy stores_delete_admin on public.stores for delete to authenticated using ((select private.is_admin()));

create policy counselors_select_active_or_admin on public.counselors for select to anon, authenticated using ((is_active and approval_status = 'approved') or (select private.is_admin()));
create policy counselors_insert_admin on public.counselors for insert to authenticated with check ((select private.is_admin()));
create policy counselors_update_admin on public.counselors for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy counselors_delete_admin on public.counselors for delete to authenticated using ((select private.is_admin()));

create policy consult_products_select_active_or_admin on public.consult_products for select to anon, authenticated using ((is_active and exists (select 1 from public.counselors c where c.id = counselor_id and c.is_active and c.approval_status = 'approved')) or (select private.is_admin()));
create policy consult_products_insert_admin on public.consult_products for insert to authenticated with check ((select private.is_admin()));
create policy consult_products_update_admin on public.consult_products for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy consult_products_delete_admin on public.consult_products for delete to authenticated using ((select private.is_admin()));

create policy reservations_select_own_or_admin on public.reservations for select to authenticated using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy reservations_update_admin on public.reservations for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function private.set_updated_at(), private.is_admin(), private.handle_new_user(), private.set_reservation_no() from public, anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (name, phone) on public.profiles to authenticated;
revoke insert, delete on public.reservations from anon, authenticated;
