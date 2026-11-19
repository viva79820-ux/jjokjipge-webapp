-- products가 아직 없는 DB에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 SHOP_PRODUCTS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 실제 계정·profile·기존 업무 행·Storage 객체를 변경하지 않으며 성공 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  table_name text;
begin
  if to_regclass('public.products') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_ALREADY_APPLIED: public.products';
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
  if to_regclass('storage.buckets') is null then
    missing := array_append(missing, 'storage.buckets');
  end if;
  if to_regclass('storage.objects') is null then
    missing := array_append(missing, 'storage.objects');
  end if;

  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
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
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: 기존 업무 테이블 RLS 비활성';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'public-images'
      and name = 'public-images'
      and public
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: public-images 공개 버킷 필요';
  end if;

  if (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'public_images_select_admin',
        'public_images_insert_admin',
        'public_images_update_admin',
        'public_images_delete_admin'
      )
      and roles = array['authenticated']::name[]
  ) is not true
  or not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public_images_insert_admin'
      and cmd = 'INSERT'
      and with_check is not null
      and with_check like '%public-images%'
      and with_check like '%private.is_admin()%'
      and with_check not like '%foldername%'
  )
  or not has_table_privilege('authenticated', 'storage.objects', 'INSERT')
  then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: products/를 포함하는 기존 Storage 관리자 정책 필요';
  end if;
end;
$prerequisite$;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.shop_products_snapshot()
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
  catalog_state jsonb;
  empty_literal text := quote_literal('');
