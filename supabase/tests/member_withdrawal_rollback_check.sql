-- MEMBER_WITHDRAWAL_PREFLIGHT_OK(P0001)를 확인한 경우에만 별도로 전체 실행한다.
-- 성공 예외 DETAIL의 JSON을 아래 null 대신 $baseline$...$baseline$::jsonb로 붙여 넣는다.
-- 저장소 원본의 baseline은 null로 유지하고 실행 결과 JSON을 커밋하지 않는다.
-- 첫 ROLLBACK은 사전 검사의 의도된 예외로 중단된 트랜잭션을 종료한다.
rollback;

-- BEGIN EXACT SNAPSHOT
create or replace function pg_temp.member_withdrawal_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $snapshot$
declare
  state jsonb := '{}'::jsonb;
  component jsonb;
begin
  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', users.id,
        'created_at', users.created_at,
        'raw_user_meta_data', users.raw_user_meta_data
      )::text),
      '' order by users.id::text
    ), ''))
  )
  into component
  from auth.users as users;
  state := state || jsonb_build_object('auth_users', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(to_jsonb(profiles)::text),
      '' order by profiles.id::text
    ), ''))
  )
  into component
  from public.profiles as profiles;
  state := state || jsonb_build_object('profiles', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', reservations.id,
        'user_id', reservations.user_id,
        'reservation_no', reservations.reservation_no,
        'status', reservations.status
      )::text),
      '' order by reservations.id::text
    ), ''))
  )
  into component
  from public.reservations as reservations;
  state := state || jsonb_build_object('reservations', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', inquiries.id,
        'user_id', inquiries.user_id,
        'inquiry_no', inquiries.inquiry_no,
        'status', inquiries.status
      )::text),
      '' order by inquiries.id::text
    ), ''))
  )
  into component
  from public.inquiries as inquiries;
  state := state || jsonb_build_object('inquiries', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', counselors.id,
        'slug', counselors.slug
      )::text),
      '' order by counselors.id::text
    ), ''))
  )
  into component
  from public.counselors as counselors;
  state := state || jsonb_build_object('counselors', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(jsonb_build_object(
        'id', products.id,
        'counselor_id', products.counselor_id
      )::text),
      '' order by products.id::text
    ), ''))
  )
  into component
  from public.consult_products as products;
  state := state || jsonb_build_object('consult_products', component);

  if pg_catalog.to_regclass('public.orders') is null then
    component := jsonb_build_object('present', false);
  else
    execute $orders$
      select jsonb_build_object(
        'present', true,
        'count', count(*),
        'hash', md5(coalesce(string_agg(
          md5(jsonb_build_object(
            'id', orders.id,
            'user_id', orders.user_id
          )::text),
          '' order by orders.id::text
        ), ''))
      )
      from public.orders as orders
    $orders$
    into component;
  end if;
  state := state || jsonb_build_object('orders', component);

  select jsonb_build_object(
    'count', count(*),
    'hash', md5(coalesce(string_agg(
      md5(pg_catalog.pg_get_functiondef(procedures.oid)),
      '' order by namespaces.nspname, procedures.oid::text
    ), ''))
  )
  into component
  from pg_catalog.pg_proc as procedures
  join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = procedures.pronamespace
  where procedures.proname = 'delete_own_account'
    and namespaces.nspname in ('public', 'private');
  state := state || jsonb_build_object('delete_own_account', component);

  return state;
end;
$snapshot$;
-- END EXACT SNAPSHOT

do $rollback_check$
declare
  baseline jsonb := null;
  current_state jsonb;
  component text;
begin
  if baseline is null
    or baseline->>'format' is distinct from 'member-withdrawal-preflight-v1'
    or jsonb_typeof(baseline->'state') is distinct from 'object'
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_ROLLBACK_BASELINE_REQUIRED: 지정 성공 예외 DETAIL 원본이 필요합니다.';
  end if;

  if exists (
    select 1
    from auth.users
    where id = 'f11e0000-0000-4000-8000-00000000de1e'
      or email = 'withdrawal-preflight@example.invalid'
  ) or exists (
    select 1 from public.profiles where id = 'f11e0000-0000-4000-8000-00000000de1e'
  ) or exists (
    select 1 from public.reservations where id = 'f11e0000-0000-4000-8000-0000000000e1'
  ) or exists (
    select 1 from public.inquiries where id = 'f11e0000-0000-4000-8000-0000000000f1'
  ) or exists (
    select 1 from public.counselors where id = 'f11e0000-0000-4000-8000-0000000000c1'
  ) or exists (
    select 1 from public.consult_products where id = 'f11e0000-0000-4000-8000-0000000000d1'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_ROLLBACK_FAILED: 검사 계정 또는 검사 행이 남았습니다.';
  end if;

  current_state := pg_temp.member_withdrawal_snapshot();
  if (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(current_state) as key
  ) is distinct from (
    select jsonb_agg(key order by key)
    from jsonb_object_keys(baseline->'state') as key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_ROLLBACK_FAILED: baseline 상태 키가 다릅니다.';
  end if;

  for component in
    select jsonb_object_keys(baseline->'state')
  loop
    if current_state->component is distinct from baseline->'state'->component then
      raise exception using
        errcode = 'P0001',
        message = 'MEMBER_WITHDRAWAL_ROLLBACK_FAILED: 운영 원본과 다릅니다: ' || component;
    end if;
  end loop;

  raise notice 'MEMBER_WITHDRAWAL_ROLLBACK_OK: 검사 행 없음. 계정·예약·문의·탈퇴 함수가 사전 검사 전 원본과 일치합니다.';
end;
$rollback_check$;

select 'MEMBER_WITHDRAWAL_ROLLBACK_OK' as result;
