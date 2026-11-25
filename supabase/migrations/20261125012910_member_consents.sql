-- 회원가입 당시 동의한 약관 버전과 시각만 별도 보관한다.
do $prerequisite$
declare
  missing text[] := '{}';
begin
  if to_regclass('public.member_consents') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_SCHEMA_ALREADY_EXISTS: public.member_consents';
  end if;

  if to_regclass('auth.users') is null then
    missing := array_append(missing, 'auth.users');
  end if;
  if to_regclass('public.profiles') is null then
    missing := array_append(missing, 'public.profiles');
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
      message = 'MEMBER_CONSENTS_SCHEMA_PREREQUISITE_FAILED: ' || array_to_string(missing, ', ');
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'MEMBER_CONSENTS_SCHEMA_PREREQUISITE_FAILED: public.profiles RLS 비활성';
  end if;
end;
$prerequisite$;

create table public.member_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null default '1.0'
    constraint member_consents_terms_version_check
    check (terms_version = '1.0'),
  privacy_version text not null default '1.0'
    constraint member_consents_privacy_version_check
    check (privacy_version = '1.0'),
  agreed_at timestamptz not null default now()
);

alter table public.member_consents enable row level security;

create policy member_consents_select_own on public.member_consents
for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.member_consents
from public, anon, authenticated, service_role;
grant select on public.member_consents to authenticated;
grant insert on public.member_consents to service_role;