begin
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
    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(t)::text), '
      || empty_literal || ' order by t.id::text), ' || empty_literal || '))) '
      || 'from public.' || quote_ident(table_name) || ' t'
    into component;
    state := state || jsonb_build_object(table_name || '_rows', component);

    execute
      'select jsonb_build_object('
      || quote_literal('table') || ', ('
      || 'select to_jsonb(s) from (select c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relowner '
      || 'from pg_class c where c.oid = ' || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('columns') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.attnum), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, a.attidentity, a.attgenerated, a.attcollation, '
      || 'pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a left join pg_attrdef d '
      || 'on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('constraints') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.conname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select c.conname, c.contype, c.condeferrable, c.condeferred, c.convalidated, '
      || 'pg_get_constraintdef(c.oid, true) as definition '
      || 'from pg_constraint c where c.conrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('indexes') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.indexname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select i.indexname, i.indexdef from pg_indexes i '
      || 'where i.schemaname = ' || quote_literal('public')
      || ' and i.tablename = ' || quote_literal(table_name) || ') s), '
      || quote_literal('policies') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.policyname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || ') s), '
      || quote_literal('table_grants') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.grantee::text, s.grantor::text, s.privilege_type), '
      || quote_literal('[]') || '::jsonb) from ('
      || 'select x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_class c cross join lateral aclexplode(c.relacl) x '
      || 'where c.oid = ' || quote_literal('public.' || table_name) || '::regclass) s), '
      || quote_literal('column_grants') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.attnum, s.grantee::text, s.grantor::text, s.privilege_type), '
      || quote_literal('[]') || '::jsonb) from ('
      || 'select a.attnum, a.attname, x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_attribute a cross join lateral aclexplode(a.attacl) x '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s), '
      || quote_literal('triggers') || ', ('
      || 'select coalesce(jsonb_agg(to_jsonb(s) order by s.tgname), ' || quote_literal('[]') || '::jsonb) from ('
      || 'select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) as definition '
      || 'from pg_trigger t where not t.tgisinternal and t.tgrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s))'
    into catalog_state;
    state := state || jsonb_build_object(
      table_name || '_catalog',
      jsonb_build_object('count', 7, 'hash', md5(catalog_state::text))
    );
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(pg_get_functiondef(p.oid) || coalesce(p.proacl::text, '')),
      '' order by p.proname, pg_get_function_identity_arguments(p.oid)
    ), ''))
  )
  into component
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private';
  state := state || jsonb_build_object('private_functions', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.defaclrole::text, s.defaclnamespace::text, s.defaclobjtype
    ), ''))
  )
  into component
  from (
    select d.defaclrole, d.defaclnamespace, d.defaclobjtype, d.defaclacl
    from pg_default_acl d
  ) s;
  state := state || jsonb_build_object('default_privileges', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(u)::text), '' order by u.id::text), ''))
  )
  into component
  from auth.users u;
  state := state || jsonb_build_object('auth_users', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(b)::text), '' order by b.id), ''))
  )
  into component
  from storage.buckets b;
  state := state || jsonb_build_object('storage_buckets', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(o)::text), '' order by o.id::text), ''))
  )
  into component
  from storage.objects o;
  state := state || jsonb_build_object('storage_objects', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.policyname), ''))
  )
  into component
  from pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects';
  state := state || jsonb_build_object('storage_object_policies', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

create temporary table shop_products_test_ids (
  kind text primary key,
  id uuid unique not null
);
insert into shop_products_test_ids (kind, id) values
  ('private_available', 'ffffffff-ffff-4fff-8fff-ffffffffe001'),
  ('private_sold_out', 'ffffffff-ffff-4fff-8fff-ffffffffe002'),
  ('public_available', 'ffffffff-ffff-4fff-8fff-ffffffffe003'),
  ('public_sold_out', 'ffffffff-ffff-4fff-8fff-ffffffffe004'),
  ('admin_crud', 'ffffffff-ffff-4fff-8fff-ffffffffe005');

create temporary table shop_products_actors (
  kind text primary key,
  id uuid not null,
  mode text not null
);
insert into shop_products_actors (kind, id, mode)
select 'admin', id, 'admin_profile'
from public.profiles
where role = 'admin'
order by id
limit 1;

with existing_user as (
  select id
  from public.profiles
  where role = 'user'
  order by id
  limit 1
),
fallback_candidates as (
  select gen_random_uuid() as id
  from generate_series(1, 16)
),
fallback as (
  select c.id
  from fallback_candidates c
  where not exists (select 1 from public.profiles p where p.id = c.id)
  order by c.id
  limit 1
)
insert into shop_products_actors (kind, id, mode)
select
  'non_admin',
  coalesce((select id from existing_user), (select id from fallback)),
  case
    when exists (select 1 from existing_user) then 'existing_user'
    else 'profileless'
  end;

do $actor_check$
begin
  if (select count(*) from shop_products_actors) <> 2
    or (
      select id from shop_products_actors where kind = 'non_admin'
    ) = (
      select id from shop_products_actors where kind = 'admin'
    )
    or exists (
      select 1
      from public.profiles p
      join shop_products_actors a on a.id = p.id
      where a.kind = 'non_admin'
        and p.role = 'admin'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: 검사 역할 선택 실패';
  end if;
end;
$actor_check$;

create temporary table shop_products_baseline as
select jsonb_build_object(
  'format', 'shop-products-preflight-v1',
  'eligible', true,
  'state', pg_temp.shop_products_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from shop_products_test_ids
  ),
  'non_admin_mode', (
    select mode
    from shop_products_actors
    where kind = 'non_admin'
  )
) as snapshot;

create temporary table shop_products_results (
  label text not null
);
grant select on shop_products_test_ids, shop_products_actors to anon, authenticated;
grant insert on shop_products_results to anon, authenticated;

create function pg_temp.shop_products_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'SHOP_PRODUCTS_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.shop_products_results values (label);
end;
$$;

create function pg_temp.shop_products_expected_error(
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
    insert into pg_temp.shop_products_results values (label);
    return;
  end;
  raise exception 'SHOP_PRODUCTS_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.shop_products_no_rows(command text, label text)
returns void
language plpgsql
security invoker
as $$
declare
  affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'SHOP_PRODUCTS_UNEXPECTED_ROWS: %', label;
  end if;
  insert into pg_temp.shop_products_results values (label);
end;
$$;

grant execute on function pg_temp.shop_products_assert(boolean, text)
to anon, authenticated;
grant execute on function pg_temp.shop_products_expected_error(text, text, text)
to anon, authenticated;
grant execute on function pg_temp.shop_products_no_rows(text, text)
to anon, authenticated;

-- BEGIN EXACT MIGRATION
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
-- END EXACT MIGRATION

insert into public.products (
  id,
  name,
  description,
  price,
  updated_at
)
values (
  (select id from shop_products_test_ids where kind = 'private_available'),
  '테스트 비공개 판매 가능 상품',
  '테스트 설명',
  1,
  '2000-01-01'
);
select pg_temp.shop_products_assert(
  (
    select
      image_path is null
      and image_alt is null
      and not is_published
      and not is_sold_out
      and sort_order = 0
      and created_at = now()
      and updated_at = '2000-01-01'::timestamptz
    from public.products
    where id = (select id from shop_products_test_ids where kind = 'private_available')
  ),
  '상품 기본값과 선택 이미지 NULL'
);

insert into public.products (
  id,
  name,
  description,
  price,
  is_sold_out,
  sort_order,
  created_at
)
values (
  (select id from shop_products_test_ids where kind = 'private_sold_out'),
  '테스트 비공개 품절 상품',
  '테스트 설명',
  2,
  true,
  2,
  '2026-01-01 00:00:00+00'
);
insert into public.products (
  id,
  name,
  description,
  price,
  is_published,
  sort_order,
  created_at
)
values (
  (select id from shop_products_test_ids where kind = 'public_available'),
  repeat('가', 100),
  repeat('나', 5000),
  2147483647,
  true,
  1,
  '2026-01-02 00:00:00+00'
);
insert into public.products (
  id,
  name,
  description,
  price,
  image_path,
  image_alt,
  is_published,
  is_sold_out,
  sort_order,
  created_at
)
values (
  (select id from shop_products_test_ids where kind = 'public_sold_out'),
  '테스트 공개 품절 상품',
  '테스트 설명',
  3,
  'products/123e4567-e89b-42d3-a456-426614174000.webp',
  repeat('대', 200),
  true,
  true,
  1,
  '2026-01-03 00:00:00+00'
);
select pg_temp.shop_products_assert(
  (
    select count(*) = 4
      and count(*) filter (where not is_published and not is_sold_out) = 1
      and count(*) filter (where not is_published and is_sold_out) = 1
      and count(*) filter (where is_published and not is_sold_out) = 1
      and count(*) filter (where is_published and is_sold_out) = 1
    from public.products
    where id in (select id from shop_products_test_ids)
  ),
  '공개와 품절 네 조합 독립 저장'
);
select pg_temp.shop_products_assert(
  (
    select array_agg(id order by sort_order asc, created_at desc, id desc) = array[
      (select id from shop_products_test_ids where kind = 'private_available'),
      (select id from shop_products_test_ids where kind = 'public_sold_out'),
      (select id from shop_products_test_ids where kind = 'public_available'),
      (select id from shop_products_test_ids where kind = 'private_sold_out')
    ]
    from public.products
    where id in (select id from shop_products_test_ids)
  ),
  'sort_order ASC created_at DESC id DESC 정렬'
);

do $constraint_matrix$
declare
  test_case record;
  invalid_path text;
begin
  for test_case in
    select *
    from (
      values
        ($$insert into public.products (id, name, description, price) values (null, '상품', '설명', 1)$$, '23502'),
        ($$insert into public.products (name, description, price) values (null, '설명', 1)$$, '23502'),
        ($$insert into public.products (name, description, price) values ('상품', null, 1)$$, '23502'),
        ($$insert into public.products (name, description, price) values ('상품', '설명', null)$$, '23502'),
        ($$insert into public.products (name, description, price, is_published) values ('상품', '설명', 1, null)$$, '23502'),
        ($$insert into public.products (name, description, price, is_sold_out) values ('상품', '설명', 1, null)$$, '23502'),
        ($$insert into public.products (name, description, price, sort_order) values ('상품', '설명', 1, null)$$, '23502'),
        ($$insert into public.products (name, description, price, created_at) values ('상품', '설명', 1, null)$$, '23502'),
        ($$insert into public.products (name, description, price, updated_at) values ('상품', '설명', 1, null)$$, '23502'),
        ($$insert into public.products (name, description, price) values (E' \t\n', '설명', 1)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', E' \t\n', 1)$$, '23514'),
        ($$insert into public.products (name, description, price) values (repeat('가', 101), '설명', 1)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', repeat('가', 5001), 1)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', '설명', 0)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', '설명', -1)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', '설명', 1.5)$$, '23514'),
        ($$insert into public.products (name, description, price) values ('상품', '설명', 2147483648)$$, '23514'),
        ($$insert into public.products (name, description, price, image_alt) values ('상품', '설명', 1, E' \t\n')$$, '23514'),
        ($$insert into public.products (name, description, price, image_alt) values ('상품', '설명', 1, repeat('가', 201))$$, '23514'),
        ($$insert into public.products (name, description, price, image_path) values ('상품', '설명', 1, 'products/123e4567-e89b-42d3-a456-426614174000.jpg')$$, '23514'),
        ($$insert into public.products (name, description, price, sort_order) values ('상품', '설명', 1, -1)$$, '23514')
    ) as cases(command, expected_state)
  loop
    perform pg_temp.shop_products_expected_error(
      test_case.command,
      test_case.expected_state,
      '필수값·공백·길이·가격·이미지 설명·정렬 제약: ' || left(test_case.command, 70)
    );
  end loop;

  foreach invalid_path in array array[
    '',
    'https://example.invalid/products/123e4567-e89b-42d3-a456-426614174000.jpg',
    'public-images/products/123e4567-e89b-42d3-a456-426614174000.jpg',
    'notices/123e4567-e89b-42d3-a456-426614174000.jpg',
    'products/../notices/123e4567-e89b-42d3-a456-426614174000.jpg',
    'products/123E4567-E89B-42D3-A456-426614174000.jpg',
    'products/123e4567-e89b-42d3-a456-426614174000.gif',
    'products/not-a-uuid.png',
    '/products/123e4567-e89b-42d3-a456-426614174000.webp',
    'products//123e4567-e89b-42d3-a456-426614174000.webp'
  ]
  loop
    perform pg_temp.shop_products_expected_error(
      format(
        'insert into public.products (name, description, price, image_path, image_alt) values (%L, %L, %s, %L, %L)',
        '테스트',
        '설명',
        1,
        invalid_path,
        '대체 설명'
      ),
      '23514',
      '상품 이미지 경로 거부: ' || left(invalid_path, 60)
    );
  end loop;
end;
$constraint_matrix$;

do $valid_image_extensions$
declare
  extension text;
begin
  foreach extension in array array['jpg', 'jpeg', 'png', 'webp']
  loop
    execute format(
      'insert into public.products (name, description, price, image_path, image_alt) values (%L, %L, %s, %L, %L)',
      '확장자 테스트 ' || extension,
      '설명',
      1,
      'products/' || gen_random_uuid()::text || '.' || extension,
      '대체 설명'
    );
  end loop;
  perform pg_temp.shop_products_assert(
    (
      select count(*) = 4
      from public.products
      where name like '확장자 테스트 %'
    ),
    '상품 이미지 네 확장자와 대체 설명 허용'
  );
end;
$valid_image_extensions$;

update public.products
set name = name
where id = (select id from shop_products_test_ids where kind = 'private_available');
select pg_temp.shop_products_assert(
  (
    select updated_at = now()
    from public.products
    where id = (select id from shop_products_test_ids where kind = 'private_available')
  ),
  '기존 updated_at 트리거 함수 재사용'
);

do $catalog_check$
declare
  actor text;
  privilege text;
begin
  perform pg_temp.shop_products_assert(
    (
      select relrowsecurity
      from pg_class
      where oid = 'public.products'::regclass
    ),
    'products RLS 활성'
  );

  foreach actor in array array['anon', 'authenticated', 'service_role']
  loop
    foreach privilege in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]
    loop
      perform pg_temp.shop_products_assert(
        has_table_privilege(actor, 'public.products', privilege) = (
          (actor in ('anon', 'authenticated') and privilege = 'SELECT')
          or (
            actor = 'authenticated'
            and privilege in ('INSERT', 'UPDATE', 'DELETE')
          )
        ),
        actor || ' products ' || privilege || ' 최소 권한'
      );
    end loop;
  end loop;

  perform pg_temp.shop_products_assert(
    not exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(c.relacl) x
      where c.oid = 'public.products'::regclass
        and x.grantee = 0
    ),
    'products PUBLIC 권한 없음'
  );
  perform pg_temp.shop_products_assert(
    pg_get_indexdef('public.products_published_sort_idx'::regclass) =
      'CREATE INDEX products_published_sort_idx ON public.products USING btree (is_published, sort_order, created_at DESC, id DESC)',
    '상품 공개·정렬 인덱스'
  );
  perform pg_temp.shop_products_assert(
    (
      select count(*) = 4
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
    ),
    '상품 SELECT·INSERT·UPDATE·DELETE 정책'
  );
  perform pg_temp.shop_products_assert(
    (
      select count(*) = 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
        and cmd = 'UPDATE'
        and qual is not null
        and with_check is not null
    ),
    '관리자 UPDATE USING·WITH CHECK'
  );
  perform pg_temp.shop_products_assert(
    (
      select format_type(a.atttypid, a.atttypmod) = 'numeric'
      from pg_attribute a
      where a.attrelid = 'public.products'::regclass
        and a.attname = 'price'
        and not a.attisdropped
    ),
    '가격 numeric과 정수 CHECK 조합'
  );
