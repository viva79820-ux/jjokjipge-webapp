-- 이미 예약 스키마가 적용됐고 fields·careers는 아직 없는 DB에서 전체 실행한다.
-- SQLSTATE P0001과 COUNSELORS_ADMIN_PREFLIGHT_OK로 끝나는 마지막 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 보관한 뒤 counselors_admin_rollback_check.sql에 입력한다.
-- COMMIT하지 않으며 실제 상담사·사용자·profiles·Storage는 변경하지 않는다.
-- 다른 작업이 없는 새 SQL Editor에서 파일 전체를 실행한다.
rollback;
begin;

do $$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.counselors') is null then
    missing := array_append(missing, 'public.counselors');
  elsif exists (
    select 1
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attname in ('fields', 'careers')
      and not attisdropped
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_ALREADY_APPLIED: counselors.fields 또는 careers';
  end if;

  if to_regclass('public.consult_products') is null then
    missing := array_append(missing, 'public.consult_products');
  end if;
  if to_regclass('public.reservations') is null then
    missing := array_append(missing, 'public.reservations');
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
  end if;
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
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select bool_and(c.relrowsecurity)
    from pg_class c
    where c.oid = any (array[
      'public.counselors'::regclass,
      'public.consult_products'::regclass,
      'public.reservations'::regclass,
      'public.profiles'::regclass
    ])
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: RLS 비활성';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.counselors'::regclass
      and tgname = 'counselors_set_updated_at'
      and not tgisinternal
      and tgenabled = 'O'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: counselors updated_at 트리거 필요';
  end if;

  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요';
  end if;
end;
$$;

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

create function pg_temp.counselors_admin_column_hash(target regclass, ignore_default_names text[])
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.attnum), ''))
  from (
    select
      a.attnum,
      a.attname,
      format_type(a.atttypid, a.atttypmod) as data_type,
      a.attnotnull,
      a.attidentity,
      a.attgenerated,
      a.attcollation,
      case
        when a.attname = any (ignore_default_names) then null
        else pg_get_expr(d.adbin, d.adrelid)
      end as default_expression
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid
      and d.adnum = a.attnum
    where a.attrelid = target
      and a.attnum > 0
      and not a.attisdropped
      and a.attname <> all (array['fields', 'careers']::text[])
  ) s;
$$;

create function pg_temp.counselors_admin_constraint_hash(target regclass)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(string_agg(md5(to_jsonb(s)::text), '' order by s.conname), ''))
  from (
    select
      c.conname,
      c.contype,
      c.condeferrable,
      c.condeferred,
      c.convalidated,
      pg_get_constraintdef(c.oid, true) as definition
    from pg_constraint c
    where c.conrelid = target
      and c.conname <> all (array[
        'counselors_fields_check',
        'counselors_careers_check',
        'counselors_image_path_check'
      ]::text[])
      and not exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
          and a.attnum = key.attnum
        where a.attname in ('fields', 'careers')
      )
  ) s;
$$;

create function pg_temp.counselors_admin_private_function_hash()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(coalesce(string_agg(
    md5(pg_get_functiondef(p.oid)),
    '' order by p.proname, pg_get_function_identity_arguments(p.oid)
  ), ''))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname <> all (array[
      'counselor_fields_valid',
      'counselor_careers_valid',
      'counselor_image_path_valid'
    ]::text[]);
$$;

create temporary table counselors_admin_test_ids (
  kind text primary key,
  id uuid unique not null
);
insert into counselors_admin_test_ids (kind, id) values
  ('public', 'ffffffff-ffff-4fff-8fff-ffffffffc001'),
  ('default_private', 'ffffffff-ffff-4fff-8fff-ffffffffc002'),
  ('pending', 'ffffffff-ffff-4fff-8fff-ffffffffc003'),
  ('careers', 'ffffffff-ffff-4fff-8fff-ffffffffc004'),
  ('image', 'ffffffff-ffff-4fff-8fff-ffffffffc005'),
  ('product_public', 'ffffffff-ffff-4fff-8fff-ffffffffc010'),
  ('product_inactive', 'ffffffff-ffff-4fff-8fff-ffffffffc011'),
  ('product_private_counselor', 'ffffffff-ffff-4fff-8fff-ffffffffc012'),
  ('product_default', 'ffffffff-ffff-4fff-8fff-ffffffffc013'),
  ('denied_counselor', 'ffffffff-ffff-4fff-8fff-ffffffffc020'),
  ('denied_product', 'ffffffff-ffff-4fff-8fff-ffffffffc021');

