-- reviews가 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 REVIEWS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 검사 후 의도된 예외로 전체 트랜잭션을 롤백하므로 테스트 후기는 남지 않는다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  object_name text;
begin
  if to_regclass('public.reviews') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_PREFLIGHT_ALREADY_APPLIED: public.reviews';
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
      message = 'REVIEWS_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
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
      message = 'REVIEWS_PREFLIGHT_PREREQUISITE_FAILED: 기존 대상 테이블 RLS 비활성';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.reviews_snapshot()
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
    'reservations'
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

create temporary table reviews_baseline as
select jsonb_build_object(
  'format', 'reviews-preflight-v1',
  'eligible', true,
  'state', pg_temp.reviews_snapshot()
) as snapshot;

-- BEGIN EXACT MIGRATION
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
grant select (
  id,
  counselor_id,
  product_id,
  author_name,
  rating,
  body,
  is_published,
  created_at,
  updated_at
) on public.reviews to anon, authenticated;
grant update (is_published) on public.reviews to authenticated;
-- END EXACT MIGRATION

create temporary table reviews_test_ids (
  kind text primary key,
  id uuid unique not null
);
insert into reviews_test_ids (kind, id) values
  ('counselor', gen_random_uuid()),
  ('product', gen_random_uuid()),
  ('private_review', gen_random_uuid()),
  ('public_counselor_review', gen_random_uuid()),
  ('public_product_review', gen_random_uuid()),
  ('non_admin', gen_random_uuid());

create temporary table reviews_test_actors (
  kind text primary key,
  id uuid unique not null
);
insert into reviews_test_actors (kind, id)
select 'admin', id
from public.profiles
where role = 'admin'
order by id
limit 1;
insert into reviews_test_actors (kind, id)
select 'non_admin', id
from reviews_test_ids
where kind = 'non_admin';

insert into public.counselors (
  id,
  slug,
  name,
  field,
  fields,
  careers
)
values (
  (select id from reviews_test_ids where kind = 'counselor'),
  'reviews-preflight-' || (select id from reviews_test_ids where kind = 'counselor'),
  '사전 검사 상담사',
  'tarot',
  array['tarot'],
  '{}'
);

insert into public.products (
  id,
  name,
  description,
  price
)
values (
  (select id from reviews_test_ids where kind = 'product'),
  '사전 검사 상품',
  '사전 검사 후 롤백되는 상품',
  1
);

insert into public.reviews (
  id,
  counselor_id,
  author_name,
  rating,
  body,
  created_at
)
values (
  (select id from reviews_test_ids where kind = 'private_review'),
  (select id from reviews_test_ids where kind = 'counselor'),
  '비공개 작성자',
  5,
  '트랜잭션에서 롤백되는 비공개 검사 후기',
  '2026-01-03 00:00:00+00'
);

insert into public.reviews (
  id,
  counselor_id,
  author_name,
  rating,
  body,
  is_published,
  created_at
)
values (
  (select id from reviews_test_ids where kind = 'public_counselor_review'),
  (select id from reviews_test_ids where kind = 'counselor'),
  '상담 후기 작성자',
  4,
  '트랜잭션에서 롤백되는 공개 상담 후기',
  true,
  '2026-01-02 00:00:00+00'
);

insert into public.reviews (
  id,
  product_id,
  author_name,
  rating,
  body,
  is_published,
  created_at
)
values (
  (select id from reviews_test_ids where kind = 'public_product_review'),
  (select id from reviews_test_ids where kind = 'product'),
  '상품 후기 작성자',
  1,
  '트랜잭션에서 롤백되는 공개 상품 후기',
  true,
  '2026-01-01 00:00:00+00'
);

create function pg_temp.reviews_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'REVIEWS_ASSERT_FAILED: %', label;
  end if;
end;
$$;

create function pg_temp.reviews_expected_error(
  command text,
  expected_state text,
  label text
)
returns void
language plpgsql
security invoker
as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate <> expected_state then
      raise;
    end if;
    return;
  end;
  raise exception 'REVIEWS_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

grant select on reviews_test_ids, reviews_test_actors to anon, authenticated;
grant execute on function pg_temp.reviews_assert(boolean, text)
to anon, authenticated;
grant execute on function pg_temp.reviews_expected_error(text, text, text)
to anon, authenticated;

select pg_temp.reviews_assert(
  (
    select array_agg(id order by created_at desc, id desc) = array[
      (select id from reviews_test_ids where kind = 'private_review'),
      (select id from reviews_test_ids where kind = 'public_counselor_review'),
      (select id from reviews_test_ids where kind = 'public_product_review')
    ]
    from public.reviews
    where id in (
      select id
      from reviews_test_ids
      where kind like '%review'
    )
  ),
  '최신순 정렬'
);