end;
$catalog_check$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.shop_products_assert(
  auth.uid() is null
  and not (select private.is_admin()),
  '비로그인 역할 확인'
);
select pg_temp.shop_products_assert(
  (
    select count(*) = 2
      and bool_and(is_published)
      and count(*) filter (where is_sold_out) = 1
    from public.products
    where id in (select id from shop_products_test_ids)
  ),
  '비로그인 공개 판매 가능·품절 행만 조회'
);
select pg_temp.shop_products_expected_error(
  $$insert into public.products (name, description, price) values ('침범', '설명', 1)$$,
  '42501',
  '비로그인 상품 INSERT 차단'
);
select pg_temp.shop_products_expected_error(
  $$update public.products set name = '침범'$$,
  '42501',
  '비로그인 상품 UPDATE 차단'
);
select pg_temp.shop_products_expected_error(
  $$delete from public.products$$,
  '42501',
  '비로그인 상품 DELETE 차단'
);
select pg_temp.shop_products_expected_error(
  $$truncate public.products$$,
  '42501',
  '비로그인 상품 TRUNCATE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from shop_products_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from shop_products_actors where kind = 'non_admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.shop_products_assert(
  auth.uid() = (select id from shop_products_actors where kind = 'non_admin')
  and not (select private.is_admin()),
  '비관리자 인증 역할 확인'
);
select pg_temp.shop_products_assert(
  (
    select count(*) = 2
      and bool_and(is_published)
      and count(*) filter (where is_sold_out) = 1
    from public.products
    where id in (select id from shop_products_test_ids)
  ),
  '비관리자 인증 역할 공개 판매 가능·품절 행만 조회'
);
select pg_temp.shop_products_expected_error(
  $$insert into public.products (name, description, price) values ('침범', '설명', 1)$$,
  '42501',
  '비관리자 상품 INSERT RLS 차단'
);
select pg_temp.shop_products_no_rows(
  $$update public.products set name = '침범'$$,
  '비관리자 상품 UPDATE 0행'
);
select pg_temp.shop_products_no_rows(
  $$delete from public.products$$,
  '비관리자 상품 DELETE 0행'
);
select pg_temp.shop_products_expected_error(
  $$truncate public.products$$,
  '42501',
  '비관리자 상품 TRUNCATE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from shop_products_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',
    (select id::text from shop_products_actors where kind = 'admin'),
    'role',
    'authenticated'
  )::text,
  true
);
select pg_temp.shop_products_assert(
  auth.uid() = (select id from shop_products_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 확인'
);
select pg_temp.shop_products_assert(
  (
    select count(*) = 4
    from public.products
    where id in (select id from shop_products_test_ids)
  ),
  '관리자 비공개 포함 조회'
);
insert into public.products (
  id,
  name,
  description,
  price
)
values (
  (select id from shop_products_test_ids where kind = 'admin_crud'),
  '테스트 관리자 상품',
  '설명',
  1000
);
update public.products
set
  is_published = true,
  is_sold_out = true,
  price = 2000
where id = (select id from shop_products_test_ids where kind = 'admin_crud');
select pg_temp.shop_products_assert(
  (
    select is_published and is_sold_out and price = 2000
    from public.products
    where id = (select id from shop_products_test_ids where kind = 'admin_crud')
  ),
  '관리자 상품 등록·수정'
);
update public.products
set
  is_published = false,
  is_sold_out = false
where id = (select id from shop_products_test_ids where kind = 'admin_crud');
select pg_temp.shop_products_assert(
  (
    select not is_published and not is_sold_out
    from public.products
    where id = (select id from shop_products_test_ids where kind = 'admin_crud')
  ),
  '관리자 공개와 품절 독립 해제'
);
with removed as (
  delete from public.products
  where id = (select id from shop_products_test_ids where kind = 'admin_crud')
  returning id
)
select pg_temp.shop_products_assert(
  (select count(*) = 1 from removed),
  '관리자 상품 삭제'
);
reset role;

select pg_temp.shop_products_assert(
  pg_temp.shop_products_snapshot() = (
    select snapshot->'state'
    from shop_products_baseline
  ),
  '기존 10개 업무 테이블·인증·Storage·정책·권한·함수·기본 권한 보존'
);

do $success$
declare
  total integer;
  baseline jsonb;
  non_admin_description text;
begin
  select count(*) into total from shop_products_results;
  select snapshot into baseline from shop_products_baseline;
  select case mode
    when 'existing_user' then '기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    when 'profileless' then '프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)'
  end
  into non_admin_description
  from shop_products_actors
  where kind = 'non_admin';

  raise exception using
    errcode = 'P0001',
    message = format(
      'SHOP_PRODUCTS_PREFLIGHT_OK: 검사 %s개 통과. %s. SQL 역할·RLS·CHECK·GRANT·전체 롤백 검사 통과, 실제 Supabase Data API·실제 로그인·Storage API·파일 존재·MIME·크기·후속 주문 차단 미검증. 의도된 전체 롤백.',
      total,
      non_admin_description
    ),
    detail = baseline::text;
end;
$success$;
