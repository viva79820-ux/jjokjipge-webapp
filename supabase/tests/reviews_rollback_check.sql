-- REVIEWS_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

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

do $rollback_check$
declare
  baseline jsonb := null; -- 예: $baseline${"format":...}$baseline$::jsonb
  current_state jsonb;
  component text;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'reviews-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.reviews') is not null
    or to_regclass('public.reviews_public_created_idx') is not null
    or to_regclass('public.reviews_admin_created_idx') is not null
    or to_regclass('public.reviews_counselor_id_idx') is not null
    or to_regclass('public.reviews_product_id_idx') is not null
    or exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'reviews'
    )
    or exists (
      select 1
      from pg_trigger
      where tgname = 'reviews_set_updated_at'
        and not tgisinternal
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_ROLLBACK_FAILED: 신규 후기 객체 잔존';
  end if;

  if to_regclass('public.profiles') is null
    or to_regclass('public.counselors') is null
    or to_regclass('public.products') is null
    or to_regclass('public.reservations') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_ROLLBACK_FAILED: 기존 대상 테이블 없음';
  end if;

  current_state := pg_temp.reviews_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REVIEWS_ROLLBACK_FAILED: baseline 상태 키 불일치';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'REVIEWS_ROLLBACK_FAILED: 기존 데이터·카탈로그 불일치: ' || component;
    end if;
  end loop;

  raise notice 'REVIEWS_ROLLBACK_OK: 신규 후기 객체·검사 행 없음. 기존 대상 테이블·인증·카탈로그 원본 일치.';
end;
$rollback_check$;

select 'REVIEWS_ROLLBACK_OK' as result;
