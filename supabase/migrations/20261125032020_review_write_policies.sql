-- 상담 완료된 회원 본인 예약에만 후기를 작성·수정·삭제할 수 있게 한다.
-- 상품 후기 열은 그대로 두고, 이번 정책으로는 상품 후기를 쓰지 못한다.
-- 회원 공개 동의(publish_consent)와 관리자 숨김(hidden_by_admin)을 구분한다.
do $prerequisite$
begin
  if to_regclass('public.reviews') is null
    or to_regclass('public.reservations') is null
    or to_regprocedure('private.is_admin()') is null
    or to_regprocedure('private.set_updated_at()') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREREQUISITE_FAILED: reviews, reservations, private.is_admin, private.set_updated_at';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reviews'::regclass
      and attname in ('publish_consent', 'hidden_by_admin')
      and attnum > 0
      and not attisdropped
  ) or to_regprocedure('public.list_my_reviews()') is not null
    or to_regprocedure('private.protect_review_row()') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_ALREADY_APPLIED';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'reviews_select_published_or_admin'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reviews'
      and policyname = 'reviews_update_visibility_admin'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREREQUISITE_FAILED: 기존 후기 정책';
  end if;
end;
$prerequisite$;

alter table public.reviews
  add column publish_consent boolean,
  add column hidden_by_admin boolean not null default false;

update public.reviews
set publish_consent = is_published
where publish_consent is null;

alter table public.reviews
  alter column publish_consent set not null,
  alter column publish_consent set default false;

alter table public.reviews
  add constraint reviews_admin_hidden_check
    check (not hidden_by_admin or not is_published);

create index reviews_author_created_idx
on public.reviews (author_id, created_at desc, id desc)
where author_id is not null;

create function private.protect_review_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.author_id is distinct from (select auth.uid())
      or new.product_id is not null
      or new.counselor_id is null
      or new.reservation_id is null
    then
      raise exception using
        errcode = '42501',
        message = 'REVIEW_INSERT_FORBIDDEN';
    end if;

    if not exists (
      select 1
      from public.reservations as reservation
      where reservation.id = new.reservation_id
        and reservation.user_id = (select auth.uid())
        and reservation.status = 'completed'
        and reservation.counselor_id = new.counselor_id
        and reservation.customer_name = new.author_name
    ) then
      raise exception using
        errcode = '42501',
        message = 'REVIEW_NOT_ELIGIBLE';
    end if;

    new.hidden_by_admin := false;
    new.is_published := new.publish_consent;
    return new;
  end if;

  if new.counselor_id is distinct from old.counselor_id
    or new.product_id is distinct from old.product_id
    or new.author_id is distinct from old.author_id
    or new.author_name is distinct from old.author_name
    or new.reservation_id is distinct from old.reservation_id
    or new.created_at is distinct from old.created_at
    or new.hidden_by_admin is distinct from old.hidden_by_admin
  then
    raise exception using
      errcode = '42501',
      message = 'REVIEW_COLUMN_FORBIDDEN';
  end if;

  if (select private.is_admin())
    and new.is_published is distinct from old.is_published
    and new.publish_consent is not distinct from old.publish_consent
    and new.rating is not distinct from old.rating
    and new.body is not distinct from old.body
  then
    new.hidden_by_admin := not new.is_published;
    return new;
  end if;

  if old.author_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'REVIEW_UPDATE_FORBIDDEN';
  end if;

  new.hidden_by_admin := old.hidden_by_admin;
  if new.hidden_by_admin then
    new.is_published := false;
  elsif new.publish_consent is distinct from old.publish_consent then
    new.is_published := new.publish_consent;
  else
    new.is_published := old.is_published;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_review_row()
from public, anon, authenticated, service_role;

create trigger reviews_protect_row
before insert or update on public.reviews
for each row execute function private.protect_review_row();

create function public.list_my_reviews()
returns table (
  id uuid,
  reservation_id uuid,
  counselor_id uuid,
  counselor_name text,
  rating smallint,
  body text,
  is_published boolean,
  publish_consent boolean,
  hidden_by_admin boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    review.id,
    review.reservation_id,
    review.counselor_id,
    counselor.name,
    review.rating,
    review.body,
    review.is_published,
    review.publish_consent,
    review.hidden_by_admin,
    review.created_at,
    review.updated_at
  from public.reviews as review
  left join public.counselors as counselor
    on counselor.id = review.counselor_id
  where review.author_id = (select auth.uid())
  order by review.created_at desc, review.id desc
$$;

revoke all on function public.list_my_reviews()
from public, anon, authenticated, service_role;
grant execute on function public.list_my_reviews() to authenticated;

drop policy reviews_select_published_or_admin on public.reviews;

create policy reviews_select_published_owner_or_admin
on public.reviews
for select
to anon, authenticated
using (
  is_published
  or author_id = (select auth.uid())
  or (select private.is_admin())
);

create policy reviews_insert_own_completed
on public.reviews
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and product_id is null
  and counselor_id is not null
  and reservation_id is not null
  and hidden_by_admin = false
  and is_published = publish_consent
  and exists (
    select 1
    from public.reservations as reservation
    where reservation.id = reservation_id
      and reservation.user_id = (select auth.uid())
      and reservation.status = 'completed'
      and reservation.counselor_id = counselor_id
      and reservation.customer_name = author_name
  )
);

create policy reviews_update_own
on public.reviews
for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));

create policy reviews_delete_own
on public.reviews
for delete
to authenticated
using (author_id = (select auth.uid()));

grant insert (
  counselor_id,
  author_id,
  author_name,
  rating,
  body,
  reservation_id,
  publish_consent
) on public.reviews to authenticated;

grant update (
  rating,
  body,
  publish_consent,
  is_published
) on public.reviews to authenticated;

grant delete on public.reviews to authenticated;
