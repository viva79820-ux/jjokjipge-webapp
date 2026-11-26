-- reviews 작성 정책이 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 REVIEW_WRITE_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 검사 후 의도된 예외로 전체 트랜잭션을 롤백하므로 테스트 후기·회원·예약은 남지 않는다.
rollback;
begin;

do $preflight_prerequisite$
begin
  if to_regclass('public.reviews') is null then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREFLIGHT_PREREQUISITE_FAILED: public.reviews';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reviews'::regclass
      and attname = 'publish_consent'
      and attnum > 0
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREFLIGHT_ALREADY_APPLIED: publish_consent';
  end if;

  if to_regclass('public.reservations') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.counselors') is null
    or to_regprocedure('private.is_admin()') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREFLIGHT_PREREQUISITE_FAILED: reservations, consult_products, counselors, private.is_admin';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;

  if (select count(*) from public.reviews) <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEW_WRITE_PREFLIGHT_REFUSED: 기존 후기 행이 있어 검사를 중단함';
  end if;
end;
$preflight_prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.review_write_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  table_name text;
  component jsonb;
begin
  foreach table_name in array array[
    'profiles',
    'counselors',
    'products',
    'reservations',
    'reviews',
    'consult_products'
  ]
  loop
    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '
      || quote_literal('') || ' order by t.id::text), ' || quote_literal('') || '))) '
      || 'from public.' || quote_ident(table_name) || ' t'
    into component;
    state := state || jsonb_build_object(table_name || '_rows', component);

    execute
      'select jsonb_build_object('
      || quote_literal('columns') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || quote_literal('') || ' order by s.attnum), ' || quote_literal('') || ')) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a left join pg_attrdef d '
      || 'on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('constraints') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || quote_literal('') || ' order by s.conname), ' || quote_literal('') || ')) from ('
      || 'select c.conname, c.contype, pg_get_constraintdef(c.oid, true) as definition '
      || 'from pg_constraint c where c.conrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('indexes') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(i)::text), '
      || quote_literal('') || ' order by i.indexname), ' || quote_literal('') || ')) '
      || 'from pg_indexes i where i.schemaname = ' || quote_literal('public')
      || ' and i.tablename = ' || quote_literal(table_name) || '), '
      || quote_literal('policies') || ', ('
      || 'select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '
      || quote_literal('') || ' order by p.policyname), ' || quote_literal('') || ')) '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || '))'
    into component;
    state := state || jsonb_build_object(table_name || '_catalog', component);
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(u)::text), '' order by u.id::text), ''))
  )
  into component
  from auth.users u;
  state := state || jsonb_build_object('auth_users', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table review_write_baseline as
select jsonb_build_object(
  'format', 'review-write-preflight-v1',
  'eligible', true,
  'state', pg_temp.review_write_snapshot()
) as snapshot;

-- BEGIN EXACT MIGRATION
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
-- END EXACT MIGRATION

-- 관리자 ID는 역할 전환 전에 임시 actor 테이블에 보관한다.
create temporary table review_write_actors (
  kind text primary key,
  id uuid unique not null
);
insert into review_write_actors (kind, id)
select 'admin', id
from public.profiles
where role = 'admin'
order by id
limit 1;
insert into review_write_actors (kind, id) values
  ('owner', gen_random_uuid()),
  ('other', gen_random_uuid());

insert into auth.users (id, email, raw_user_meta_data)
select id, id::text || '@example.invalid', '{"name":"사전 검사 회원"}'::jsonb
from review_write_actors
where kind in ('owner', 'other');

create temporary table review_write_ids (
  kind text primary key,
  id uuid unique not null
);
insert into review_write_ids (kind, id) values
  ('counselor', gen_random_uuid()),
  ('other_counselor', gen_random_uuid()),
  ('product', gen_random_uuid()),
  ('completed', gen_random_uuid()),
  ('confirmed', gen_random_uuid()),
  ('pending', gen_random_uuid()),
  ('cancelled', gen_random_uuid()),
  ('other', gen_random_uuid()),
  ('guest', gen_random_uuid());

insert into public.counselors (id, slug, name, field, fields, careers)
select id, 'review-write-' || id::text, '사전 검사 상담사', 'tarot', array['tarot'], '{}'
from review_write_ids
where kind in ('counselor', 'other_counselor');

insert into public.consult_products (id, counselor_id, name, minutes, price)
select id, (select id from review_write_ids where kind = 'counselor'), '사전 검사 상담', 30, 1000
from review_write_ids
where kind = 'product';

create function pg_temp.review_write_reservation(
  reservation_kind text,
  owner_kind text,
  reservation_customer_name text,
  reservation_status text,
  reservation_starts_at timestamptz
)
returns void
language plpgsql
as $$
declare
  owner uuid;
begin
  if owner_kind is not null then
    select actors.id into owner
    from review_write_actors as actors
    where actors.kind = owner_kind;
  end if;
  insert into public.reservations (
    id,
    user_id,
    counselor_id,
    product_id,
    product_name,
    minutes,
    price,
    starts_at,
    ends_at,
    customer_name,
    customer_phone,
    customer_email,
    payment_method,
    status
  ) values (
    (select ids.id from review_write_ids as ids where ids.kind = reservation_kind),
    owner,
    (select ids.id from review_write_ids as ids where ids.kind = 'counselor'),
    (select ids.id from review_write_ids as ids where ids.kind = 'product'),
    '사전 검사 상담',
    30,
    1000,
    reservation_starts_at,
    reservation_starts_at + interval '30 minutes',
    reservation_customer_name,
    '010-0000-0000',
    'review-write@example.invalid',
    'bank_transfer',
    reservation_status
  );
end;
$$;

select pg_temp.review_write_reservation('completed', 'owner', '예약 고객', 'completed', '2026-10-01 01:00+00');
select pg_temp.review_write_reservation('confirmed', 'owner', '예약 고객', 'confirmed', '2026-10-01 02:00+00');
select pg_temp.review_write_reservation('pending', 'owner', '예약 고객', 'pending_payment', '2026-10-01 03:00+00');
select pg_temp.review_write_reservation('cancelled', 'owner', '예약 고객', 'cancelled', '2026-10-01 04:00+00');
select pg_temp.review_write_reservation('other', 'other', '다른 고객', 'completed', '2026-10-01 05:00+00');
select pg_temp.review_write_reservation('guest', null, '비회원 고객', 'completed', '2026-10-01 06:00+00');

create function pg_temp.review_write_assert(ok boolean, label text)
returns void
language plpgsql
as $$
begin
  if ok is distinct from true then
    raise exception 'REVIEW_WRITE_ASSERT_FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.review_write_expected_error(
  command text,
  expected_state text,
  label text
)
returns void
language plpgsql
as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate <> expected_state then
      raise exception 'REVIEW_WRITE_ERROR_MISMATCH: % expected % got % (%)',
        label, expected_state, sqlstate, sqlerrm;
    end if;
    return;
  end;
  raise exception 'REVIEW_WRITE_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.review_write_jwt(actor_kind text)
