-- 아직 매장 삭제 FK 마이그레이션을 적용하지 않은 DB에서 전체 실행한다.
-- SQLSTATE P0001과 STORES_DELETE_PREFLIGHT_OK로 끝나는 마지막 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON은 별도로 보관하고 저장소 파일에는 넣지 않는다.
-- 실제 계정·profile·매장·상담사·예약·Storage를 수정하지 않으며 마지막 예외로 전체 롤백한다.
rollback;
begin;

do $prerequisite$
declare
  missing text[] := '{}';
  store_id_attnum smallint;
  store_pk_attnum smallint;
  target_count integer;
  target record;
begin
  if to_regclass('public.stores') is null then
    missing := array_append(missing, 'public.stores');
  end if;
  if to_regclass('public.counselors') is null then
    missing := array_append(missing, 'public.counselors');
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
  if to_regprocedure('private.is_admin()') is null then
    missing := array_append(missing, 'private.is_admin()');
  end if;
  if to_regrole('anon') is null then
    missing := array_append(missing, 'anon');
  end if;
  if to_regrole('authenticated') is null then
    missing := array_append(missing, 'authenticated');
  end if;
  if cardinality(missing) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.stores'::regclass,
      'public.counselors'::regclass,
      'public.profiles'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: 관련 테이블 RLS 비활성';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attname = 'fields'
      and attnotnull
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: 상담사 관리자 스키마가 먼저 필요';
  end if;

  select attnum
  into store_id_attnum
  from pg_attribute
  where attrelid = 'public.counselors'::regclass
    and attname = 'store_id'
    and attnum > 0
    and not attisdropped;

  select attnum
  into store_pk_attnum
  from pg_attribute
  where attrelid = 'public.stores'::regclass
    and attname = 'id'
    and attnum > 0
    and not attisdropped;

  select count(*)
  into target_count
  from pg_constraint
  where conrelid = 'public.counselors'::regclass
    and contype = 'f'
    and conkey = array[store_id_attnum]::smallint[];

  if target_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: counselors.store_id FK가 1개여야 하지만 %s개입니다.',
        target_count
      );
  end if;

  select
    c.oid,
    c.conname,
    c.confrelid,
    c.confkey,
    c.confupdtype,
    c.confdeltype,
    c.confmatchtype,
    c.condeferrable,
    c.condeferred,
    c.convalidated
  into target
  from pg_constraint c
  where c.conrelid = 'public.counselors'::regclass
    and c.contype = 'f'
    and c.conkey = array[store_id_attnum]::smallint[];

  if store_id_attnum is null
    or store_pk_attnum is null
    or target.conname <> 'counselors_store_id_fkey'
    or target.confrelid <> 'public.stores'::regclass
    or target.confkey <> array[store_pk_attnum]::smallint[]
    or target.confupdtype <> 'a'
    or target.confdeltype <> 'n'
    or target.confmatchtype <> 's'
    or target.condeferrable
    or target.condeferred
    or not target.convalidated
    or (
      select attnotnull
      from pg_attribute
      where attrelid = 'public.counselors'::regclass
        and attnum = store_id_attnum
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: counselors_store_id_fkey가 예상한 NULL 허용·SET NULL 구조가 아닙니다.',
      detail = case when target.oid is null then null else pg_get_constraintdef(target.oid, true) end;
  end if;
end;
$prerequisite$;

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

create temporary table stores_delete_test_ids (
  kind text primary key,
  id uuid unique not null,
  slug text unique
);
insert into stores_delete_test_ids (kind, id, slug) values
  ('empty_store', 'ffffffff-ffff-4fff-8fff-ffffffffd001', 'test-sd-empty'),
  ('linked_store', 'ffffffff-ffff-4fff-8fff-ffffffffd002', 'test-sd-linked'),
  ('private_linked_store', 'ffffffff-ffff-4fff-8fff-ffffffffd003', 'test-sd-private-linked'),
  ('move_source_store', 'ffffffff-ffff-4fff-8fff-ffffffffd004', 'test-sd-move-source'),
  ('move_target_store', 'ffffffff-ffff-4fff-8fff-ffffffffd005', 'test-sd-move-target'),
  ('denied_store', 'ffffffff-ffff-4fff-8fff-ffffffffd006', 'test-sd-denied'),
  ('linked_counselor', 'ffffffff-ffff-4fff-8fff-ffffffffd101', 'test-sd-linked-counselor'),
  ('private_counselor', 'ffffffff-ffff-4fff-8fff-ffffffffd102', 'test-sd-private-counselor'),
  ('moving_counselor', 'ffffffff-ffff-4fff-8fff-ffffffffd103', 'test-sd-moving-counselor'),
  ('missing_store', 'ffffffff-ffff-4fff-8fff-ffffffffd099', null);

do $collision$
begin
  if exists (
    select 1
    from public.stores
    where id in (select id from stores_delete_test_ids)
      or slug in (
        select slug
        from stores_delete_test_ids
        where slug is not null
      )
  ) or exists (
    select 1
    from public.counselors
    where id in (select id from stores_delete_test_ids)
      or slug in (
        select slug
        from stores_delete_test_ids
        where slug is not null
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID·slug 충돌';
  end if;
end;
$collision$;

create temporary table stores_delete_actors (
  kind text primary key,
  id uuid not null,
  mode text not null
);
insert into stores_delete_actors (kind, id, mode)
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
  where not exists (
    select 1
    from public.profiles p
    where p.id = c.id
  )
  order by c.id
  limit 1
)
insert into stores_delete_actors (kind, id, mode)
select
  'non_admin',
  coalesce((select id from existing_user), (select id from fallback)),
  case
    when exists (select 1 from existing_user) then 'existing_user'
    else 'profileless'
  end;

do $actor_check$
begin
  if (
    select id from stores_delete_actors where kind = 'non_admin'
  ) = (
    select id from stores_delete_actors where kind = 'admin'
  ) or exists (
    select 1
    from public.profiles p
    join stores_delete_actors a on a.id = p.id
    where a.kind = 'non_admin'
      and p.role = 'admin'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: 비관리자 검사 ID 선택 실패';
  end if;
end;
$actor_check$;

create temporary table stores_delete_baseline as
select jsonb_build_object(
  'format', 'stores-delete-preflight-v1',
  'eligible', true,
  'state', pg_temp.stores_delete_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from stores_delete_test_ids
  ),
  'non_admin_mode', (
    select mode
    from stores_delete_actors
    where kind = 'non_admin'
  )
) as snapshot;

create temporary table stores_delete_results (
  label text not null
);
grant select on stores_delete_test_ids, stores_delete_actors to anon, authenticated;
grant insert on stores_delete_results to anon, authenticated;

create function pg_temp.stores_delete_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'STORES_DELETE_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.stores_delete_results values (label);
end;
$$;

create function pg_temp.stores_delete_expected_error(
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
    insert into pg_temp.stores_delete_results values (label);
    return;
  end;
  raise exception 'STORES_DELETE_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.stores_delete_no_rows(command text, label text)
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
    raise exception 'STORES_DELETE_UNEXPECTED_ROWS: %', label;
  end if;
  insert into pg_temp.stores_delete_results values (label);
end;
$$;

create function pg_temp.stores_delete_assert_stable(
  phase text,
  compare_rows boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  component text;
  before_state jsonb;
  after_state jsonb := pg_temp.stores_delete_snapshot();
begin
  select snapshot->'state'
  into before_state
  from pg_temp.stores_delete_baseline;

  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(before_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(after_state) as key
  ) then
    raise exception 'STORES_DELETE_ASSERT_FAILED: % snapshot 키 불일치', phase;
  end if;

  for component in select jsonb_object_keys(before_state)
  loop
    if component in ('target_fk', 'target_fk_internal_triggers')
      or (
        not compare_rows
        and component in ('stores_rows', 'counselors_rows')
      )
    then
      continue;
    end if;
    perform pg_temp.stores_delete_assert(
      after_state->component = before_state->component,
      phase || ' 기존 상태 보존: ' || component
    );
  end loop;
end;
$$;

grant execute on function pg_temp.stores_delete_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.stores_delete_expected_error(text, text, text) to anon, authenticated;
grant execute on function pg_temp.stores_delete_no_rows(text, text) to anon, authenticated;

-- BEGIN EXACT MIGRATION
-- 연결 상담사가 있는 매장은 삭제하지 못하게 하고, 상담사 소속은 명시적으로 변경하게 한다.
-- 단일 DO 문은 하나의 트랜잭션에서 실행되므로 실패하면 기존 FK와 데이터가 함께 복원된다.
do $stores_delete_restrict$
declare
  target_constraint record;
  store_id_attnum smallint;
  store_pk_attnum smallint;
  matching_count integer;
begin
  if to_regclass('public.counselors') is null
    or to_regclass('public.stores') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: public.counselors 또는 public.stores가 없습니다.';
  end if;

  select attnum
  into store_id_attnum
  from pg_attribute
  where attrelid = 'public.counselors'::regclass
    and attname = 'store_id'
    and attnum > 0
    and not attisdropped;

  select attnum
  into store_pk_attnum
  from pg_attribute
  where attrelid = 'public.stores'::regclass
    and attname = 'id'
    and attnum > 0
    and not attisdropped;

  if store_id_attnum is null or store_pk_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors.store_id 또는 stores.id가 없습니다.';
  end if;

  select count(*)
  into matching_count
  from pg_constraint
  where conrelid = 'public.counselors'::regclass
    and contype = 'f'
    and conkey = array[store_id_attnum]::smallint[];

  if matching_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors.store_id FK가 1개여야 하지만 %s개입니다.',
        matching_count
      );
  end if;

  select
    c.oid,
    c.conname,
    c.confrelid,
    c.confkey,
    c.confupdtype,
    c.confdeltype,
    c.confmatchtype,
    c.condeferrable,
    c.condeferred,
    c.convalidated
  into target_constraint
  from pg_constraint c
  where c.conrelid = 'public.counselors'::regclass
    and c.contype = 'f'
    and c.conkey = array[store_id_attnum]::smallint[];

  if target_constraint.conname <> 'counselors_store_id_fkey'
    or target_constraint.confrelid <> 'public.stores'::regclass
    or target_constraint.confkey <> array[store_pk_attnum]::smallint[]
    or target_constraint.confupdtype <> 'a'
    or target_constraint.confdeltype <> 'n'
    or target_constraint.confmatchtype <> 's'
    or target_constraint.condeferrable
    or target_constraint.condeferred
    or not target_constraint.convalidated
    or (
      select attnotnull
      from pg_attribute
      where attrelid = 'public.counselors'::regclass
        and attnum = store_id_attnum
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors_store_id_fkey가 예상한 NULL 허용·SET NULL 구조가 아닙니다.',
      detail = pg_get_constraintdef(target_constraint.oid, true);
  end if;

  execute format(
    'alter table public.counselors drop constraint %I, add constraint %I foreign key (store_id) references public.stores(id) match simple on update no action on delete restrict not deferrable',
    target_constraint.conname,
    target_constraint.conname
  );

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.counselors'::regclass
      and c.conname = target_constraint.conname
      and c.contype = 'f'
      and c.conkey = array[store_id_attnum]::smallint[]
      and c.confrelid = 'public.stores'::regclass
      and c.confkey = array[store_pk_attnum]::smallint[]
      and c.confupdtype = 'a'
      and c.confdeltype = 'r'
      and c.confmatchtype = 's'
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) or (
    select attnotnull
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attnum = store_id_attnum
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'STORES_DELETE_RESTRICT_POSTCHECK_FAILED: counselors_store_id_fkey가 예상한 RESTRICT 구조로 만들어지지 않았습니다.';
  end if;
end;
$stores_delete_restrict$;
-- END EXACT MIGRATION

select pg_temp.stores_delete_assert(
  (
    select
      target->>'name' = before->>'name'
      and target->>'source_table' = before->>'source_table'
      and target->'source_columns' = before->'source_columns'
      and target->>'target_table' = before->>'target_table'
      and target->'target_columns' = before->'target_columns'
      and target->>'update_action' = before->>'update_action'
      and target->>'match_type' = before->>'match_type'
      and target->'deferrable' = before->'deferrable'
      and target->'deferred' = before->'deferred'
      and target->'validated' = before->'validated'
      and target->'store_id_nullable' = before->'store_id_nullable'
      and before->>'delete_action' = 'n'
      and target->>'delete_action' = 'r'
      and target->>'definition' like '%ON DELETE RESTRICT%'
    from (
      select
        snapshot->'state'->'target_fk' as before,
        pg_temp.stores_delete_snapshot()->'target_fk' as target
      from stores_delete_baseline
    ) definitions
  ),
  'SET NULL에서 RESTRICT만 변경하고 FK 속성·NULL 허용 유지'
);
select pg_temp.stores_delete_assert(
  (
    select (snapshot->'state'->'target_fk_internal_triggers'->>'count')::int
    from stores_delete_baseline
  ) = (
    select (pg_temp.stores_delete_snapshot()->'target_fk_internal_triggers'->>'count')::int
  )
  and (
    select snapshot->'state'->'target_fk_internal_triggers'->>'hash'
    from stores_delete_baseline
  ) is distinct from (
    select pg_temp.stores_delete_snapshot()->'target_fk_internal_triggers'->>'hash'
  ),
  'FK 내부 트리거만 삭제 동작에 맞게 재생성'
);
select pg_temp.stores_delete_assert_stable('FK 변경 직후', true);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from stores_delete_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from stores_delete_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.stores_delete_assert(
  auth.uid() = (select id from stores_delete_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할과 private.is_admin()'
);

insert into public.stores (id, slug, name, is_active)
select id, slug, '테스트 ' || kind, kind <> 'private_linked_store'
from stores_delete_test_ids
where kind like '%_store'
  and kind <> 'missing_store';

insert into public.counselors (
  id,
  slug,
  store_id,
  name,
  field,
  fields,
  is_active,
  approval_status
)
values
  (
    (select id from stores_delete_test_ids where kind = 'linked_counselor'),
    (select slug from stores_delete_test_ids where kind = 'linked_counselor'),
    (select id from stores_delete_test_ids where kind = 'linked_store'),
    '테스트 연결 상담사',
    'tarot',
    array['tarot'],
    true,
    'approved'
  ),
  (
    (select id from stores_delete_test_ids where kind = 'private_counselor'),
    (select slug from stores_delete_test_ids where kind = 'private_counselor'),
    (select id from stores_delete_test_ids where kind = 'private_linked_store'),
    '테스트 비공개 상담사',
    'saju',
    array['saju'],
    false,
    'pending'
  ),
  (
    (select id from stores_delete_test_ids where kind = 'moving_counselor'),
    (select slug from stores_delete_test_ids where kind = 'moving_counselor'),
    (select id from stores_delete_test_ids where kind = 'move_source_store'),
    '테스트 소속 변경 상담사',
    'tarot',
    array['tarot', 'saju'],
    false,
    'rejected'
  );

select pg_temp.stores_delete_assert(
  (
    select count(*) = 6
    from public.stores
    where id in (select id from stores_delete_test_ids)
  )
  and (
    select count(*) = 3
    from public.counselors
    where id in (select id from stores_delete_test_ids)
  ),
  '관리자 비공개 포함 매장·상담사 조회'
);
update public.stores
set name = '테스트 관리자 수정 매장'
where id = (select id from stores_delete_test_ids where kind = 'denied_store');
select pg_temp.stores_delete_assert(
  (
    select name = '테스트 관리자 수정 매장'
    from public.stores
    where id = (select id from stores_delete_test_ids where kind = 'denied_store')
  ),
  '관리자 매장 수정'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.stores_delete_assert(
  auth.uid() is null and not (select private.is_admin()),
  '비로그인 역할 확인'
);
select pg_temp.stores_delete_no_rows(
  format(
    'delete from public.stores where id = %L',
    (select id from stores_delete_test_ids where kind = 'denied_store')
  ),
  '비로그인 매장 DELETE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from stores_delete_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from stores_delete_actors where kind = 'non_admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.stores_delete_assert(
  auth.uid() = (select id from stores_delete_actors where kind = 'non_admin')
  and not (select private.is_admin()),
  '비관리자 인증 역할 확인'
);
select pg_temp.stores_delete_no_rows(
  format(
    'delete from public.stores where id = %L',
    (select id from stores_delete_test_ids where kind = 'denied_store')
  ),
  '비관리자 인증 역할 매장 DELETE 차단'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from stores_delete_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from stores_delete_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);

with removed as (
  delete from public.stores
  where id = (select id from stores_delete_test_ids where kind = 'empty_store')
  returning id
)
select pg_temp.stores_delete_assert(
  (select count(*) = 1 from removed),
  '연결 상담사가 없는 매장 삭제'
);

select pg_temp.stores_delete_expected_error(
  format(
    'delete from public.stores where id = %L',
    (select id from stores_delete_test_ids where kind = 'linked_store')
  ),
  '23001',
  '연결 상담사가 있는 매장 삭제 FK 거부'
);
select pg_temp.stores_delete_assert(
  exists (
    select 1
    from public.stores
    where id = (select id from stores_delete_test_ids where kind = 'linked_store')
  )
  and (
    select store_id = (
      select id from stores_delete_test_ids where kind = 'linked_store'
    )
    from public.counselors
    where id = (select id from stores_delete_test_ids where kind = 'linked_counselor')
  ),
  '삭제 거부 후 매장·상담사·store_id 유지'
);

select pg_temp.stores_delete_expected_error(
  format(
    'delete from public.stores where id = %L',
    (select id from stores_delete_test_ids where kind = 'private_linked_store')
  ),
  '23001',
  '비공개·승인대기 상담사가 연결된 매장 삭제 FK 거부'
);
select pg_temp.stores_delete_assert(
  exists (
    select 1
    from public.stores
    where id = (select id from stores_delete_test_ids where kind = 'private_linked_store')
  )
  and (
    select
      not is_active
      and approval_status = 'pending'
      and store_id = (
        select id
        from stores_delete_test_ids
        where kind = 'private_linked_store'
      )
    from public.counselors
    where id = (select id from stores_delete_test_ids where kind = 'private_counselor')
  ),
  '비공개 상담사 연결과 상태 보존'
);

update public.counselors
set store_id = null
where id = (select id from stores_delete_test_ids where kind = 'linked_counselor');
select pg_temp.stores_delete_assert(
  (
    select store_id is null
    from public.counselors
    where id = (select id from stores_delete_test_ids where kind = 'linked_counselor')
  ),
  '상담사 store_id NULL 변경 유지'
);
with removed as (
  delete from public.stores
  where id = (select id from stores_delete_test_ids where kind = 'linked_store')
  returning id
)
select pg_temp.stores_delete_assert(
  (select count(*) = 1 from removed),
  '소속 해제 후 매장 삭제'
);

update public.counselors
set store_id = (
  select id
  from stores_delete_test_ids
  where kind = 'move_target_store'
)
where id = (select id from stores_delete_test_ids where kind = 'moving_counselor');
select pg_temp.stores_delete_assert(
  (
    select store_id = (
      select id
      from stores_delete_test_ids
      where kind = 'move_target_store'
    )
    from public.counselors
    where id = (select id from stores_delete_test_ids where kind = 'moving_counselor')
  ),
  '상담사를 다른 매장으로 소속 변경'
);
with removed as (
  delete from public.stores
  where id = (select id from stores_delete_test_ids where kind = 'move_source_store')
  returning id
)
select pg_temp.stores_delete_assert(
  (select count(*) = 1 from removed),
  '소속 변경으로 비워진 기존 매장 삭제'
);

select pg_temp.stores_delete_expected_error(
  format(
    'update public.counselors set store_id = %L where id = %L',
    (select id from stores_delete_test_ids where kind = 'missing_store'),
    (select id from stores_delete_test_ids where kind = 'private_counselor')
  ),
  '23503',
  '존재하지 않는 매장으로 소속 변경 FK 거부'
);
select pg_temp.stores_delete_assert(
  (
    select store_id = (
      select id
      from stores_delete_test_ids
      where kind = 'private_linked_store'
    )
    from public.counselors
    where id = (select id from stores_delete_test_ids where kind = 'private_counselor')
  ),
  '존재하지 않는 매장 거부 후 기존 소속 유지'
);

update public.counselors
set store_id = null
where id in (
  select id
  from stores_delete_test_ids
  where kind in ('private_counselor', 'moving_counselor')
);
delete from public.stores
where id in (
  select id
  from stores_delete_test_ids
  where kind in (
    'private_linked_store',
    'move_target_store',
    'denied_store'
  )
);
delete from public.counselors
where id in (select id from stores_delete_test_ids);
reset role;

select pg_temp.stores_delete_assert(
  not exists (
    select 1
    from public.stores
    where id in (select id from stores_delete_test_ids)
  )
  and not exists (
    select 1
    from public.counselors
    where id in (select id from stores_delete_test_ids)
  ),
  '검사 매장·상담사 정리'
);
select pg_temp.stores_delete_assert_stable('검사 행 정리 후', true);

do $success$
declare
  total integer;
  baseline jsonb;
  non_admin_description text;
begin
  select count(*) into total from stores_delete_results;
  select snapshot into baseline from stores_delete_baseline;
  select case mode
    when 'existing_user' then '기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    when 'profileless' then '프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)'
  end
  into non_admin_description
  from stores_delete_actors
  where kind = 'non_admin';

  raise exception using
    errcode = 'P0001',
    message = format(
      'STORES_DELETE_PREFLIGHT_OK: 검사 %s개 통과. %s. 한 연결의 역할·RLS·FK 검사이며 실제 다중 연결 경쟁 재현은 아님. RESTRICT FK 정의와 PostgreSQL 무결성 검사가 삭제 직전 연결도 최종 보호함. 실제 Supabase·Storage API·실제 로그인 미검증. 의도된 전체 롤백.',
      total,
      non_admin_description
    ),
    detail = baseline::text;
end;
$success$;
