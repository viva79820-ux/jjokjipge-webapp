-- 운영 DB의 새 SQL Editor에서 전체 실행한다.
-- 마지막 SQLSTATE P0001과 MEMBER_WITHDRAWAL_PREFLIGHT_OK 예외만 성공이다.
-- 성공 예외 DETAIL의 baseline JSON을 별도로 보관한 뒤 롤백 확인 SQL에 입력한다.
-- 검사 계정은 메일을 보내지 않으며 성공 예외로 예약·문의·계정 삽입까지 모두 롤백한다.
-- inquiries.user_id 칸은 이미 있으므로 이 검사는 그 칸을 추가하지 않는다.
rollback;
begin;

do $prerequisite$
begin
  if to_regclass('auth.users') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.reservations') is null
    or to_regclass('public.inquiries') is null
    or to_regclass('public.counselors') is null
    or to_regclass('public.consult_products') is null
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: 회원·예약·문의 테이블이 필요합니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_id_fkey'
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'c'
      and convalidated
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: profiles.id의 auth.users CASCADE FK가 예상과 다릅니다.';
  end if;

  if not exists (
    select 1
    from pg_attribute as attribute
    join pg_constraint as constraint_row
      on constraint_row.conrelid = attribute.attrelid
     and attribute.attnum = any (constraint_row.conkey)
    where attribute.attrelid = 'public.inquiries'::regclass
      and attribute.attname = 'user_id'
      and not attribute.attisdropped
      and not attribute.attnotnull
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.confdeltype = 'n'
      and constraint_row.convalidated
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: inquiries.user_id의 ON DELETE SET NULL FK가 없습니다.';
  end if;

  if not exists (
    select 1
    from pg_attribute as attribute
    join pg_constraint as constraint_row
      on constraint_row.conrelid = attribute.attrelid
     and attribute.attnum = any (constraint_row.conkey)
    where attribute.attrelid = 'public.reservations'::regclass
      and attribute.attname = 'user_id'
      and not attribute.attisdropped
      and not attribute.attnotnull
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
      and constraint_row.confdeltype = 'n'
      and constraint_row.convalidated
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: reservations.user_id의 ON DELETE SET NULL FK가 없습니다.';
  end if;

  if to_regclass('public.orders') is not null
    and not exists (
      select 1
      from pg_attribute as attribute
      join pg_constraint as constraint_row
        on constraint_row.conrelid = attribute.attrelid
       and attribute.attnum = any (constraint_row.conkey)
      where attribute.attrelid = 'public.orders'::regclass
        and attribute.attname = 'user_id'
        and not attribute.attisdropped
        and not attribute.attnotnull
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'auth.users'::regclass
        and constraint_row.confdeltype = 'n'
        and constraint_row.convalidated
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: orders.user_id는 비울 수 있는 ON DELETE SET NULL FK여야 합니다.';
  end if;

  if exists (
    select 1
    from auth.users
    where id = 'f11e0000-0000-4000-8000-00000000de1e'
      or email = 'withdrawal-preflight@example.invalid'
  ) or exists (
    select 1
    from public.profiles
    where id = 'f11e0000-0000-4000-8000-00000000de1e'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_PREREQUISITE_FAILED: 검사 계정이 이미 있습니다.';
  end if;
end;
$prerequisite$;

lock table auth.users, public.profiles, public.reservations, public.inquiries, public.counselors, public.consult_products in share row exclusive mode;

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

create temp table member_withdrawal_baseline as
select pg_temp.member_withdrawal_snapshot() as state;

-- BEGIN EXACT MIGRATION
-- 회원 본인 탈퇴. 비밀 키는 쓰지 않는다.
-- 호출은 로그인한 세션의 auth.uid()만 대상으로 한다.
-- 계정과 profile은 삭제한다. 예약·주문·문의 행은 남기고 회원 연결만 끊는다.
-- inquiries.user_id는 20261105010000에서 이미 있으므로 새 칸을 더하지 않는다.
-- 주문 테이블이 없으면 주문 갱신은 건너뛴다.
-- 테이블은 있는데 회원 칸을 비울 수 없으면 계정을 삭제하지 않고 중단한다.

create function private.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid := (select auth.uid());
begin
  if current_id is null then
    raise exception using
      errcode = '42501',
      message = '로그인이 필요합니다.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = current_id
  ) then
    raise exception using
      errcode = '42501',
      message = '계정을 찾을 수 없습니다.';
  end if;

  update public.reservations
  set user_id = null
  where user_id = current_id;

  if pg_catalog.to_regclass('public.orders') is not null then
    if not exists (
      select 1
      from pg_catalog.pg_attribute
      where attrelid = pg_catalog.to_regclass('public.orders')
        and attname = 'user_id'
        and not attisdropped
        and not attnotnull
    ) then
      raise exception using
        errcode = 'P0001',
        message = '주문 회원 연결을 끊을 수 없어 탈퇴를 중단했습니다.';
    end if;

    execute 'update public.orders set user_id = null where user_id = $1'
      using current_id;
  end if;

  update public.inquiries
  set user_id = null
  where user_id = current_id;

  delete from auth.users
  where id = current_id;

  if exists (
    select 1
    from public.profiles
    where id = current_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = '프로필이 삭제되지 않았습니다.';
  end if;
end;
$$;

revoke all on function private.delete_own_account()
from public, anon, authenticated, service_role;

-- Data API는 public 함수만 노출한다. 권한 있는 삭제는 private 함수가 맡는다.
create function public.delete_own_account()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.delete_own_account();
end;
$$;

revoke all on function public.delete_own_account()
from public, anon, authenticated, service_role;

grant execute on function private.delete_own_account() to authenticated;
grant execute on function public.delete_own_account() to authenticated;
-- END EXACT MIGRATION

create function pg_temp.member_withdrawal_assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if coalesce(condition, false) then
    return;
  end if;
  raise exception using
    errcode = 'P0001',
    message = 'MEMBER_WITHDRAWAL_PREFLIGHT_FAILED: ' || label;
end;
$$;

select pg_temp.member_withdrawal_assert(
  (
    select count(*) = 1
      and bool_and(procedures.prosecdef)
      and bool_and(procedures.proconfig = array['search_path=""'])
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'private'
      and procedures.proname = 'delete_own_account'
  )
  and (
    select count(*) = 1
      and bool_and(not procedures.prosecdef)
      and bool_and(procedures.proconfig = array['search_path=""'])
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname = 'delete_own_account'
  ),
  '탈퇴 함수는 private DEFINER와 public INVOKER 각 1개'
);

select pg_temp.member_withdrawal_assert(
  not exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    cross join lateral aclexplode(
      coalesce(procedures.proacl, acldefault('f', procedures.proowner))
    ) as privileges
    left join pg_roles as roles
      on roles.oid = privileges.grantee
    where procedures.proname = 'delete_own_account'
      and namespaces.nspname in ('public', 'private')
      and privileges.privilege_type = 'EXECUTE'
      and (
        privileges.grantee = 0
        or roles.rolname in ('anon', 'public', 'service_role')
      )
  )
  and exists (
    select 1
    from pg_proc as procedures
    join pg_namespace as namespaces
      on namespaces.oid = procedures.pronamespace
    cross join lateral aclexplode(procedures.proacl) as privileges
    join pg_roles as roles
      on roles.oid = privileges.grantee
    where procedures.proname = 'delete_own_account'
      and namespaces.nspname = 'public'
      and roles.rolname = 'authenticated'
      and privileges.privilege_type = 'EXECUTE'
  ),
  '탈퇴 함수 실행은 authenticated만 가능'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'f11e0000-0000-4000-8000-00000000de1e',
  'withdrawal-preflight@example.invalid',
  '{"name":"탈퇴 검사"}'::jsonb
);

insert into public.counselors (id, slug, name, field, fields, is_active)
values (
  'f11e0000-0000-4000-8000-0000000000c1',
  'withdrawal-preflight',
  '탈퇴 검사 상담사',
  'tarot',
  array['tarot'],
  false
);

insert into public.consult_products (
  id, counselor_id, name, minutes, price, is_active
)
values (
  'f11e0000-0000-4000-8000-0000000000d1',
  'f11e0000-0000-4000-8000-0000000000c1',
  '탈퇴 검사 상담',
  30,
  0,
  false
);

insert into public.reservations (
  id,
  reservation_no,
  user_id,
  counselor_id,
  product_id,
  product_name,
  minutes,
  price,
  starts_at,
  ends_at,
  customer_name,
  customer_phone,
  customer_email,
  payment_method,
  status
)
values (
  'f11e0000-0000-4000-8000-0000000000e1',
  'R-PREFLIGHT-WD-0001',
  'f11e0000-0000-4000-8000-00000000de1e',
  'f11e0000-0000-4000-8000-0000000000c1',
  'f11e0000-0000-4000-8000-0000000000d1',
  '탈퇴 검사 상담',
  30,
  0,
  '2026-11-25 01:00:00+00',
  '2026-11-25 01:30:00+00',
  '탈퇴 검사',
  '010-0000-0000',
  'withdrawal-preflight@example.invalid',
  'bank_transfer',
  'cancelled'
);

insert into public.inquiries (
  id,
  user_id,
  category,
  customer_name,
  customer_email,
  customer_phone,
  content
)
values (
  'f11e0000-0000-4000-8000-0000000000f1',
  'f11e0000-0000-4000-8000-00000000de1e',
  'other',
  '탈퇴 검사',
  'withdrawal-preflight@example.invalid',
  '010-0000-0000',
  '탈퇴 검사 문의'
);

do $anon_block$
begin
  execute 'set local role anon';
  begin
    perform public.delete_own_account();
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_WITHDRAWAL_PREFLIGHT_FAILED: 익명 역할이 탈퇴 함수를 실행했습니다.';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
end;
$anon_block$;

do $withdraw$
begin
  perform set_config(
    'request.jwt.claim.sub',
    'f11e0000-0000-4000-8000-00000000de1e',
    true
  );
  perform set_config(
    'request.jwt.claims',
    '{"sub":"f11e0000-0000-4000-8000-00000000de1e","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  perform public.delete_own_account();
  execute 'reset role';
end;
$withdraw$;

select pg_temp.member_withdrawal_assert(
  not exists (
    select 1
    from auth.users
    where id = 'f11e0000-0000-4000-8000-00000000de1e'
      or email = 'withdrawal-preflight@example.invalid'
  )
  and not exists (
    select 1
    from public.profiles
    where id = 'f11e0000-0000-4000-8000-00000000de1e'
  )
  and (
    select count(*)
    from auth.users
  ) = (
    select (state->'auth_users'->>'count')::bigint
    from member_withdrawal_baseline
  ),
  '검사 계정과 profile 삭제, 다른 계정 수 유지'
);

select pg_temp.member_withdrawal_assert(
  exists (
    select 1
    from public.reservations
    where id = 'f11e0000-0000-4000-8000-0000000000e1'
      and user_id is null
      and reservation_no = 'R-PREFLIGHT-WD-0001'
      and customer_name = '탈퇴 검사'
      and status = 'cancelled'
  )
  and (
    select count(*)
    from public.reservations
    where id <> 'f11e0000-0000-4000-8000-0000000000e1'
  ) = (
    select (state->'reservations'->>'count')::bigint
    from member_withdrawal_baseline
  ),
  '검사 예약은 남고 회원 연결만 끊기며 기존 예약 수는 유지'
);

select pg_temp.member_withdrawal_assert(
  exists (
    select 1
    from public.inquiries
    where id = 'f11e0000-0000-4000-8000-0000000000f1'
      and user_id is null
      and content = '탈퇴 검사 문의'
      and customer_email = 'withdrawal-preflight@example.invalid'
  )
  and (
    select count(*)
    from public.inquiries
    where id <> 'f11e0000-0000-4000-8000-0000000000f1'
  ) = (
    select (state->'inquiries'->>'count')::bigint
    from member_withdrawal_baseline
  ),
  '검사 문의는 남고 회원 연결만 끊기며 기존 문의 수는 유지'
);

do $success$
declare
  baseline jsonb;
begin
  select state into baseline from member_withdrawal_baseline;
  raise exception using
    errcode = 'P0001',
    message = 'MEMBER_WITHDRAWAL_PREFLIGHT_OK: 본인 계정만 삭제되고 예약·문의 기록은 연결이 끊긴 채 남습니다. 의도된 전체 롤백.',
    detail = jsonb_build_object(
      'format', 'member-withdrawal-preflight-v1',
      'state', baseline
    )::text;
end;
$success$;
