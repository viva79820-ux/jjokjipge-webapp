-- 더미 상담사 삭제 마이그레이션을 적용하기 전 운영 DB의 새 SQL Editor에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 REMOVE_DUMMY_COUNSELORS_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 예약 참조 예외가 나오면 DETAIL의 대상·건수만 보고하고 삭제 마이그레이션을 적용하지 않는다.
rollback;
begin;

do $prerequisite$
begin
  if to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.reservations') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_PREREQUISITE_FAILED: counselors, consult_products, reservations 테이블이 모두 필요합니다.';
  end if;
end;
$prerequisite$;

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

create temporary table remove_dummy_counselors_baseline as
select jsonb_build_object(
  'format',
  'remove-dummy-counselors-preflight-v1',
  'eligible',
  true,
  'state',
  pg_temp.remove_dummy_counselors_snapshot()
) as snapshot;

do $target_check$
declare
  baseline jsonb;
begin
  select snapshot->'state'
  into baseline
  from remove_dummy_counselors_baseline;

  if (baseline->'target_counselors'->>'count')::integer <> 6
    or (baseline->'target_products'->>'count')::integer <> 12
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_TARGET_FAILED: 시드의 slug·이름 6쌍과 연결 상담상품 12개가 모두 필요합니다.',
      detail = jsonb_build_object(
        'target_counselor_count',
        (baseline->'target_counselors'->>'count')::integer,
        'target_product_count',
        (baseline->'target_products'->>'count')::integer
      )::text;
  end if;
end;
$target_check$;

-- BEGIN EXACT MIGRATION
-- 시드의 slug·이름과 상담상품 구성이 모두 일치하는 더미 상담사만 삭제한다.
-- 예약 참조가 있거나 시드 구성이 달라졌으면 어떤 행도 삭제하지 않고 중단한다.
do $remove_dummy_counselors$
declare
  target_ids uuid[];
  matched_counselor_count integer;
  mismatched_counselor_count integer;
  mismatched_product_count integer;
  deleted_counselor_count integer;
  reservation_reference_count bigint;
  reservation_report jsonb;
  before_other_counselors text;
  before_other_products text;
  before_reservations text;
  after_other_counselors text;
  after_other_products text;
  after_reservations text;
