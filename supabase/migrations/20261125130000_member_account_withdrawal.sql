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
