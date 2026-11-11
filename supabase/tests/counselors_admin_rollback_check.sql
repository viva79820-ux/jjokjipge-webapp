-- COUNSELORS_ADMIN_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 실행 결과나 임시 baseline은 이 파일에 저장하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.counselors_admin_snapshot()
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
  empty_literal text := quote_literal('');
begin
  foreach table_name in array array['counselors', 'consult_products', 'reservations', 'profiles']
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
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.oid::text), ' || empty_literal || '))) from ('
      || 'select c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relowner '
      || 'from pg_class c where c.oid = '
      || quote_literal('public.' || table_name) || '::regclass) s'
    into component;
    state := state || jsonb_build_object(table_name || '_table', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.attnum), ' || empty_literal || '))) from ('
      || 'select a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as data_type, '
      || 'a.attnotnull, a.attidentity, a.attgenerated, a.attcollation, '
      || 'pg_get_expr(d.adbin, d.adrelid) as default_expression '
      || 'from pg_attribute a '
      || 'left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s'
    into component;
    state := state || jsonb_build_object(table_name || '_columns', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.conname), ' || empty_literal || '))) from ('
      || 'select c.conname, c.contype, c.condeferrable, c.condeferred, c.convalidated, '
      || 'pg_get_constraintdef(c.oid, true) as definition '
      || 'from pg_constraint c where c.conrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s'
    into component;
    state := state || jsonb_build_object(table_name || '_constraints', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.indexname), ' || empty_literal || '))) from ('
      || 'select i.indexname, i.indexdef from pg_indexes i '
      || 'where i.schemaname = ' || quote_literal('public')
      || ' and i.tablename = ' || quote_literal(table_name) || ') s'
    into component;
    state := state || jsonb_build_object(table_name || '_indexes', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.policyname), ' || empty_literal || '))) from ('
      || 'select p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check '
      || 'from pg_policies p where p.schemaname = ' || quote_literal('public')
      || ' and p.tablename = ' || quote_literal(table_name) || ') s'
    into component;
    state := state || jsonb_build_object(table_name || '_policies', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.grantee::text, s.grantor::text, s.privilege_type, s.is_grantable::text), '
      || empty_literal || '))) from ('
      || 'select x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_class c cross join lateral aclexplode(c.relacl) x '
      || 'where c.oid = ' || quote_literal('public.' || table_name) || '::regclass) s'
    into component;
    state := state || jsonb_build_object(table_name || '_table_grants', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.attnum, s.grantee::text, s.grantor::text, s.privilege_type, s.is_grantable::text), '
      || empty_literal || '))) from ('
      || 'select a.attnum, a.attname, x.grantor, x.grantee, x.privilege_type, x.is_grantable '
      || 'from pg_attribute a cross join lateral aclexplode(a.attacl) x '
      || 'where a.attrelid = ' || quote_literal('public.' || table_name) || '::regclass '
      || 'and a.attnum > 0 and not a.attisdropped) s'
    into component;
    state := state || jsonb_build_object(table_name || '_column_grants', component);

    execute
      'select jsonb_build_object('
      || quote_literal('count') || ', count(*), '
      || quote_literal('hash') || ', md5(coalesce(string_agg(md5(to_jsonb(s)::text), '
      || empty_literal || ' order by s.tgname), ' || empty_literal || '))) from ('
      || 'select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid, true) as definition '
      || 'from pg_trigger t where not t.tgisinternal and t.tgrelid = '
      || quote_literal('public.' || table_name) || '::regclass) s'
    into component;
    state := state || jsonb_build_object(table_name || '_triggers', component);
  end loop;

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(pg_get_functiondef(p.oid)),
      '' order by p.proname, pg_get_function_identity_arguments(p.oid)
    ), ''))
  )
  into component
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private';
  state := state || jsonb_build_object('private_functions', component);
  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

do $$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
  remaining_test_rows bigint;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'counselors-admin-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.reservations') is null
    or to_regclass('public.profiles') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: 기존 테이블 없음';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attname = 'fields'
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: public.counselors.fields 잔존';
  end if;
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attname = 'careers'
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: public.counselors.careers 잔존';
  end if;
  if to_regprocedure('private.counselor_fields_valid(text[],text)') is not null
    or to_regprocedure('private.counselor_careers_valid(text[])') is not null
    or to_regprocedure('private.counselor_image_path_valid(text)') is not null
  then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: 검증 함수 잔존';
  end if;
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and conname in (
        'counselors_fields_check',
        'counselors_careers_check',
        'counselors_image_path_check'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: 새 상담사 제약 잔존';
  end if;

  select count(*)
  into remaining_test_rows
  from (
    select id
    from public.counselors
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
    union all
    select id
    from public.consult_products
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
    union all
    select id
    from public.reservations
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
  ) remaining;
  if remaining_test_rows <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: 검사 행 잔존';
  end if;

  current_state := pg_temp.counselors_admin_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;
  for component in select jsonb_object_keys(baseline->'state') loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'COUNSELORS_ADMIN_ROLLBACK_FAILED: 기존 행·구조·기본값·정책·권한·트리거 불일치: ' || component;
    end if;
  end loop;

  raise notice 'COUNSELORS_ADMIN_ROLLBACK_OK: 새 열·제약·검증 함수·검사 행 없음. 기존 행·구조·기본값·정책·권한·트리거 원본 일치.';
end;
$$;

select 'COUNSELORS_ADMIN_ROLLBACK_OK' as result;