do $$
begin
  if exists (
    select 1
    from public.counselors
    where id in (select id from counselors_admin_test_ids)
      or slug = any (array[
        'test-ca-public',
        'test-ca-default',
        'test-ca-pending',
        'test-ca-careers',
        'test-ca-image',
        'test-ca-invalid'
      ])
  ) or exists (
    select 1
    from public.consult_products
    where id in (select id from counselors_admin_test_ids)
  ) or exists (
    select 1
    from public.reservations
    where id in (select id from counselors_admin_test_ids)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: 검사 UUID·slug 충돌';
  end if;
end;
$$;

create temporary table counselors_admin_actors (
  kind text primary key,
  id uuid not null,
  mode text not null
);
insert into counselors_admin_actors (kind, id, mode)
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
insert into counselors_admin_actors (kind, id, mode)
select
  'non_admin',
  coalesce((select id from existing_user), (select id from fallback)),
  case
    when exists (select 1 from existing_user) then 'existing_user'
    else 'profileless'
  end;

do $$
begin
  if (
    select id from counselors_admin_actors where kind = 'non_admin'
  ) = (
    select id from counselors_admin_actors where kind = 'admin'
  ) or exists (
    select 1
    from public.profiles p
    join counselors_admin_actors a on a.id = p.id
    where a.kind = 'non_admin'
      and p.role = 'admin'
  ) or exists (
    select 1
    from counselors_admin_actors a
    where a.kind = 'non_admin'
      and (
        (
          a.mode = 'existing_user'
          and not exists (
            select 1
            from public.profiles p
            where p.id = a.id
              and p.role = 'user'
          )
        )
        or (
          a.mode = 'profileless'
          and exists (
            select 1
            from public.profiles p
            where p.id = a.id
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: 비관리자 검사 ID 선택 실패';
  end if;
end;
$$;

create temporary table counselors_admin_original_counselors as
select
  id,
  slug,
  store_id,
  name,
  field,
  tags,
  intro,
  description,
  image_path,
  is_recommended,
  is_new,
  affiliation,
  approval_status,
  expert_url,
  sort_order,
  is_active,
  created_at,
  updated_at
from public.counselors;

create temporary table counselors_admin_markers (
  label text primary key,
  value text not null
);
insert into counselors_admin_markers (label, value) values
  (
    'counselor_columns',
    pg_temp.counselors_admin_column_hash('public.counselors'::regclass, array['is_active'])
  ),
  (
    'product_columns',
    pg_temp.counselors_admin_column_hash('public.consult_products'::regclass, array['is_active'])
  ),
  (
    'counselor_constraints',
    pg_temp.counselors_admin_constraint_hash('public.counselors'::regclass)
  ),
  ('private_functions', pg_temp.counselors_admin_private_function_hash());

create temporary table counselors_admin_baseline as
select jsonb_build_object(
  'format', 'counselors-admin-preflight-v1',
  'eligible', true,
  'state', pg_temp.counselors_admin_snapshot(),
  'test_ids', (
    select jsonb_agg(id::text order by id::text)
    from counselors_admin_test_ids
  ),
  'non_admin_mode', (
    select mode
    from counselors_admin_actors
    where kind = 'non_admin'
  )
) as snapshot;

create temporary table counselors_admin_results (
  label text not null
);
grant select on counselors_admin_test_ids, counselors_admin_actors to anon, authenticated;
grant insert on counselors_admin_results to anon, authenticated;

create function pg_temp.counselors_admin_assert(ok boolean, label text)
returns void
language plpgsql
security invoker
as $$
begin
  if ok is distinct from true then
    raise exception 'COUNSELORS_ADMIN_ASSERT_FAILED: %', label;
  end if;
  insert into pg_temp.counselors_admin_results values (label);
end;
$$;

create function pg_temp.counselors_admin_denied(command text, expected_state text, label text)
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
    insert into pg_temp.counselors_admin_results values (label);
    return;
  end;
  raise exception 'COUNSELORS_ADMIN_EXPECTED_ERROR_MISSING: %', label;
end;
$$;

create function pg_temp.counselors_admin_no_rows(command text, label text)
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
    raise exception 'COUNSELORS_ADMIN_UNEXPECTED_ROWS: %', label;
  end if;
  insert into pg_temp.counselors_admin_results values (label);
end;
$$;

create function pg_temp.counselors_admin_assert_stable(phase text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  component text;
  before_state jsonb;
  after_state jsonb := pg_temp.counselors_admin_snapshot();
  changed text[] := array[
    'counselors_rows',
    'counselors_columns',
    'counselors_constraints',
    'consult_products_columns',
    'private_functions'
  ];
begin
  select snapshot->'state' into before_state from pg_temp.counselors_admin_baseline;
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(before_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(after_state) as key
  ) then
    raise exception 'COUNSELORS_ADMIN_ASSERT_FAILED: % snapshot 키 불일치', phase;
  end if;
  foreach component in array changed loop
    if not (before_state ? component) then
      raise exception 'COUNSELORS_ADMIN_ASSERT_FAILED: % 비교 키 없음 %', phase, component;
    end if;
  end loop;
  for component in select jsonb_object_keys(before_state) loop
    if component = any (changed) then
      continue;
    end if;
    perform pg_temp.counselors_admin_assert(
      after_state->component = before_state->component,
      phase || ' 기존 상태 보존: ' || component
    );
  end loop;
end;
$$;

grant execute on function pg_temp.counselors_admin_assert(boolean, text) to anon, authenticated;
grant execute on function pg_temp.counselors_admin_denied(text, text, text) to anon, authenticated;
grant execute on function pg_temp.counselors_admin_no_rows(text, text) to anon, authenticated;

-- BEGIN EXACT MIGRATION
-- 상담사 전체 분야·경력 목록·이미지 경로 형식과 신규 상담사·상품의 기본 비공개를 준비한다.
-- 실제 상담사, 사진, 상품, 계정은 등록하지 않는다. 기존 행의 값과 예약 기록은 유지한다.

create function private.counselor_fields_valid(candidate_fields text[], representative_field text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  -- CASE는 필요한 분기만 평가한다. 다차원 배열의 array_position은 예외를 던지므로 차원 검사를 먼저 한다.
  select coalesce(
    case
      when candidate_fields is null or representative_field is null then false
      when pg_catalog.cardinality(candidate_fields) not between 1 and 2 then false
      when pg_catalog.array_ndims(candidate_fields) is distinct from 1 then false
      when pg_catalog.array_lower(candidate_fields, 1) is distinct from 1 then false
      else
        pg_catalog.array_position(candidate_fields, null::text) is null
        and candidate_fields <@ array['tarot', 'saju']::text[]
        and representative_field = any (candidate_fields)
        and (
          select pg_catalog.count(*) = pg_catalog.count(distinct item)
          from pg_catalog.unnest(candidate_fields) as item
        )
    end,
    false
  );
$$;

create function private.counselor_careers_valid(candidate_careers text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  -- 빈 배열은 차원·시작 인덱스가 없다. 다차원 배열은 원소 검색 전에 거부한다.
  select coalesce(
    case
      when candidate_careers is null then false
      when pg_catalog.cardinality(candidate_careers) > 20 then false
      when pg_catalog.cardinality(candidate_careers) = 0 then true
      when pg_catalog.array_ndims(candidate_careers) is distinct from 1 then false
      when pg_catalog.array_lower(candidate_careers, 1) is distinct from 1 then false
      when pg_catalog.array_position(candidate_careers, null::text) is not null then false
      else not exists (
        select 1
        from pg_catalog.unnest(candidate_careers) as item
        where item is null
          or item !~ '[^[:space:]]'
          or pg_catalog.char_length(item) > 200
      )
    end,
    false
  );
$$;

create function private.counselor_image_path_valid(candidate_path text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    candidate_path is null
    or candidate_path ~ '^counselors/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$',
    false
  );
$$;

revoke all on function private.counselor_fields_valid(text[], text) from public, anon, authenticated, service_role;
revoke all on function private.counselor_careers_valid(text[]) from public, anon, authenticated, service_role;
revoke all on function private.counselor_image_path_valid(text) from public, anon, authenticated, service_role;
grant execute on function private.counselor_fields_valid(text[], text) to anon, authenticated;
grant execute on function private.counselor_careers_valid(text[]) to anon, authenticated;
grant execute on function private.counselor_image_path_valid(text) to anon, authenticated;

-- 기존 값이 규칙과 다르면 변환하지 않고 중단한다. 이후 CHECK와 같은 함수를 쓴다.
do $image_path$
begin
  if exists (
    select 1
    from public.counselors
    where not private.counselor_image_path_valid(image_path)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'COUNSELORS_IMAGE_PATH_INVALID: 기존 counselors.image_path가 허용 형식과 맞지 않아 중단합니다.';
  end if;
end;
$image_path$;

alter table public.counselors
  add column fields text[],
  add column careers text[] not null default '{}';

-- 기존 updated_at 트리거는 끄지 않는다. 이 이관 UPDATE로 updated_at이 갱신될 수 있다.
update public.counselors
set fields = array[field];

alter table public.counselors
  alter column fields set not null;

alter table public.counselors
  add constraint counselors_fields_check
    check (private.counselor_fields_valid(fields, field)),
  add constraint counselors_careers_check
    check (private.counselor_careers_valid(careers)),
  add constraint counselors_image_path_check
    check (private.counselor_image_path_valid(image_path));

alter table public.counselors
  alter column is_active set default false;

alter table public.consult_products
  alter column is_active set default false;
-- END EXACT MIGRATION

create function pg_temp.counselors_admin_originals_ok()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.counselors c
      where c.id in (select o.id from pg_temp.counselors_admin_original_counselors o)
    ) = (select count(*) from pg_temp.counselors_admin_original_counselors)
    and coalesce((
      select bool_and(
        c.slug is not distinct from o.slug
        and c.store_id is not distinct from o.store_id
        and c.name is not distinct from o.name
        and c.field is not distinct from o.field
        and c.tags is not distinct from o.tags
        and c.intro is not distinct from o.intro
        and c.description is not distinct from o.description
        and c.image_path is not distinct from o.image_path
        and c.is_recommended is not distinct from o.is_recommended
        and c.is_new is not distinct from o.is_new
        and c.affiliation is not distinct from o.affiliation
        and c.approval_status is not distinct from o.approval_status
        and c.expert_url is not distinct from o.expert_url
        and c.sort_order is not distinct from o.sort_order
        and c.is_active is not distinct from o.is_active
        and c.created_at is not distinct from o.created_at
        and c.fields = array[c.field]::text[]
        and c.careers = '{}'::text[]
      )
      from pg_temp.counselors_admin_original_counselors o
      join public.counselors c on c.id = o.id
    ), true);
$$;

select pg_temp.counselors_admin_assert(
  pg_temp.counselors_admin_originals_ok(),
  '기존 상담사 값 유지와 fields=ARRAY[field], careers 빈 배열'
);
select pg_temp.counselors_admin_assert(
  (
    select value
    from counselors_admin_markers
    where label = 'counselor_columns'
  ) = pg_temp.counselors_admin_column_hash('public.counselors'::regclass, array['is_active']),
  '상담사 기존 열 정의 유지'
);
select pg_temp.counselors_admin_assert(
  (
    select value
    from counselors_admin_markers
    where label = 'product_columns'
  ) = pg_temp.counselors_admin_column_hash('public.consult_products'::regclass, array['is_active']),
  '상품 기존 열 정의 유지'
);
select pg_temp.counselors_admin_assert(
  (
    select value
    from counselors_admin_markers
    where label = 'counselor_constraints'
  ) = pg_temp.counselors_admin_constraint_hash('public.counselors'::regclass),
  '상담사 기존 제약 유지'
);
select pg_temp.counselors_admin_assert(
  (
    select value
    from counselors_admin_markers
    where label = 'private_functions'
  ) = pg_temp.counselors_admin_private_function_hash(),
  '기존 private 함수 유지'
);
select pg_temp.counselors_admin_assert(
  (
    select (snapshot->'state'->'private_functions'->>'count')::int + 3
    from counselors_admin_baseline
  ) = (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  )
  and (
    select (snapshot->'state'->'counselors_columns'->>'count')::int + 2
    from counselors_admin_baseline
  ) = (
    select count(*)::int
    from pg_attribute
    where attrelid = 'public.counselors'::regclass
      and attnum > 0
      and not attisdropped
  )
  and (
    select (snapshot->'state'->'counselors_constraints'->>'count')::int
    from counselors_admin_baseline
  ) = (
    select count(*)::int
    from pg_constraint c
    where c.conrelid = 'public.counselors'::regclass
      and c.conname not in (
        'counselors_fields_check',
        'counselors_careers_check',
        'counselors_image_path_check'
      )
      and not (
        c.contype = 'n'
        and exists (
          select 1
          from unnest(c.conkey) as key(attnum)
          join pg_attribute a
            on a.attrelid = c.conrelid
            and a.attnum = key.attnum
          where a.attname in ('fields', 'careers')
        )
      )
  )
  and (
    select count(*)::int
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and conname in (
        'counselors_fields_check',
        'counselors_careers_check',
        'counselors_image_path_check'
      )
  ) = 3,
  '검증 함수 3개와 fields·careers만 추가'
);

create function pg_temp.counselors_admin_default_expression(target regclass, column_name text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_get_expr(d.adbin, d.adrelid)
  from pg_attribute a
  left join pg_attrdef d
    on d.adrelid = a.attrelid
    and d.adnum = a.attnum
  where a.attrelid = target
    and a.attname = column_name
    and a.attnum > 0
    and not a.attisdropped;
$$;

select pg_temp.counselors_admin_assert(
  (
    select
      format_type(a.atttypid, a.atttypmod) = 'text[]'
      and a.attnotnull
      and not a.atthasdef
    from pg_attribute a
    where a.attrelid = 'public.counselors'::regclass
      and a.attname = 'fields'
      and not a.attisdropped
  ),
  'fields text[] NOT NULL이고 기본값 없음'
);
select pg_temp.counselors_admin_assert(
  (
    select
      format_type(a.atttypid, a.atttypmod) = 'text[]'
      and a.attnotnull
      and pg_get_expr(d.adbin, d.adrelid) = '''{}''::text[]'
    from pg_attribute a
    join pg_attrdef d
      on d.adrelid = a.attrelid
      and d.adnum = a.attnum
    where a.attrelid = 'public.counselors'::regclass
      and a.attname = 'careers'
      and not a.attisdropped
  ),
  'careers text[] NOT NULL default 빈 배열'
);
select pg_temp.counselors_admin_assert(
  pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'is_active') = 'false'
  and pg_temp.counselors_admin_default_expression('public.consult_products'::regclass, 'is_active') = 'false',
  '신규 상담사·상품 is_active 기본값 false'
);
select pg_temp.counselors_admin_assert(
  pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'field') is null
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'is_recommended') = 'false'
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'is_new') = 'false'
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'affiliation') = '''store''::text'
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'approval_status') = '''approved''::text'
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'sort_order') = '0'
  and pg_temp.counselors_admin_default_expression('public.counselors'::regclass, 'tags') = '''{}''::text[]'
  and pg_temp.counselors_admin_default_expression('public.consult_products'::regclass, 'sort_order') = '0',
  '대표 분야·추천·신규·소속·승인·정렬·tags 기본값 유지'
);
select pg_temp.counselors_admin_assert(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid, true) like '%field = ANY%'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and conname = 'counselors_fields_check'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and conname = 'counselors_careers_check'
  )
  and exists (
    select 1
    from pg_constraint
    where conrelid = 'public.counselors'::regclass
      and conname = 'counselors_image_path_check'
  ),
  '기존 field CHECK와 새 fields·careers·image_path CHECK'
);
select pg_temp.counselors_admin_assert(
  (
    select
      bool_and(
        p.prosecdef = false
        and p.provolatile = 'i'
        and p.proconfig = array['search_path=""']::text[]
      )
      and count(*) = 3
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'counselor_fields_valid',
        'counselor_careers_valid',
        'counselor_image_path_valid'
      )
  ),
  '검증 함수는 SECURITY INVOKER·IMMUTABLE·search_path 고정'
);
select pg_temp.counselors_admin_assert(
  (
    select
      bool_and(
        has_function_privilege('anon', p.oid, 'execute')
        and has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('service_role', p.oid, 'execute')
        and p.proacl is not null
        and not coalesce((
          select bool_or(a.grantee = 0 and a.privilege_type = 'EXECUTE')
          from aclexplode(p.proacl) a
        ), false)
      )
      and count(*) = 3
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'counselor_fields_valid',
        'counselor_careers_valid',
        'counselor_image_path_valid'
      )
  ),
  '검증 함수 실행 권한은 anon·authenticated만'
);

select pg_temp.counselors_admin_assert_stable('이관 직후');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from counselors_admin_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from counselors_admin_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.counselors_admin_assert(
  auth.uid() = (select id from counselors_admin_actors where kind = 'admin')
  and (select private.is_admin()),
  '관리자 인증 역할 auth.uid()와 private.is_admin()'
);

insert into public.counselors (id, slug, name, field, fields, is_active, approval_status)
values (
  (select id from counselors_admin_test_ids where kind = 'public'),
  'test-ca-public',
  '테스트 공개 상담사',
  'tarot',
  array['tarot', 'saju'],
  true,
  'approved'
);
insert into public.counselors (id, slug, name, field, fields)
values (
  (select id from counselors_admin_test_ids where kind = 'default_private'),
  'test-ca-default',
  '테스트 기본 비공개 상담사',
  'tarot',
  array['tarot']
);
insert into public.counselors (id, slug, name, field, fields, is_active, approval_status)
values (
  (select id from counselors_admin_test_ids where kind = 'pending'),
  'test-ca-pending',
  '테스트 승인대기 상담사',
  'saju',
  array['saju', 'tarot'],
  true,
  'pending'
);
insert into public.counselors (id, slug, name, field, fields, careers)
select
  (select id from counselors_admin_test_ids where kind = 'careers'),
  'test-ca-careers',
  '테스트 경력 경계 상담사',
  'saju',
  array['saju'],
  array_agg(repeat('가', 200) order by g)
from generate_series(1, 20) as g;
insert into public.counselors (id, slug, name, field, fields)
values (
  (select id from counselors_admin_test_ids where kind = 'image'),
  'test-ca-image',
  '테스트 이미지 상담사',
  'tarot',
  array['tarot']
);

select pg_temp.counselors_admin_assert(
  (
    select
      field = 'tarot'
      and fields = array['tarot', 'saju']::text[]
      and is_active
      and approval_status = 'approved'
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  'field tarot와 fields [tarot,saju] 저장'
);
select pg_temp.counselors_admin_assert(
  (
    select
      not is_active
      and careers = '{}'::text[]
      and approval_status = 'approved'
      and not is_recommended
      and not is_new
      and affiliation = 'store'
      and image_path is null
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'default_private')
  ),
  '신규 상담사 is_active·careers·추천·소속 기본값'
);
select pg_temp.counselors_admin_assert(
  (
    select
      field = 'saju'
      and fields = array['saju', 'tarot']::text[]
      and is_active
      and approval_status = 'pending'
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'pending')
  ),
  'field saju와 fields [saju,tarot] 저장'
);
select pg_temp.counselors_admin_assert(
  (
    select
      cardinality(careers) = 20
      and bool_and(char_length(item) = 200)
    from public.counselors
    cross join lateral unnest(careers) as item
    where id = (select id from counselors_admin_test_ids where kind = 'careers')
    group by id
  ),
  'careers 20개·항목 200자 경계 허용'
);

update public.counselors
set field = 'saju'
where id = (select id from counselors_admin_test_ids where kind = 'public');
select pg_temp.counselors_admin_assert(
  (
    select field = 'saju' and fields = array['tarot', 'saju']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  'fields에 포함된 대표 분야로 변경'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set fields = array[''tarot'']::text[] where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  '대표 분야가 fields에 없으면 거부'
);
select pg_temp.counselors_admin_assert(
  (
    select field = 'saju' and fields = array['tarot', 'saju']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '대표 분야 불포함 거부 후 원본 유지'
);
update public.counselors
set field = 'tarot',
  fields = array['saju', 'tarot']
where id = (select id from counselors_admin_test_ids where kind = 'public');
select pg_temp.counselors_admin_assert(
  (
    select field = 'tarot' and fields = array['saju', 'tarot']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  'fields 순서와 대표 분야 포함을 함께 저장'
);
update public.counselors
set fields = array['tarot', 'saju']
where id = (select id from counselors_admin_test_ids where kind = 'public');

select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 누락', 'tarot')$q$,
  '23502',
  'fields 누락 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 NULL', 'tarot', null)$q$,
  '23502',
  'fields NULL 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 빈 배열', 'tarot', '{}'::text[])$q$,
  '23514',
  'fields 빈 배열 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 중복', 'tarot', array['tarot','tarot'])$q$,
  '23514',
  'fields 중복 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 NULL 원소', 'tarot', array['tarot', null]::text[])$q$,
  '23514',
  'fields NULL 원소 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 잘못된 값', 'tarot', array['fortune'])$q$,
  '23514',
  'fields 허용값 외 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 빈 문자', 'tarot', array[''])$q$,
  '23514',
  'fields 빈 문자 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 다차원', 'tarot', '{{tarot,saju}}'::text[])$q$,
  '23514',
  'fields 다차원 배열 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 분야 시작 인덱스', 'tarot', '[0:1]={tarot,saju}'::text[])$q$,
  '23514',
  'fields 비표준 시작 인덱스 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 대표 분야 불포함', 'tarot', array['saju'])$q$,
  '23514',
  'fields에 대표 분야 불포함 거부'
);
select pg_temp.counselors_admin_denied(
  $q$insert into public.counselors (id, slug, name, field, fields) values ('ffffffff-ffff-4fff-8fff-ffffffffc020', 'test-ca-invalid', '테스트 대표 분야 값', 'fortune', array['fortune'])$q$,
  '23514',
  '기존 field 허용값 유지'
);
select pg_temp.counselors_admin_assert(
  not exists (
    select 1
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'denied_counselor')
      or slug = 'test-ca-invalid'
  ),
  '거부된 fields 입력은 저장되지 않음'
);

