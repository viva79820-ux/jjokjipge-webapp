-- 고객센터 DB 기반. 비회원 생성/조회는 후속 서버 전용 코드에서 처리한다.
create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('reservation_payment', 'cancellation_refund', 'consultation', 'shop')),
  question text not null check (question ~ '[^[:space:]]' and char_length(question) <= 300),
  answer text not null check (answer ~ '[^[:space:]]' and char_length(answer) <= 5000),
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faqs enable row level security;

-- 비공개 스키마 + RLS(정책 없음). 함수 소유자만 트리거 내부에서 접근한다.
create table private.inquiry_counters (
  day date primary key,
  last_no bigint not null check (last_no > 0)
);
alter table private.inquiry_counters enable row level security;
revoke all on private.inquiry_counters from public, anon, authenticated, service_role;

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  inquiry_no text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('reservation_payment', 'cancellation_refund', 'consultation', 'shop', 'other')),
  customer_name text not null check (customer_name ~ '[^[:space:]]' and char_length(customer_name) <= 30),
  customer_email text not null check (
    customer_email = lower(btrim(customer_email))
    and char_length(customer_email) <= 254
    and customer_email ~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  ),
  customer_phone text not null check (customer_phone ~ '^010-[0-9]{4}-[0-9]{4}$'),
  reservation_no text check (reservation_no ~ '[^[:space:]]' and char_length(reservation_no) <= 50),
  content text not null check (content ~ '[^[:space:]]' and char_length(content) <= 5000),
  status text not null default 'pending' check (status in ('pending', 'answered')),
  answer text check (answer ~ '[^[:space:]]' and char_length(answer) <= 5000),
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inquiries_answer_state_check check (
    (status = 'pending' and answer is null and answered_at is null and answered_by is null)
    or (status = 'answered' and answer is not null and answered_at is not null)
  )
);
alter table public.inquiries enable row level security;

-- 카테고리별 FAQ 정렬, 관리자 전체/상태별 목록·미답변 수, 회원별 최신 목록.
create index faqs_category_sort_idx on public.faqs (category, sort_order, id);
create index inquiries_created_at_idx on public.inquiries (created_at desc, id);
create index inquiries_status_created_at_idx on public.inquiries (status, created_at desc, id);
create index inquiries_user_created_at_idx on public.inquiries (user_id, created_at desc, id) where user_id is not null;
create index inquiries_answered_by_idx on public.inquiries (answered_by) where answered_by is not null;

create function private.set_inquiry_no()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inquiry_day date := (pg_catalog.statement_timestamp() at time zone 'Asia/Seoul')::date;
  next_no bigint;
begin
  -- 입력된 번호도 덮어써서 발급 경로를 하나로 유지한다.
  -- UPSERT의 행 잠금으로 동시 발급을 직렬화한다. INSERT 실패 시 카운터도 롤백된다.
  insert into private.inquiry_counters (day, last_no)
  values (inquiry_day, 1)
  on conflict (day) do update
    set last_no = private.inquiry_counters.last_no + 1
  returning last_no into next_no;

  new.inquiry_no := 'I-' || pg_catalog.to_char(inquiry_day, 'YYYYMMDD') || '-'
    || pg_catalog.lpad(next_no::text, greatest(4, pg_catalog.length(next_no::text)), '0');
  return new;
end;
$$;
revoke all on function private.set_inquiry_no() from public, anon, authenticated, service_role;

create trigger inquiries_set_inquiry_no
before insert on public.inquiries
for each row execute function private.set_inquiry_no();
create trigger faqs_set_updated_at
before update on public.faqs
for each row execute function private.set_updated_at();
create trigger inquiries_set_updated_at
before update on public.inquiries
for each row execute function private.set_updated_at();

create policy faqs_select_active_or_admin on public.faqs
for select to anon, authenticated
using (is_active or (select private.is_admin()));
create policy faqs_insert_admin on public.faqs
for insert to authenticated with check ((select private.is_admin()));
create policy faqs_update_admin on public.faqs
for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy faqs_delete_admin on public.faqs
for delete to authenticated using ((select private.is_admin()));

create policy inquiries_select_own_or_admin on public.inquiries
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy inquiries_update_admin on public.inquiries
for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

-- 기본 GRANT를 제거한 뒤 필요한 테이블/열 권한만 명시한다.
-- 새 테이블이므로 기존 열 GRANT는 없으며, 아래 명시 검사 SQL에서도 이를 확인한다.
revoke all on public.faqs, public.inquiries from public, anon, authenticated, service_role;
grant select on public.faqs to anon, authenticated;
grant insert, update, delete on public.faqs to authenticated;
grant select on public.inquiries to authenticated;
grant update (status, answer, answered_at, answered_by) on public.inquiries to authenticated;
-- 서버 전용 역할: 문의 접수/번호+이메일 조회. 카운터 권한은 부여하지 않는다.
grant select, insert on public.inquiries to service_role;
grant select on public.faqs to service_role;