returns void
language plpgsql
as $$
declare
  actor uuid;
begin
  if actor_kind = 'anon' then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{}', true);
    return;
  end if;
  select actors.id into actor
  from review_write_actors as actors
  where actors.kind = actor_kind;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create function pg_temp.review_write_insert(
  reservation_kind text,
  author_kind text,
  review_author_name text,
  counselor_kind text,
  review_rating integer,
  review_body text,
  consent boolean
)
returns void
language plpgsql
as $$
begin
  insert into public.reviews (
    counselor_id,
    author_id,
    author_name,
    rating,
    body,
    reservation_id,
    publish_consent
  ) values (
    (select ids.id from review_write_ids as ids where ids.kind = counselor_kind),
    (select actors.id from review_write_actors as actors where actors.kind = author_kind),
    review_author_name,
    review_rating,
    review_body,
    (select ids.id from review_write_ids as ids where ids.kind = reservation_kind),
    consent
  );
end;
$$;

grant select on review_write_actors, review_write_ids to anon, authenticated;
grant execute on function pg_temp.review_write_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.review_write_expected_error(text, text, text) to anon, authenticated;
grant execute on function pg_temp.review_write_jwt(text) to anon, authenticated;
grant execute on function pg_temp.review_write_insert(text, text, text, text, integer, text, boolean) to anon, authenticated;