select pg_temp.reviews_expected_error(
  $$insert into public.reviews (counselor_id, product_id, author_name, rating, body)
    select c.id, p.id, '작성자', 5, '본문'
    from reviews_test_ids c, reviews_test_ids p
    where c.kind = 'counselor' and p.kind = 'product'$$,
  '23514',
  '상담사와 상품 동시 대상 차단'
);
select pg_temp.reviews_expected_error(
  $$insert into public.reviews (author_name, rating, body)
    values ('작성자', 5, '본문')$$,
  '23514',
  '대상 없는 후기 차단'
);
select pg_temp.reviews_expected_error(
  $$insert into public.reviews (counselor_id, author_name, rating, body)
    select id, '작성자', 0, '본문' from reviews_test_ids where kind = 'counselor'$$,
  '23514',
  '별점 하한 차단'
);
select pg_temp.reviews_expected_error(
  $$insert into public.reviews (product_id, author_name, rating, body)
    select id, '작성자', 6, '본문' from reviews_test_ids where kind = 'product'$$,
  '23514',
  '별점 상한 차단'
);
select pg_temp.reviews_expected_error(
  $$insert into public.reviews (product_id, author_name, rating, body, reservation_id)
    select id, '작성자', 5, '본문', gen_random_uuid()
    from reviews_test_ids where kind = 'product'$$,
  '23514',
  '상품 후기에 예약 자격 연결 차단'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.reviews_assert(
  (
    select count(*) = 2 and bool_and(is_published)
    from public.reviews
    where id in (
      select id
      from reviews_test_ids
      where kind like '%review'
    )
  ),
  '비로그인 공개 후기만 조회'
);
select pg_temp.reviews_expected_error(
  $$update public.reviews set is_published = false$$,
  '42501',
  '비로그인 공개 상태 변경 차단'
);
select pg_temp.reviews_expected_error(
  $$insert into public.reviews (author_name, rating, body) values ('침범', 5, '침범')$$,
  '42501',
  '비로그인 후기 등록 차단'
);
select pg_temp.reviews_expected_error(
  $$select author_id, reservation_id from public.reviews$$,
  '42501',
  '비로그인 작성자·예약 식별자 조회 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from reviews_test_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from reviews_test_actors where kind = 'non_admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.reviews_assert(
  auth.uid() = (select id from reviews_test_actors where kind = 'non_admin')
  and not (select private.is_admin()),
  '비관리자 인증 역할 확인'
);
select pg_temp.reviews_assert(
  (
    select count(*) = 2 and bool_and(is_published)
    from public.reviews
    where id in (
      select id
      from reviews_test_ids
      where kind like '%review'
    )
  ),
  '일반 회원 공개 후기만 조회'
);
update public.reviews
set is_published = false
where id = (
  select id from reviews_test_ids where kind = 'public_counselor_review'
);
select pg_temp.reviews_assert(
  (
    select is_published
    from public.reviews
    where id = (
      select id from reviews_test_ids where kind = 'public_counselor_review'
    )
  ),
  '일반 회원 공개 상태 변경 0행'
);
select pg_temp.reviews_expected_error(
  $$update public.reviews set body = '침범'$$,
  '42501',
  '일반 회원 본문 변경 권한 없음'
);
select pg_temp.reviews_expected_error(
  $$select author_id, reservation_id from public.reviews$$,
  '42501',
  '일반 회원 작성자·예약 식별자 조회 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from reviews_test_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from reviews_test_actors where kind = 'admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.reviews_assert(
  auth.uid() = (select id from reviews_test_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 확인'
);
select pg_temp.reviews_assert(
  (
    select count(*) = 3
    from public.reviews
    where id in (
      select id
      from reviews_test_ids
      where kind like '%review'
    )
  ),
  '관리자 비공개 포함 조회'
);
update public.reviews
set is_published = true
where id = (select id from reviews_test_ids where kind = 'private_review');
select pg_temp.reviews_assert(
  (
    select is_published and updated_at > created_at
    from public.reviews
    where id = (select id from reviews_test_ids where kind = 'private_review')
  ),
  '관리자 공개 전환과 수정일 갱신'
);
select pg_temp.reviews_expected_error(
  $$update public.reviews set body = '관리자도 본문은 변경 불가'$$,
  '42501',
  '관리자 공개 여부 외 열 변경 차단'
);
update public.reviews
set is_published = false
where id = (select id from reviews_test_ids where kind = 'private_review');
reset role;

delete from public.reviews
where id in (
  select id
  from reviews_test_ids
  where kind like '%review'
);
delete from public.products
where id = (select id from reviews_test_ids where kind = 'product');
delete from public.counselors
where id = (select id from reviews_test_ids where kind = 'counselor');

select pg_temp.reviews_assert(
  pg_temp.reviews_snapshot() = (
    select snapshot->'state'
    from reviews_baseline
  ),
  '기존 대상 테이블·인증·카탈로그 원본 보존'
);

do $success$
declare
  baseline jsonb;
begin
  select snapshot into baseline from reviews_baseline;
  raise exception using
    errcode = 'P0001',
    message = 'REVIEWS_PREFLIGHT_OK: 대상·별점·본문 제약, 공개 최신순, 공개 전용 조회, 관리자 공개 전환, 열 권한, RLS 검사 통과. 테스트 행은 의도된 전체 롤백으로 제거됨. 실제 Data API·브라우저 세션·K-07 작성 자격은 미검증.',
    detail = baseline::text;
end;
$success$;
