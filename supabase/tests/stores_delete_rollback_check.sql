-- STORES_DELETE_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 이 수정은 SQL Editor에 붙여 넣은 복사본에서만 하고 실행 결과를 저장소 파일에 저장하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.stores_delete_snapshot()
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
  target_fk_oid oid;
begin
  select c.oid
  into target_fk_oid
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
    and a.attnum = c.conkey[1]
  where c.conrelid = 'public.counselors'::regclass
    and c.contype = 'f'
    and cardinality(c.conkey) = 1
    and a.attname = 'store_id';

  foreach table_name in array array['stores', 'counselors', 'profiles']
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
      || quote_literal('public.' || table_name) || '::regclass '
      || case
        when table_name = 'counselors'
          then 'and c.oid is distinct from ' || coalesce(target_fk_oid::text, 'null')
        else ''
      end || ') s'
    into component;
    state := state || jsonb_build_object(table_name || '_other_constraints', component);

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
    state := state || jsonb_build_object(table_name || '_business_triggers', component);
  end loop;

  select jsonb_build_object(
    'name', c.conname,
    'definition', pg_get_constraintdef(c.oid, true),
    'source_table', c.conrelid::regclass::text,
    'source_columns', c.conkey,
    'target_table', c.confrelid::regclass::text,
    'target_columns', c.confkey,
    'update_action', c.confupdtype,
    'delete_action', c.confdeltype,
    'match_type', c.confmatchtype,
    'deferrable', c.condeferrable,
    'deferred', c.condeferred,
    'validated', c.convalidated,
    'store_id_nullable', not a.attnotnull
  )
  into component
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
    and a.attnum = c.conkey[1]
  where c.oid = target_fk_oid;
  state := state || jsonb_build_object('target_fk', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.relation_name, s.function_name, s.tgtype
    ), ''))
  )
  into component
  from (
    select
      t.tgrelid::regclass::text as relation_name,
      p.proname as function_name,
      t.tgtype,
      t.tgenabled,
      t.tgdeferrable,
      t.tginitdeferred
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgconstraint = target_fk_oid
  ) s;
  state := state || jsonb_build_object('target_fk_internal_triggers', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(s)::text),
      '' order by s.relation_name, s.constraint_name, s.function_name, s.tgtype
    ), ''))
  )
  into component
  from (
    select
      t.tgrelid::regclass::text as relation_name,
      coalesce(c.conname, '') as constraint_name,
      p.proname as function_name,
      t.tgtype,
      t.tgenabled,
      t.tgdeferrable,
      t.tginitdeferred
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    left join pg_constraint c on c.oid = t.tgconstraint
    where t.tgisinternal
      and t.tgconstraint is distinct from target_fk_oid
      and t.tgrelid in (
        'public.stores'::regclass,
        'public.counselors'::regclass,
        'public.profiles'::regclass
      )
  ) s;
  state := state || jsonb_build_object('other_internal_triggers', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(pg_get_functiondef(p.oid) || coalesce(p.proacl::text, '')),
      '' order by p.oid::text
    ), ''))
  )
  into component
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'is_admin'
    and pg_get_function_identity_arguments(p.oid) = '';
  state := state || jsonb_build_object('admin_function', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

do $rollback_check$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
  remaining_test_rows bigint;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'stores-delete-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
    or jsonb_typeof(baseline->'test_ids') is distinct from 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.stores') is null
    or to_regclass('public.counselors') is null
    or to_regclass('public.profiles') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_ROLLBACK_FAILED: 기존 테이블 없음';
  end if;

  if baseline->'state'->'target_fk'->>'delete_action' <> 'n'
    or baseline->'state'->'target_fk'->>'definition' not like '%ON DELETE SET NULL%'
    or baseline->'state'->'target_fk'->'store_id_nullable' is distinct from 'true'::jsonb
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_ROLLBACK_FAILED: baseline의 원래 FK가 NULL 허용·SET NULL 구조가 아님';
  end if;

  select count(*)
  into remaining_test_rows
  from (
    select id
    from public.stores
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
    union all
    select id
    from public.counselors
    where id in (
      select value::uuid
      from jsonb_array_elements_text(baseline->'test_ids')
    )
  ) remaining;
  if remaining_test_rows <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_ROLLBACK_FAILED: 검사 UUID 행 잔존';
  end if;

  current_state := pg_temp.stores_delete_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'STORES_DELETE_ROLLBACK_FAILED: 기존 행·FK·정책·권한·트리거 불일치: ' || component;
    end if;
  end loop;

  raise notice 'STORES_DELETE_ROLLBACK_OK: 검사 UUID 없음. 원래 SET NULL FK와 기존 행·정책·권한·업무 트리거 원본 일치.';
end;
$rollback_check$;

select 'STORES_DELETE_ROLLBACK_OK' as result;