set local role anon;
select pg_temp.review_write_jwt('anon');
select pg_temp.review_write_assert(
  auth.uid() is null and not (select private.is_admin()),
  '비로그인 역할 확인'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'counselor', 5, '비로그인 후기', true)$$,
  '42501',
  '비로그인 후기 등록 차단'
);
select pg_temp.review_write_expected_error(
  $$select author_id, reservation_id from public.reviews$$,
  '42501',
  '비로그인 작성자·예약 식별자 조회 차단'
);
select pg_temp.review_write_expected_error(
  $$select public.list_my_reviews()$$,
  '42501',
  '비로그인 내 후기 함수 차단'
);
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('owner');
select pg_temp.review_write_assert(
  auth.uid() = (select id from review_write_actors where kind = 'owner')
  and not (select private.is_admin()),
  '작성 회원 인증 역할 확인'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('confirmed', 'owner', '예약 고객', 'counselor', 5, '확정 예약 후기', true)$$,
  '42501',
  '자격 없는 확정 예약 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('pending', 'owner', '예약 고객', 'counselor', 5, '입금 대기 후기', true)$$,
  '42501',
  '자격 없는 입금 대기 예약 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('cancelled', 'owner', '예약 고객', 'counselor', 5, '취소 예약 후기', true)$$,
  '42501',
  '자격 없는 취소 예약 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('other', 'owner', '다른 고객', 'counselor', 5, '타인 예약 후기', true)$$,
  '42501',
  '타인 예약 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('guest', 'owner', '비회원 고객', 'counselor', 5, '비회원 예약 후기', true)$$,
  '42501',
  '비회원 예약 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'other', '예약 고객', 'counselor', 5, '작성자 위조', true)$$,
  '42501',
  '타인 작성자 식별자 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'owner', '다른 이름', 'counselor', 5, '이름 위조', true)$$,
  '42501',
  '예약 고객명과 다른 작성자명 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'other_counselor', 5, '상담사 위조', true)$$,
  '42501',
  '예약 상담사와 다른 대상 거부'
);
select pg_temp.review_write_expected_error(
  $$insert into public.reviews (product_id, author_id, author_name, rating, body, publish_consent)
    select id, (select id from review_write_actors where kind = 'owner'), '예약 고객', 5, '상품 후기', true
    from review_write_ids where kind = 'product'$$,
  '42501',
  '상품 후기 작성 열 거부'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'counselor', 0, '별점 오류', true)$$,
  '23514',
  '별점 하한 차단'
);
select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'counselor', 5, '공개 동의 후기', true);
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(is_published and publish_consent and not hidden_by_admin and rating = 5)
    from public.list_my_reviews()
  ),
  '완료 예약 본인 후기 1건 공개 저장'
);
select pg_temp.review_write_expected_error(
  $$select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'counselor', 4, '중복 후기', false)$$,
  '23505',
  '같은 예약 중복 작성 거부'
);
select pg_temp.review_write_expected_error(
  $$select author_id, reservation_id from public.reviews$$,
  '42501',
  '작성 회원 작성자·예약 식별자 열 조회 차단'
);
select pg_temp.review_write_expected_error(
  $$select hidden_by_admin from public.reviews$$,
  '42501',
  '작성 회원 숨김 열 직접 조회 차단'
);
update public.reviews
set rating = 4, body = '수정한 후기', publish_consent = false;
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(rating = 4 and body = '수정한 후기' and not publish_consent and not is_published and not hidden_by_admin)
    from public.list_my_reviews()
  ),
  '본인 후기 별점·본문·비공개 수정'
);
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('other');
select pg_temp.review_write_assert(
  auth.uid() = (select id from review_write_actors where kind = 'other')
  and not (select private.is_admin()),
  '다른 회원 인증 역할 확인'
);
select pg_temp.review_write_assert(
  (select count(*) = 0 from public.reviews),
  '다른 회원은 비공개 후기를 보지 못함'
);
select pg_temp.review_write_assert(
  (select count(*) = 0 from public.list_my_reviews()),
  '다른 회원 내 후기 없음'
);
update public.reviews set body = '침범';
delete from public.reviews;
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('owner');
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(body = '수정한 후기' and rating = 4)
    from public.list_my_reviews()
  ),
  '다른 회원 수정·삭제 후 본인 후기 유지'
);
reset role;