update public.counselors
set careers = array['한글 경력 둘', '한글 경력 하나']
where id = (select id from counselors_admin_test_ids where kind = 'public');
select pg_temp.counselors_admin_assert(
  (
    select careers = array['한글 경력 둘', '한글 경력 하나']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  'careers 한글 항목과 입력 순서 유지'
);
update public.counselors
set careers = array[repeat('나', 200)]
where id = (select id from counselors_admin_test_ids where kind = 'default_private');
select pg_temp.counselors_admin_assert(
  (
    select careers = array[repeat('나', 200)]::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'default_private')
  ),
  'careers 한 항목 200자 허용'
);
update public.counselors
set careers = '{}'::text[]
where id = (select id from counselors_admin_test_ids where kind = 'default_private');
select pg_temp.counselors_admin_assert(
  (
    select careers = '{}'::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'default_private')
  ),
  'careers 빈 배열 허용'
);

select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = null where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23502',
  'careers NULL 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = array[%L, '''']::text[] where id = %L',
    '한글 경력',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers 빈 항목 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = array[%L, %L]::text[] where id = %L',
    '한글 경력',
    '   ',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers 공백만 항목 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = array[%L, E''\t\n'']::text[] where id = %L',
    '한글 경력',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers 탭·줄바꿈만 항목 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = array[%L, null]::text[] where id = %L',
    '한글 경력',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers NULL 원소 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = %L::text[] where id = %L',
    '{{한글 경력}}',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers 다차원 배열 거부'
);
select pg_temp.counselors_admin_denied(
  format(
    'update public.counselors set careers = %L::text[] where id = %L',
    '[0:0]={한글 경력}',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '23514',
  'careers 비표준 시작 인덱스 거부'
);
select pg_temp.counselors_admin_denied(
  $q$update public.counselors set careers = (select array_agg(repeat('가', 10) order by g) from generate_series(1, 21) g) where id = 'ffffffff-ffff-4fff-8fff-ffffffffc004'$q$,
  '23514',
  'careers 21개 거부'
);
select pg_temp.counselors_admin_denied(
  $q$update public.counselors set careers = array[repeat('가', 201)] where id = 'ffffffff-ffff-4fff-8fff-ffffffffc004'$q$,
  '23514',
  'careers 201자 거부'
);
select pg_temp.counselors_admin_assert(
  (
    select careers = array['한글 경력 둘', '한글 경력 하나']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  )
  and (
    select cardinality(careers) = 20 and bool_and(char_length(item) = 200)
    from public.counselors
    cross join lateral unnest(careers) as item
    where id = (select id from counselors_admin_test_ids where kind = 'careers')
    group by id
  ),
  '거부된 careers 입력 후 기존 순서·경계값 유지'
);

select pg_temp.counselors_admin_assert(
  (
    select image_path is null
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'image')
  ),
  '이미지 경로 NULL 허용'
);
update public.counselors
set image_path = 'counselors/11111111-1111-4111-8111-111111111111.jpg'
where id = (select id from counselors_admin_test_ids where kind = 'image');
update public.counselors
set image_path = 'counselors/11111111-1111-4111-8111-111111111111.jpeg'
where id = (select id from counselors_admin_test_ids where kind = 'image');
update public.counselors
set image_path = 'counselors/11111111-1111-4111-8111-111111111111.png'
where id = (select id from counselors_admin_test_ids where kind = 'image');
update public.counselors
set image_path = 'counselors/11111111-1111-4111-8111-111111111111.webp'
where id = (select id from counselors_admin_test_ids where kind = 'image');
select pg_temp.counselors_admin_assert(
  (
    select image_path = 'counselors/11111111-1111-4111-8111-111111111111.webp'
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'image')
  ),
  'jpg·jpeg·png·webp 상대 경로 허용'
);
update public.counselors
set image_path = null
where id = (select id from counselors_admin_test_ids where kind = 'image');
select pg_temp.counselors_admin_assert(
  (
    select image_path is null
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'image')
  ),
  '저장된 이미지 경로를 NULL로 비울 수 있음'
);
update public.counselors
set image_path = 'counselors/11111111-1111-4111-8111-111111111111.webp'
where id = (select id from counselors_admin_test_ids where kind = 'image');

do $$
declare
  sample text;
begin
  foreach sample in array array[
    '',
    '   ',
    'https://example.invalid/counselors/11111111-1111-4111-8111-111111111111.jpg',
    'public-images/counselors/11111111-1111-4111-8111-111111111111.jpg',
    'notices/11111111-1111-4111-8111-111111111111.jpg',
    'counselors/../11111111-1111-4111-8111-111111111111.jpg',
    '/counselors/11111111-1111-4111-8111-111111111111.jpg',
    'counselors//11111111-1111-4111-8111-111111111111.jpg',
    'counselors/11111111-1111-4111-8111-111111111111.svg',
    'counselors/11111111-1111-4111-8111-111111111111.JPG',
    'counselors/AAAAAAAA-1111-4111-8111-111111111111.jpg',
    'counselors/11111111-1111-4111-8111-11111111111G.jpg'
  ]
  loop
    perform pg_temp.counselors_admin_denied(
      format(
        'update public.counselors set image_path = %L where id = %L',
        sample,
        'ffffffff-ffff-4fff-8fff-ffffffffc005'
      ),
      '23514',
      '이미지 경로 거부: ' || sample
    );
  end loop;
end;
$$;
select pg_temp.counselors_admin_assert(
  (
    select image_path = 'counselors/11111111-1111-4111-8111-111111111111.webp'
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'image')
  ),
  '거부된 이미지 경로 후 마지막 정상 경로 유지'
);

insert into public.consult_products (id, counselor_id, name, minutes, price, is_active)
values (
  (select id from counselors_admin_test_ids where kind = 'product_public'),
  (select id from counselors_admin_test_ids where kind = 'public'),
  '테스트 공개 상품',
  20,
  10000,
  true
);
insert into public.consult_products (id, counselor_id, name, minutes, price, is_active)
values (
  (select id from counselors_admin_test_ids where kind = 'product_inactive'),
  (select id from counselors_admin_test_ids where kind = 'public'),
  '테스트 비공개 상품',
  30,
  20000,
  false
);
insert into public.consult_products (id, counselor_id, name, minutes, price, is_active)
values (
  (select id from counselors_admin_test_ids where kind = 'product_private_counselor'),
  (select id from counselors_admin_test_ids where kind = 'default_private'),
  '테스트 비공개 상담사 상품',
  20,
  10000,
  true
);
insert into public.consult_products (id, counselor_id, name, minutes, price)
values (
  (select id from counselors_admin_test_ids where kind = 'product_default'),
  (select id from counselors_admin_test_ids where kind = 'public'),
  '테스트 기본 비공개 상품',
  40,
  30000
);
select pg_temp.counselors_admin_assert(
  (
    select not is_active
    from public.consult_products
    where id = (select id from counselors_admin_test_ids where kind = 'product_default')
  ),
  '신규 상품 is_active 생략 시 false'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.counselors_admin_assert(
  auth.uid() is null and not (select private.is_admin()),
  '비로그인 auth.uid() 없음'
);
select pg_temp.counselors_admin_assert(
  (
    select count(*) = 1
    from public.counselors
    where id in (select id from counselors_admin_test_ids)
  )
  and exists (
    select 1
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '비로그인 공개 상담사 조회'
);
select pg_temp.counselors_admin_assert(
  not exists (
    select 1
    from public.counselors
    where id in (
      select id
      from counselors_admin_test_ids
      where kind in ('default_private', 'pending', 'careers', 'image')
    )
  ),
  '비로그인 비공개·승인대기 상담사 미노출'
);
select pg_temp.counselors_admin_assert(
  (
    select count(*) = 1
    from public.consult_products
    where id in (select id from counselors_admin_test_ids)
  )
  and exists (
    select 1
    from public.consult_products
    where id = (select id from counselors_admin_test_ids where kind = 'product_public')
  )
  and not exists (
    select 1
    from public.consult_products
    where id in (
      select id
      from counselors_admin_test_ids
      where kind in ('product_inactive', 'product_private_counselor', 'product_default')
    )
  ),
  '비로그인 상품은 상품·상담사가 모두 공개일 때만 조회'
);
select pg_temp.counselors_admin_denied(
  format(
    'insert into public.counselors (id, slug, name, field, fields) values (%L, ''test-ca-invalid'', ''테스트 비로그인 침범'', ''tarot'', array[''tarot''])',
    (select id from counselors_admin_test_ids where kind = 'denied_counselor')
  ),
  '42501',
  '비로그인 상담사 INSERT 거부'
);
select pg_temp.counselors_admin_no_rows(
  format(
    'update public.counselors set name = ''테스트 비로그인 수정'' where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '비로그인 상담사 UPDATE 0행'
);
select pg_temp.counselors_admin_no_rows(
  format(
    'delete from public.counselors where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '비로그인 상담사 DELETE 0행'
);
select pg_temp.counselors_admin_denied(
  format(
    'insert into public.consult_products (id, counselor_id, name, minutes, price) values (%L, %L, ''테스트 비로그인 상품'', 20, 10000)',
    (select id from counselors_admin_test_ids where kind = 'denied_product'),
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '42501',
  '비로그인 상품 INSERT 거부'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from counselors_admin_actors where kind = 'non_admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from counselors_admin_actors where kind = 'non_admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.counselors_admin_assert(
  auth.uid() = (select id from counselors_admin_actors where kind = 'non_admin'),
  '비관리자 인증 역할 auth.uid() 일치'
);
select pg_temp.counselors_admin_assert(
  not (select private.is_admin()),
  '비관리자 인증 역할 private.is_admin()=false'
);
select pg_temp.counselors_admin_assert(
  (
    select count(*) = 1
    from public.counselors
    where id in (select id from counselors_admin_test_ids)
  ),
  '비관리자 인증 역할 공개 상담사만 조회'
);
select pg_temp.counselors_admin_assert(
  not exists (
    select 1
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'default_private')
  ),
  '비관리자 인증 역할 비공개 상담사 미노출'
);
select pg_temp.counselors_admin_assert(
  (
    select count(*) = 1
    from public.consult_products
    where id in (select id from counselors_admin_test_ids)
  ),
  '비관리자 인증 역할 공개 상품만 조회'
);
select pg_temp.counselors_admin_denied(
  format(
    'insert into public.counselors (id, slug, name, field, fields) values (%L, ''test-ca-invalid'', ''테스트 비관리자 침범'', ''tarot'', array[''tarot''])',
    (select id from counselors_admin_test_ids where kind = 'denied_counselor')
  ),
  '42501',
  '비관리자 인증 역할 상담사 INSERT RLS 거부'
);
select pg_temp.counselors_admin_no_rows(
  format(
    'update public.counselors set name = ''테스트 비관리자 수정'' where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '비관리자 인증 역할 상담사 UPDATE 0행'
);
select pg_temp.counselors_admin_no_rows(
  format(
    'delete from public.counselors where id = %L',
    (select id from counselors_admin_test_ids where kind = 'public')
  ),
  '비관리자 인증 역할 상담사 DELETE 0행'
);
select pg_temp.counselors_admin_no_rows(
  format(
    'update public.consult_products set price = 1 where id = %L',
    (select id from counselors_admin_test_ids where kind = 'product_public')
  ),
  '비관리자 인증 역할 상품 UPDATE 0행'
);
reset role;

select pg_temp.counselors_admin_assert(
  (
    select name = '테스트 공개 상담사' and field = 'tarot' and fields = array['tarot', 'saju']::text[]
    from public.counselors
    where id = (select id from counselors_admin_test_ids where kind = 'public')
  )
  and (
    select price = 10000
    from public.consult_products
    where id = (select id from counselors_admin_test_ids where kind = 'product_public')
  )
  and not exists (
    select 1
    from public.counselors
    where slug = 'test-ca-invalid'
      or id = (select id from counselors_admin_test_ids where kind = 'denied_counselor')
  )
  and not exists (
    select 1
    from public.consult_products
    where id = (select id from counselors_admin_test_ids where kind = 'denied_product')
  ),
  '비로그인·비관리자 쓰기 차단 후 검사 원본 보존'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from counselors_admin_actors where kind = 'admin'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id::text from counselors_admin_actors where kind = 'admin'),
    'role', 'authenticated'
  )::text,
  true
);
select pg_temp.counselors_admin_assert(
  (
    select count(*) = 5
    from public.counselors
    where id in (select id from counselors_admin_test_ids)
  )
  and (
    select count(*) = 4
    from public.consult_products
    where id in (select id from counselors_admin_test_ids)
  ),
  '관리자 비공개 상담사·상품 포함 조회'
);
with removed as (
  delete from public.counselors
  where id = (select id from counselors_admin_test_ids where kind = 'image')
  returning id
)
select pg_temp.counselors_admin_assert(
  (select count(*) = 1 from removed),
  '관리자 상담사 DELETE'
);
with removed as (
  delete from public.counselors
  where id in (select id from counselors_admin_test_ids)
  returning id
)
select pg_temp.counselors_admin_assert(
  (select count(*) = 4 from removed),
  '관리자 검사 상담사 정리'
);
reset role;

select pg_temp.counselors_admin_assert(
  not exists (
    select 1
    from public.counselors
    where id in (select id from counselors_admin_test_ids)
  )
  and not exists (
    select 1
    from public.consult_products
    where id in (select id from counselors_admin_test_ids)
      or name like '테스트 %'
  )
  and pg_temp.counselors_admin_originals_ok(),
  '검사 행 제거 후 기존 상담사·fields 이관 결과 유지'
);
select pg_temp.counselors_admin_assert_stable('정리 후');

do $$
declare
  total integer;
  baseline jsonb;
  non_admin_description text;
begin
  select count(*) into total from counselors_admin_results;
  select snapshot into baseline from counselors_admin_baseline;
  select case mode
    when 'existing_user' then '기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)'
    when 'profileless' then '프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)'
  end
  into non_admin_description
  from counselors_admin_actors
  where kind = 'non_admin';
  raise exception using
    errcode = 'P0001',
    message = format(
      'COUNSELORS_ADMIN_PREFLIGHT_OK: 검사 %s개 통과. %s. SQL 역할·RLS·CHECK 검사 통과, 실제 Storage API·파일 존재·MIME·크기·실제 로그인 미검증. 의도된 전체 롤백.',
      total,
      non_admin_description
    ),
    detail = baseline::text;
end;
$$;