begin
  if to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
    or to_regclass('public.reservations') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREREQUISITE_FAILED: counselors, consult_products, reservations 테이블이 모두 필요합니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.consult_products'::regclass
      and conname = 'consult_products_counselor_id_fkey'
      and contype = 'f'
      and confrelid = 'public.counselors'::regclass
      and confdeltype = 'c'
      and convalidated
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_counselor_id_fkey'
      and contype = 'f'
      and confrelid = 'public.counselors'::regclass
      and confdeltype = 'r'
      and convalidated
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_product_id_fkey'
      and contype = 'f'
      and confrelid = 'public.consult_products'::regclass
      and confdeltype = 'r'
      and convalidated
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREREQUISITE_FAILED: 상담사·상담상품·예약 FK가 예상한 CASCADE·RESTRICT 구조가 아닙니다.';
  end if;

  -- 검사 뒤 새 예약이 들어오는 경쟁을 막고, 삭제와 모든 사전 검사를 한 문장 안에서 끝낸다.
  lock table
    public.reservations,
    public.consult_products,
    public.counselors
  in share row exclusive mode;

  with expected_counselors(slug, name) as (
    values
      ('a', '상담사 A'),
      ('b', '상담사 B'),
      ('c', '상담사 C'),
      ('d', '상담사 D'),
      ('e', '상담사 E'),
      ('f', '상담사 F')
  )
  select count(*)
  into mismatched_counselor_count
  from public.counselors c
  where (
    c.slug in (select slug from expected_counselors)
    or c.name in (select name from expected_counselors)
  )
    and not exists (
      select 1
      from expected_counselors expected
      where expected.slug = c.slug
        and expected.name = c.name
    );

  if mismatched_counselor_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_IDENTITY_MISMATCH: 시드 slug 또는 이름과 일부 행이 정확히 일치하지 않아 중단합니다.',
      detail = jsonb_build_object(
        'mismatched_counselor_count',
        mismatched_counselor_count
      )::text;
  end if;

  with expected_counselors(slug, name) as (
    values
      ('a', '상담사 A'),
      ('b', '상담사 B'),
      ('c', '상담사 C'),
      ('d', '상담사 D'),
      ('e', '상담사 E'),
      ('f', '상담사 F')
  )
  select
    coalesce(array_agg(c.id order by c.slug), '{}'::uuid[]),
    count(*)
  into target_ids, matched_counselor_count
  from public.counselors c
  join expected_counselors expected
    on expected.slug = c.slug
    and expected.name = c.name;

  if matched_counselor_count not in (0, 6) then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PARTIAL_SET: 시드 더미 상담사 6명이 전부 일치하지 않아 중단합니다.',
      detail = jsonb_build_object(
        'matched_counselor_count',
        matched_counselor_count,
        'expected_counselor_count',
        6
      )::text;
  end if;

  if matched_counselor_count = 0 then
    raise notice 'REMOVE_DUMMY_COUNSELORS_ALREADY_ABSENT: 일치하는 시드 더미 상담사가 없습니다.';
    return;
  end if;

  with expected_products(
    counselor_slug,
    product_name,
    minutes,
    price,
    sort_order
  ) as (
    values
      ('a', '타로 상담 20분', 20, 20000, 0),
      ('a', '타로 상담 30분', 30, 30000, 1),
      ('b', '사주 상담 20분', 20, 20000, 0),
      ('b', '사주 상담 30분', 30, 30000, 1),
      ('c', '타로 상담 20분', 20, 20000, 0),
      ('c', '타로 상담 30분', 30, 30000, 1),
      ('d', '사주 상담 20분', 20, 20000, 0),
      ('d', '사주 상담 30분', 30, 30000, 1),
      ('e', '타로 상담 20분', 20, 20000, 0),
      ('e', '타로 상담 30분', 30, 30000, 1),
      ('f', '사주 상담 20분', 20, 20000, 0),
      ('f', '사주 상담 30분', 30, 30000, 1)
  ),
  actual_products as (
    select
      c.slug as counselor_slug,
      p.name as product_name,
      p.minutes,
      p.price,
      p.sort_order,
      count(*) as row_count
    from public.consult_products p
    join public.counselors c on c.id = p.counselor_id
    where p.counselor_id = any (target_ids)
    group by c.slug, p.name, p.minutes, p.price, p.sort_order
  ),
  differences as (
    select
      coalesce(expected.counselor_slug, actual.counselor_slug) as counselor_slug
    from expected_products expected
    full join actual_products actual
      on actual.counselor_slug = expected.counselor_slug
      and actual.product_name = expected.product_name
      and actual.minutes = expected.minutes
      and actual.price = expected.price
      and actual.sort_order = expected.sort_order
    where expected.counselor_slug is null
      or actual.counselor_slug is null
      or actual.row_count <> 1
  )
  select count(*)
  into mismatched_product_count
  from differences;

  if mismatched_product_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PRODUCT_MISMATCH: 연결 상담상품이 시드의 12개 구성과 정확히 일치하지 않아 중단합니다.',
      detail = jsonb_build_object(
        'target_counselor_count',
        matched_counselor_count,
        'mismatched_product_group_count',
        mismatched_product_count
      )::text;
  end if;

  with reference_counts as (
    select
      c.slug,
      c.name,
      (
        select count(*)
        from public.reservations r
        where r.counselor_id = c.id
      ) as counselor_reference_count,
      (
        select count(*)
        from public.reservations r
        join public.consult_products p on p.id = r.product_id
        where p.counselor_id = c.id
      ) as product_reference_count,
      (
        select count(*)
        from public.reservations r
        where r.counselor_id = c.id
          or exists (
            select 1
            from public.consult_products p
            where p.id = r.product_id
              and p.counselor_id = c.id
          )
      ) as reservation_count
    from public.counselors c
    where c.id = any (target_ids)
  ),
  referenced_targets as (
    select *
    from reference_counts
    where counselor_reference_count > 0
      or product_reference_count > 0
  )
  select jsonb_agg(
    jsonb_build_object(
      'slug',
      slug,
      'name',
      name,
      'counselor_reference_count',
      counselor_reference_count,
      'product_reference_count',
      product_reference_count,
      'reservation_count',
      reservation_count
    )
    order by slug
  )
  into reservation_report
  from referenced_targets;

  select count(*)
  into reservation_reference_count
  from public.reservations r
  where r.counselor_id = any (target_ids)
    or exists (
      select 1
      from public.consult_products p
      where p.id = r.product_id
        and p.counselor_id = any (target_ids)
    );

  if reservation_reference_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_RESERVATIONS_FOUND: 예약이 더미 상담사 또는 상담상품을 참조해 삭제를 중단합니다.',
      detail = jsonb_build_object(
        'referenced_target_count',
        jsonb_array_length(reservation_report),
        'reservation_reference_count',
        reservation_reference_count,
        'targets',
        reservation_report
      )::text;
  end if;

  select md5(coalesce(string_agg(md5(to_jsonb(c)::text), '' order by c.id::text), ''))
  into before_other_counselors
  from public.counselors c
  where not (c.id = any (target_ids));

  select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  into before_other_products
  from public.consult_products p
  where not (p.counselor_id = any (target_ids));

  select md5(coalesce(string_agg(md5(to_jsonb(r)::text), '' order by r.id::text), ''))
  into before_reservations
  from public.reservations r;

  delete from public.counselors
  where id = any (target_ids);
  get diagnostics deleted_counselor_count = row_count;

  if deleted_counselor_count <> 6
    or exists (
      select 1
      from public.counselors
      where id = any (target_ids)
    )
    or exists (
      select 1
      from public.consult_products
      where counselor_id = any (target_ids)
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_POSTCHECK_FAILED: 더미 상담사 또는 연결 상담상품 삭제 결과가 예상과 다릅니다.';
  end if;

  select md5(coalesce(string_agg(md5(to_jsonb(c)::text), '' order by c.id::text), ''))
  into after_other_counselors
  from public.counselors c;

  select md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' order by p.id::text), ''))
  into after_other_products
  from public.consult_products p;

  select md5(coalesce(string_agg(md5(to_jsonb(r)::text), '' order by r.id::text), ''))
  into after_reservations
  from public.reservations r;

  if after_other_counselors is distinct from before_other_counselors
    or after_other_products is distinct from before_other_products
    or after_reservations is distinct from before_reservations
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_POSTCHECK_FAILED: 실제 상담사를 포함한 비대상 행 또는 예약 행이 변경됐습니다.';
  end if;

  raise notice 'REMOVE_DUMMY_COUNSELORS_OK: 더미 상담사 6명과 시드 상담상품 12개를 삭제하고 비대상 상담사·상품과 예약을 보존했습니다.';
end;
$remove_dummy_counselors$;
-- END EXACT MIGRATION

do $postcheck$
declare
  before_state jsonb;
  after_state jsonb := pg_temp.remove_dummy_counselors_snapshot();
begin
  select snapshot->'state'
  into before_state
  from remove_dummy_counselors_baseline;

  if (after_state->'target_counselors'->>'count')::integer <> 0
    or (after_state->'target_products'->>'count')::integer <> 0
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_POSTCHECK_FAILED: 삭제 대상 행이 남았습니다.';
  end if;

  if after_state->'other_counselors' is distinct from before_state->'other_counselors'
    or after_state->'other_products' is distinct from before_state->'other_products'
    or after_state->'reservations_rows' is distinct from before_state->'reservations_rows'
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_POSTCHECK_FAILED: 실제 상담사를 포함한 비대상 행 또는 예약 행이 변경됐습니다.';
  end if;

  if (after_state->'counselors_rows'->>'count')::integer
      <> (before_state->'counselors_rows'->>'count')::integer - 6
    or (after_state->'consult_products_rows'->>'count')::integer
      <> (before_state->'consult_products_rows'->>'count')::integer - 12
  then
    raise exception using
      errcode = 'P0001',
      message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_POSTCHECK_FAILED: 전체 삭제 건수가 상담사 6명·상품 12개와 다릅니다.';
  end if;
end;
$postcheck$;

do $success$
declare
  baseline jsonb;
begin
  select snapshot
  into baseline
  from remove_dummy_counselors_baseline;

  raise exception using
    errcode = 'P0001',
    message = 'REMOVE_DUMMY_COUNSELORS_PREFLIGHT_OK: a~f / 상담사 A~F 6명과 시드 상담상품 12개 삭제, 예약 참조 0건, 실제 상담사를 포함한 비대상 행 보존 확인. 의도된 전체 롤백.',
    detail = baseline::text;
end;
$success$;
