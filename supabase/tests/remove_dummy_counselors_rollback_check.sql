-- REMOVE_DUMMY_COUNSELORS_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.remove_dummy_counselors_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  target_ids uuid[];
  state jsonb := '{}'::jsonb;
  component jsonb;
begin
  with expected_counselors(slug, name) as (
    values
      ('a', '상담사 A'),
      ('b', '상담사 B'),
      ('c', '상담사 C'),
      ('d', '상담사 D'),
      ('e', '상담사 E'),
      ('f', '상담사 F')
  )
  select coalesce(array_agg(c.id order by c.slug), '{}'::uuid[])
  into target_ids
  from public.counselors c
  join expected_counselors expected
    on expected.slug = c.slug
    and expected.name = c.name;

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(c)::text), '' order by c.id::text), ''))
  )
  into component
  from public.counselors c;
  state := state || jsonb_build_object('counselors_rows', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  )
  into component
  from public.consult_products p;
  state := state || jsonb_build_object('consult_products_rows', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(r)::text), '' order by r.id::text), ''))
  )
  into component
  from public.reservations r;
  state := state || jsonb_build_object('reservations_rows', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(c)::text), '' order by c.id::text), ''))
  )
  into component
  from public.counselors c
  where c.id = any (target_ids);
  state := state || jsonb_build_object('target_counselors', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  )
  into component
  from public.consult_products p
  where p.counselor_id = any (target_ids);
  state := state || jsonb_build_object('target_products', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(c)::text), '' order by c.id::text), ''))
  )
  into component
  from public.counselors c
  where not (c.id = any (target_ids));
  state := state || jsonb_build_object('other_counselors', component);

  select jsonb_build_object(
    'count',
    count(*),
    'hash',
    md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  )
  into component
  from public.consult_products p
  where not (p.counselor_id = any (target_ids));
  state := state || jsonb_build_object('other_products', component);

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
    or baseline->>'format' is distinct from 'remove-dummy-counselors-preflight-v1'
    or baseline->'eligible' is distinct from 'true'::jsonb
    or jsonb_typeof(baseline->'state') is distinct from 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.reservations') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_FAILED: 기존 테이블이 없습니다.';
  end if;

  if (baseline->'state'->'target_counselors'->>'count')::integer <> 6
    or (baseline->'state'->'target_products'->>'count')::integer <> 12
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_FAILED: baseline 삭제 대상이 상담사 6명·상품 12개가 아닙니다.';
  end if;

  current_state := pg_temp.remove_dummy_counselors_snapshot();

  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_FAILED: baseline 상태 키가 일치하지 않습니다.';
  end if;

  for component in select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_FAILED: 기존 행 원본 불일치: ' || component;
    end if;
  end loop;

  raise notice 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_OK: 더미 상담사 6명·시드 상담상품 12개와 실제 상담사를 포함한 비대상 행·예약 원본 일치.';
end;
$rollback_check$;

select 'REMOVE_DUMMY_COUNSELORS_ROLLBACK_OK' as result;
