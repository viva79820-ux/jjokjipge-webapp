-- 공개 후기와 관리자 공개 상태 관리를 위한 기반만 만든다.
-- 후기 작성 자격 검사는 후속 K-07에서 reservation_id를 사용해 추가한다.
do $prerequisite$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('public.reviews') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_SCHEMA_ALREADY_EXISTS: public.reviews';
  end if;

  foreach object_name in array array[
    'profiles',
    'counselors',
    'products',
    'reservations'
  ]
  loop
    if to_regclass('public.' || object_name) is null then
      missing := array_append(missing, 'public.' || object_name);
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
      message = 'REVIEWS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.profiles'::regclass,
      'public.counselors'::regclass,
      'public.products'::regclass,
      'public.reservations'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_SCHEMA_PREREQUISITE_FAILED: 기존 대상 테이블 RLS 비활성';
  end if;
end;
$prerequisite$;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  counselor_id uuid references public.counselors(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null constraint reviews_author_name_check
    check (
      author_name ~ '[^[:space:]]'
      and char_length(author_name) <= 100
    ),
  rating smallint not null constraint reviews_rating_check
    check (rating between 1 and 5),
  body text not null constraint reviews_body_check
    check (
      body ~ '[^[:space:]]'
      and char_length(body) <= 2000
    ),
  reservation_id uuid unique
    references public.reservations(id) on delete restrict,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_target_check
    check (num_nonnulls(counselor_id, product_id) = 1),
  constraint reviews_reservation_target_check
    check (reservation_id is null or counselor_id is not null)
);

alter table public.reviews enable row level security;

create index reviews_public_created_idx
on public.reviews (created_at desc, id desc)
where is_published;

create index reviews_admin_created_idx
on public.reviews (is_published, created_at desc, id desc);

create index reviews_counselor_id_idx
on public.reviews (counselor_id)
where counselor_id is not null;

create index reviews_product_id_idx
on public.reviews (product_id)
where product_id is not null;

create trigger reviews_set_updated_at
before update on public.reviews
for each row execute function private.set_updated_at();

create policy reviews_select_published_or_admin on public.reviews
for select to anon, authenticated
using (is_published or (select private.is_admin()));

create policy reviews_update_visibility_admin on public.reviews
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.reviews
from public, anon, authenticated, service_role;
grant select on public.reviews to anon, authenticated;
grant update (is_published) on public.reviews to authenticated;