set local role anon;
select pg_temp.review_write_jwt('anon');
select pg_temp.review_write_assert(
  (select count(*) = 0 from public.reviews),
  '비로그인 비공개 후기 조회 차단'
);
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('admin');
select pg_temp.review_write_assert(
  auth.uid() = (select id from review_write_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 확인'
);
select pg_temp.review_write_assert(
  (select count(*) = 1 and bool_and(not is_published) from public.reviews),
  '관리자 비공개 후기 조회'
);
select pg_temp.review_write_expected_error(
  $$update public.reviews set body = '관리자 본문 변경'$$,
  '42501',
  '관리자 본문 변경 차단'
);
select pg_temp.review_write_expected_error(
  $$select author_id, reservation_id from public.reviews$$,
  '42501',
  '관리자 작성자·예약 식별자 열 조회 차단'
);
update public.reviews set is_published = true;
select pg_temp.review_write_assert(
  (select count(*) = 1 and bool_and(is_published) from public.reviews),
  '관리자 공개 전환'
);
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('owner');
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(is_published and not publish_consent and not hidden_by_admin)
    from public.list_my_reviews()
  ),
  '관리자 공개 전환은 회원 동의를 바꾸지 않음'
);
reset role;

set local role anon;
select pg_temp.review_write_jwt('anon');
select pg_temp.review_write_assert(
  (select count(*) = 1 and bool_and(is_published) from public.reviews),
  '비로그인 공개 후기 조회'
);
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('admin');
update public.reviews set is_published = false;
reset role;

set local role authenticated;
select pg_temp.review_write_jwt('owner');
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(hidden_by_admin and not is_published)
    from public.list_my_reviews()
  ),
  '관리자 숨김은 회원 목록에 숨김으로 남음'
);
update public.reviews
set rating = 3, body = '숨김 뒤 수정', publish_consent = true;
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(
        hidden_by_admin
        and not is_published
        and publish_consent
        and rating = 3
        and body = '숨김 뒤 수정'
      )
    from public.list_my_reviews()
  ),
  '관리자 숨김 중 회원 수정은 공개로 되돌리지 못함'
);
delete from public.reviews;
select pg_temp.review_write_assert(
  (select count(*) = 0 from public.list_my_reviews()),
  '본인 후기 삭제'
);
select pg_temp.review_write_insert('completed', 'owner', '예약 고객', 'counselor', 5, '삭제 후 다시 작성', false);
select pg_temp.review_write_assert(
  (
    select count(*) = 1
      and bool_and(not is_published and not publish_consent and not hidden_by_admin)
    from public.list_my_reviews()
  ),
  '삭제 후 같은 예약에 비공개 후기 재작성'
);
reset role;

set local role anon;
select pg_temp.review_write_jwt('anon');
select pg_temp.review_write_assert(
  (select count(*) = 0 from public.reviews),
  '비로그인 재작성 비공개 후기 조회 차단'
);
reset role;

delete from public.reviews
where counselor_id in (
  select id from review_write_ids where kind in ('counselor', 'other_counselor')
);
delete from public.reservations
where id in (select id from review_write_ids where kind in (
  'completed', 'confirmed', 'pending', 'cancelled', 'other', 'guest'
));
delete from public.consult_products
where id = (select id from review_write_ids where kind = 'product');
delete from public.counselors
where id in (
  select id from review_write_ids where kind in ('counselor', 'other_counselor')
);
delete from auth.users
where id in (
  select id from review_write_actors where kind in ('owner', 'other')
);

select pg_temp.review_write_assert(
  pg_temp.review_write_snapshot()->'profiles_rows'
    = (select snapshot->'state'->'profiles_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'counselors_rows'
    = (select snapshot->'state'->'counselors_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'products_rows'
    = (select snapshot->'state'->'products_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'reservations_rows'
    = (select snapshot->'state'->'reservations_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'reviews_rows'
    = (select snapshot->'state'->'reviews_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'consult_products_rows'
    = (select snapshot->'state'->'consult_products_rows' from review_write_baseline)
  and pg_temp.review_write_snapshot()->'auth_users'
    = (select snapshot->'state'->'auth_users' from review_write_baseline),
  '기존 행과 인증 계정 원본 보존'
);

do $success$
declare
  baseline jsonb;
begin
  select snapshot into baseline from review_write_baseline;
  raise exception using
    errcode = 'P0001',
    message = 'REVIEW_WRITE_PREFLIGHT_OK: 완료 예약 자격, 비회원·타인·중복 거부, 본인 수정·삭제, 관리자 숨김 구분, 열 권한 검사 통과. 테스트 행은 의도된 전체 롤백으로 제거됨.',
    detail = baseline::text;
end;
$success$;
