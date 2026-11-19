-- SHOP_PRODUCTS_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

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

do $rollback_check$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'shop-products-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
    or baseline->>'non_admin_mode' not in ('existing_user', 'profileless')
  then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.products') is not null
    or to_regclass('public.products_published_sort_idx') is not null
    or exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'products'
    )
    or exists (
      select 1
      from pg_trigger
      where tgname = 'products_set_updated_at'
        and not tgisinternal
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_ROLLBACK_FAILED: 신규 상품 객체 잔존';
  end if;

  if to_regclass('public.profiles') is null
    or to_regclass('public.stores') is null
    or to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.reservations') is null
    or to_regclass('public.faqs') is null
    or to_regclass('public.inquiries') is null
    or to_regclass('public.notices') is null
    or to_regclass('public.classes') is null
    or to_regclass('public.contents') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_ROLLBACK_FAILED: 기존 10개 업무 테이블 없음';
  end if;

  current_state := pg_temp.shop_products_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'SHOP_PRODUCTS_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'SHOP_PRODUCTS_ROLLBACK_FAILED: 기존 데이터·정책·권한 불일치: ' || component;
    end if;
  end loop;

  raise notice 'SHOP_PRODUCTS_ROLLBACK_OK: 신규 상품 객체·검사 행 없음. 기존 10개 업무 테이블·인증·Storage·정책·권한·함수·기본 권한 원본 일치.';
end;
$rollback_check$;

select 'SHOP_PRODUCTS_ROLLBACK_OK' as result;
