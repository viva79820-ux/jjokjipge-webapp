-- 기획 검토 후, 기존 마이그레이션이 적용된 개발 DB 또는 작업자 SQL Editor에서 전체 실행.
-- 신규 테이블이 아직 없는 상태에서만 실행한다. SQL Editor의 작성자 권한이 필요하다.
-- 마지막 P0001 예외의 지정 문구만 성공이다. 그 외 오류는 실패이며 성공으로 간주하지 않는다.
-- psql에서는 ON_ERROR_STOP=1 권장. 오류 후 같은 세션이면 ROLLBACK을 실행한다.
-- COMMIT 없음. 마지막 예외로 트랜잭션 전체가 취소되며 연결 종료/ROLLBACK 시 모두 제거된다.
-- 단일 연결 순차 검사다. 별도 연결 동시성 검사는 이 파일에서 수행하지 않는다.
begin;

do $$
begin
  if to_regclass('public.faqs') is not null
    or to_regclass('public.inquiries') is not null
    or to_regclass('private.inquiry_counters') is not null then
    raise exception '검사 중단: 신규 테이블이 이미 존재합니다. 재적용하지 않습니다.';
  end if;
end;
$$;

-- BEGIN EXACT SCHEMA
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
-- END EXACT SCHEMA
-- BEGIN EXACT SEED
-- 초기 화면 검토용 예시. 고객 확정 정책이 아니며 공개하지 않는다.
insert into public.faqs (category, question, answer, sort_order, is_active)
values
  ('reservation_payment', '(예시) 무통장입금 예약은 언제 확정되나요?', '화면 확인용 예시입니다. 무통장입금 예약은 관리자가 입금을 확인한 뒤 확정하는 방식으로 준비하고 있습니다.', 0, false),
  ('cancellation_refund', '(예시) 예약 취소는 어떻게 문의하나요?', '화면 확인용 예시입니다. 예약 취소는 매장으로 연락해 주세요. 세부 환불 안내는 고객사 정책 확정 후 제공할 예정입니다.', 0, false),
  ('consultation', '(예시) 전화상담은 어떻게 진행되나요?', '화면 확인용 예시입니다. 희망 날짜와 시간을 예약하면 예약 시간에 상담사가 매장 전화로 연락하는 예약형 콜백 방식입니다.', 0, false),
  ('shop', '(예시) 타로샵 상품 문의는 어디에 남기나요?', '화면 확인용 예시입니다. 타로카드 등 실물 상품에 관한 질문은 1:1 문의의 타로샵 분류로 남길 수 있도록 준비하고 있습니다.', 0, false);
-- END EXACT SEED

create temporary table support_test_results (label text not null);
grant insert, select on support_test_results to anon, authenticated, service_role;

create function pg_temp.support_assert(ok boolean, label text)
returns void language plpgsql security invoker as $$
begin
  if ok is distinct from true then
    raise exception '검사 실패: %', label;
  end if;
  insert into pg_temp.support_test_results values (label);
end;
$$;

-- 예상 SQLSTATE만 잡는다. 실패해야 할 문장이 성공하거나 다른 오류면 즉시 중단한다.
create function pg_temp.support_denied(command text, expected_state text, label text)
returns void language plpgsql security invoker as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = expected_state then
      insert into pg_temp.support_test_results values (label);
      return;
    end if;
    raise;
  end;
  raise exception '검사 실패(차단되지 않음): %', label;
end;
$$;

grant execute on function pg_temp.support_assert(boolean, text),
  pg_temp.support_denied(text, text, text) to anon, authenticated, service_role;

create temporary table support_actors (kind text, id uuid);
insert into support_actors values ('user', gen_random_uuid()), ('other', gen_random_uuid()), ('admin', gen_random_uuid());
grant select on support_actors to anon, authenticated, service_role;
-- 테스트 계정만 생성한다. 기존 계정/예약은 읽거나 변경하지 않는다.
insert into auth.users (id, email, raw_user_meta_data)
select id, id::text || '@example.invalid', '{"name":"테스트 고객센터"}'::jsonb
from support_actors;
update public.profiles set role = 'admin'
where id = (select id from support_actors where kind = 'admin');

select pg_temp.support_assert(
  (select count(*) = 4 and count(distinct category) = 4
    and bool_and(not is_active and question like '(예시)%') from public.faqs),
  '네 분류 예시 네 건 모두 비활성');
select pg_temp.support_assert(
  (select count(*) = 3 and bool_and(relrowsecurity) from pg_class
    where oid in ('public.faqs'::regclass, 'public.inquiries'::regclass, 'private.inquiry_counters'::regclass)),
  '신규 세 테이블 RLS 활성화');

-- 카탈로그로 타입/NOT NULL/기본값/키/트리거를 검사한다.
do $$
declare
  r record;
  n text;
begin
  for r in select * from (values
    ('faqs', array['id','category','question','answer','sort_order','is_active','created_at','updated_at']),
    ('inquiries', array['id','inquiry_no','category','customer_name','customer_email','customer_phone','content','status','created_at','updated_at'])
  ) v(tbl, cols) loop
    foreach n in array r.cols loop
      perform pg_temp.support_assert(
        (select attnotnull from pg_attribute where attrelid = ('public.' || r.tbl)::regclass and attname = n),
        r.tbl || '.' || n || ' NOT NULL');
    end loop;
  end loop;
  for r in select * from (values
    ('faqs', 'id', 'gen_random_uuid()'), ('faqs','sort_order','0'),
    ('faqs','is_active','false'), ('faqs','created_at','now()'), ('faqs','updated_at','now()'),
    ('inquiries','id','gen_random_uuid()'), ('inquiries','status', '''pending''::text'),
    ('inquiries','created_at','now()'), ('inquiries','updated_at','now()')
  ) v(tbl,col,expr) loop
    perform pg_temp.support_assert(
      (select pg_get_expr(d.adbin,d.adrelid) = r.expr from pg_attrdef d join pg_attribute a
        on a.attrelid = d.adrelid and a.attnum = d.adnum
        where d.adrelid = ('public.' || r.tbl)::regclass and a.attname = r.col),
      r.tbl || '.' || r.col || ' 기본값');
  end loop;
  perform pg_temp.support_assert(
    (select count(*) = 2 from pg_constraint where contype='p' and conrelid in ('public.faqs'::regclass,'public.inquiries'::regclass)),
    '공개 테이블 기본 키');
  perform pg_temp.support_assert(
    exists(select 1 from pg_constraint where conrelid='public.inquiries'::regclass and contype='u'
      and pg_get_constraintdef(oid) = 'UNIQUE (inquiry_no)'), '문의번호 고유 제약');
end;
$$;

-- 유효한 문의를 바탕으로 필드 하나씩 바꾸어 DB CHECK/NOT NULL을 실제 실행한다.
create function pg_temp.support_insert(patch jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker as $$
declare
  result uuid;
begin
  insert into public.inquiries (
    user_id, category, customer_name, customer_email, customer_phone, reservation_no,
    content, status, answer, answered_at, answered_by
  )
  select user_id, category, customer_name, customer_email, customer_phone, reservation_no,
    content, status, answer, answered_at, answered_by
  from jsonb_populate_record(null::public.inquiries,
    '{"category":"other","customer_name":"테스트 문의","customer_email":"support@example.invalid","customer_phone":"010-1234-5678","content":"테스트 문의 내용","status":"pending"}'::jsonb || patch)
  returning id into result;
  return result;
end;
$$;

grant execute on function pg_temp.support_insert(jsonb) to anon, authenticated, service_role;

select pg_temp.support_insert();
select pg_temp.support_insert(jsonb_build_object('user_id', id)) from support_actors where kind in ('user','other');

select pg_temp.support_assert(
  (select count(*) = 3 and count(distinct inquiry_no) = 3
    and bool_and(inquiry_no ~ ('^I-' || to_char(statement_timestamp() at time zone 'Asia/Seoul','YYYYMMDD') || '-[0-9]{4,}$'))
    and bool_and(status='pending' and answer is null and answered_at is null and answered_by is null)
    from public.inquiries), '비회원/회원 문의 자동 번호 및 기본 상태');
select pg_temp.support_assert(
  (select array_agg(split_part(inquiry_no,'-',3)::int order by inquiry_no) = array[1,2,3] from public.inquiries),
  '같은 한국 날짜 순차 증가');

do $$
declare
  r record;
  old_counter bigint;
begin
  select last_no into old_counter from private.inquiry_counters where day=(statement_timestamp() at time zone 'Asia/Seoul')::date;
  for r in select * from (values
    ('category',to_jsonb('invalid'::text)), ('category','null'::jsonb),
    ('customer_name',to_jsonb(E' \t\n'::text)), ('customer_name',to_jsonb(repeat('가',31))), ('customer_name','null'::jsonb),
    ('customer_email',to_jsonb(''::text)), ('customer_email',to_jsonb('A@example.invalid'::text)),
    ('customer_email',to_jsonb(' a@example.invalid'::text)), ('customer_email',to_jsonb('a@example.invalid '::text)),
    ('customer_email',to_jsonb('a@@b.com'::text)), ('customer_email',to_jsonb('a@b'::text)),
    ('customer_email',to_jsonb('a..b@example.invalid'::text)), ('customer_email',to_jsonb(repeat('a',250)||'@b.com')),
    ('customer_phone',to_jsonb('011-1234-5678'::text)), ('customer_phone',to_jsonb('01012345678'::text)),
    ('customer_phone',to_jsonb('010-123-5678'::text)), ('reservation_no',to_jsonb('  '::text)),
    ('reservation_no',to_jsonb(repeat('R',51))), ('content',to_jsonb(E'\t\n'::text)),
    ('content',to_jsonb(repeat('가',5001))), ('content','null'::jsonb),
    ('answer',to_jsonb(' '::text)), ('answer',to_jsonb(repeat('가',5001))),
    ('answer',to_jsonb('대기 중 답변 금지'::text)), ('answered_at',to_jsonb(now())),
    ('answered_by',to_jsonb((select id from support_actors where kind='admin'))),
    ('status',to_jsonb('invalid'::text)), ('status',to_jsonb('answered'::text))
  ) v(col,val) loop
    perform pg_temp.support_denied(
      format('select pg_temp.support_insert(%L::jsonb)', jsonb_build_object(r.col,r.val)),
      case when r.val='null'::jsonb then '23502' else '23514' end,
      '문의 검증: ' || r.col || ' ' || left(r.val::text,40));
  end loop;
  perform pg_temp.support_assert(
    (select last_no=old_counter from private.inquiry_counters where day=(statement_timestamp() at time zone 'Asia/Seoul')::date),
    '실패 INSERT의 카운터 증가 롤백');
end;
$$;

-- 정상 길이 경계 및 선택 예약번호: 예약 존재 확인/FK 없이 보관.
select pg_temp.support_insert(jsonb_build_object(
  'customer_name',repeat('가',30), 'customer_email',repeat('a',240)||'@example.co.kr',
  'reservation_no',repeat('R',50), 'content',repeat('가',5000)));
select pg_temp.support_denied(
  'select pg_temp.support_insert(''{"status":"answered","answer":"테스트 답변"}'')',
  '23514','답변 완료 시 answered_at 필수');
select pg_temp.support_insert(jsonb_build_object('status','answered','answer',repeat('가',5000),'answered_at',now()));
select pg_temp.support_denied(
  'select pg_temp.support_insert(''{"status":"answered","answer":" ","answered_at":"2026-11-05T00:00:00Z"}'')',
  '23514','완료 답변 공백 거부');
select pg_temp.support_denied(
  format('select pg_temp.support_insert(%L::jsonb)',jsonb_build_object(
    'status','answered','answer',repeat('가',5001),'answered_at',now())),
  '23514','완료 답변 길이 초과 거부');

-- 네 자리 이후 확장 및 명시 번호 덮어쓰기.
update private.inquiry_counters set last_no=9999 where day=(statement_timestamp() at time zone 'Asia/Seoul')::date;
select pg_temp.support_insert();
select pg_temp.support_assert(
  exists(select 1 from public.inquiries where inquiry_no like '%-10000'), '10000번 잘림 없음');
insert into public.inquiries (inquiry_no,category,customer_name,customer_email,customer_phone,content)
values ('임의 번호','other','테스트','test@example.invalid','010-1234-5678','테스트');
select pg_temp.support_assert(
  exists(select 1 from public.inquiries where inquiry_no like '%-10001')
    and not exists(select 1 from public.inquiries where inquiry_no='임의 번호'), '입력 번호 대신 트리거 발급');
select pg_temp.support_denied(
  'update public.inquiries set inquiry_no=(select inquiry_no from public.inquiries limit 1)
    where id<>(select id from public.inquiries limit 1)', '23505','문의번호 중복 차단');

-- FAQ 제약 검사(전체 롤백되는 하위 트랜잭션).
do $$
declare
  r record;
begin
  for r in select * from (values
    ('category', 'invalid'), ('question',' '), ('question',repeat('가',301)),
    ('answer',E'\t\n'), ('answer',repeat('가',5001))
  ) v(col,val) loop
    perform pg_temp.support_denied(
      format('insert into public.faqs(category,question,answer) values (%L,%L,%L)',
        case when r.col='category' then r.val else 'shop' end,
        case when r.col='question' then r.val else '테스트 질문' end,
        case when r.col='answer' then r.val else '테스트 답변' end),
      '23514','FAQ 검증: ' || r.col || ' ' || left(r.val,20));
  end loop;
end;
$$;
insert into public.faqs(category,question,answer,is_active)
values ('shop',repeat('가',300),repeat('가',5000),true);
-- now()는 트랜잭션 시작 시각으로 고정되므로 과거 값을 넣어 트리거를 검증.
insert into public.faqs(category,question,answer,updated_at)
values ('shop','테스트 갱신 질문','테스트 답변','2000-01-01');
update public.faqs set answer='테스트 갱신 답변' where question='테스트 갱신 질문';
select pg_temp.support_assert(
  (select updated_at=now() from public.faqs where question='테스트 갱신 질문'), 'FAQ updated_at 트리거');
update public.inquiries set updated_at='2000-01-01' where user_id is null;
select pg_temp.support_assert(
  (select bool_and(updated_at=now()) from public.inquiries where user_id is null), '문의 updated_at 트리거');

-- 실제 역할/사용자 식별자 전환: 검사 함수는 SECURITY INVOKER이다.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select pg_temp.support_assert((select count(*)=1 from public.faqs), 'anon 활성 FAQ만 조회');
select pg_temp.support_denied('select * from public.inquiries','42501','anon 문의 조회 거부');
select pg_temp.support_denied('select pg_temp.support_insert()','42501','anon 문의 생성 거부');
select pg_temp.support_denied('update public.inquiries set answer=''테스트''','42501','anon 문의 수정 거부');
select pg_temp.support_denied('delete from public.inquiries','42501','anon 문의 삭제 거부');
select pg_temp.support_denied('select * from private.inquiry_counters','42501','anon 카운터 조회 거부');
select pg_temp.support_denied('insert into private.inquiry_counters values (current_date,1)','42501','anon 카운터 쓰기 거부');
select pg_temp.support_denied('select private.set_inquiry_no()','42501','anon 내부 함수 실행 거부');
select pg_temp.support_denied('insert into public.faqs(category,question,answer) values (''shop'',''테스트'',''테스트'')','42501','anon FAQ 생성 거부');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from support_actors where kind='user'),true);
select pg_temp.support_assert((select count(*)=1 from public.faqs), '회원 활성 FAQ만 조회');
select pg_temp.support_assert(
  (select count(*)=1 and bool_and(user_id=auth.uid()) from public.inquiries), '회원 본인 문의만 조회: 타 회원/비회원 제외');
select pg_temp.support_denied('select pg_temp.support_insert()','42501','회원 직접 문의 생성 거부');
select pg_temp.support_denied('delete from public.inquiries','42501','회원 문의 삭제 거부');
select pg_temp.support_denied('update public.inquiries set user_id=auth.uid()','42501','회원 소유자 수정 거부');
-- 답변 열 UPDATE 권한은 있지만 일반 회원 RLS로 대상 행이 0이다.
with changed as (update public.inquiries set status='answered',answer='테스트 위조',answered_at=now() returning id)
select pg_temp.support_assert((select count(*)=0 from changed), '회원 답변/상태 수정 RLS 차단');
select pg_temp.support_denied('insert into public.faqs(category,question,answer) values (''shop'',''테스트'',''테스트'')','42501','회원 FAQ 생성 RLS 거부');
with changed as (update public.faqs set question='테스트 위조' returning id)
select pg_temp.support_assert((select count(*)=0 from changed),'회원 FAQ 수정 RLS 차단');
with changed as (delete from public.faqs returning id)
select pg_temp.support_assert((select count(*)=0 from changed),'회원 FAQ 삭제 RLS 차단');
select pg_temp.support_denied('select * from private.inquiry_counters','42501','회원 카운터 조회 거부');
select pg_temp.support_denied('update private.inquiry_counters set last_no=1','42501','회원 카운터 수정 거부');
select pg_temp.support_denied('select private.set_inquiry_no()','42501','회원 내부 함수 실행 거부');
reset role;

-- 관리자도 authenticated 역할이며 관리자 본인 JWT + 기존 is_admin()을 사용한다.
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from support_actors where kind='admin'),true);
select pg_temp.support_assert((select count(*)=6 from public.faqs), '관리자 비활성 FAQ 포함 전체 조회');
select pg_temp.support_assert((select count(*)=7 from public.inquiries), '관리자 모든 회원/비회원 문의 조회');
insert into public.faqs(category,question,answer) values ('shop','테스트 관리자 질문','테스트 답변');
update public.faqs set is_active=true where question='테스트 관리자 질문';
select pg_temp.support_assert(
  exists(select 1 from public.faqs where question='테스트 관리자 질문' and is_active), '관리자 FAQ 생성/수정');
delete from public.faqs where question='테스트 관리자 질문';
select pg_temp.support_assert(
  not exists(select 1 from public.faqs where question='테스트 관리자 질문'), '관리자 FAQ 삭제');
update public.inquiries set status='answered',answer='테스트 관리자 답변',answered_at=now(),answered_by=auth.uid()
where user_id=(select id from support_actors where kind='user');
select pg_temp.support_assert(
  (select status='answered' and answer='테스트 관리자 답변' and answered_at=now() and answered_by=auth.uid()
    from public.inquiries where user_id=(select id from support_actors where kind='user')),
  '관리자 답변 네 열 수정');
select pg_temp.support_denied('update public.inquiries set customer_name=''변경''','42501','관리자 고객명 수정 거부');
select pg_temp.support_denied('update public.inquiries set customer_email=''changed@example.invalid''','42501','관리자 이메일 수정 거부');
select pg_temp.support_denied('update public.inquiries set content=''변경''','42501','관리자 내용 수정 거부');
select pg_temp.support_denied('update public.inquiries set inquiry_no=''변경''','42501','관리자 문의번호 수정 거부');
select pg_temp.support_denied('update public.inquiries set user_id=auth.uid()','42501','관리자 소유자 수정 거부');
select pg_temp.support_denied('update public.inquiries set customer_phone=''010-9999-9999''','42501','관리자 연락처 수정 거부');
select pg_temp.support_denied('update public.inquiries set category=''shop''','42501','관리자 분류 수정 거부');
select pg_temp.support_denied('update public.inquiries set reservation_no=''R-TEST''','42501','관리자 예약번호 수정 거부');
select pg_temp.support_denied('delete from public.inquiries','42501','관리자 직접 문의 삭제 거부');
select pg_temp.support_denied('select pg_temp.support_insert()','42501','관리자 직접 문의 생성 거부');
select pg_temp.support_denied('select * from private.inquiry_counters','42501','관리자 카운터 조회 거부');
reset role;

-- 테스트 관리자 계정 삭제 후 답변은 유지되고 담당자만 NULL.
delete from auth.users where id=(select id from support_actors where kind='admin');
select pg_temp.support_assert(
  (select status='answered' and answer is not null and answered_by is null
    from public.inquiries where user_id=(select id from support_actors where kind='user')),
  '관리자 계정 삭제 후 answered_by NULL 허용');

set local role service_role;
select pg_temp.support_insert();
select pg_temp.support_assert((select count(*)=8 from public.inquiries),'service_role 문의 접수/조회 권한');
select pg_temp.support_denied('select * from private.inquiry_counters','42501','service_role 카운터 직접 조회 거부');
reset role;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('faqs','id','uuid'),('faqs','category','text'),('faqs','question','text'),('faqs','answer','text'),
    ('faqs','sort_order','integer'),('faqs','is_active','boolean'),
    ('faqs','created_at','timestamp with time zone'),('faqs','updated_at','timestamp with time zone'),
    ('inquiries','id','uuid'),('inquiries','inquiry_no','text'),('inquiries','user_id','uuid'),
    ('inquiries','category','text'),('inquiries','customer_name','text'),('inquiries','customer_email','text'),
    ('inquiries','customer_phone','text'),('inquiries','reservation_no','text'),('inquiries','content','text'),
    ('inquiries','status','text'),('inquiries','answer','text'),('inquiries','answered_by','uuid'),
    ('inquiries','answered_at','timestamp with time zone'),
    ('inquiries','created_at','timestamp with time zone'),('inquiries','updated_at','timestamp with time zone')
  ) v(tbl,col,typ) loop
    perform pg_temp.support_assert(
      (select format_type(atttypid,atttypmod)=r.typ from pg_attribute
        where attrelid=('public.'||r.tbl)::regclass and attname=r.col),r.tbl||'.'||r.col||' 타입');
  end loop;
  perform pg_temp.support_assert(
    (select count(*)=5 and bool_and(not attnotnull) from pg_attribute where attrelid='public.inquiries'::regclass
      and attname in ('user_id','reservation_no','answer','answered_at','answered_by')),
    '선택 필드 NULL 허용');
  perform pg_temp.support_assert(
    (select count(*)=2 and bool_and(confdeltype='n') from pg_constraint
      where conrelid='public.inquiries'::regclass and contype='f'
        and confrelid in ('auth.users'::regclass,'public.profiles'::regclass)),
    '회원/답변자 FK 삭제 SET NULL');
  perform pg_temp.support_assert(
    (select count(*)=2 from pg_constraint where conrelid='public.inquiries'::regclass and contype='f'),
    '예약번호 FK 없음');
end;
$$;

-- 테이블 GRANT뿐 아니라 각 열의 실제 유효 권한도 전수 확인한다.
do $$
declare
  col record;
  actor text;
begin
  foreach actor in array array['anon','authenticated'] loop
    for col in select attname from pg_attribute where attrelid='public.inquiries'::regclass and attnum>0 and not attisdropped loop
      perform pg_temp.support_assert(
        not has_column_privilege(actor,'public.inquiries',col.attname,'INSERT'),
        actor || '.' || col.attname || ' INSERT 없음');
      perform pg_temp.support_assert(
        has_column_privilege(actor,'public.inquiries',col.attname,'UPDATE')
          = (actor='authenticated' and col.attname in ('status','answer','answered_at','answered_by')),
        actor || '.' || col.attname || ' UPDATE 허용 목록');
    end loop;
    perform pg_temp.support_assert(not has_table_privilege(actor,'public.inquiries','DELETE'), actor || ' DELETE 없음');
    perform pg_temp.support_assert(not has_any_column_privilege(actor,'private.inquiry_counters','SELECT,INSERT,UPDATE,REFERENCES'),
      actor || ' 카운터 열 권한 없음');
  end loop;
end;
$$;

-- 이 예외까지 도달해야만 모든 순차 검사가 통과한 것이다.
-- 예외 후 트랜잭션은 aborted 상태라 이 파일에서 만든 테이블/데이터를 커밋할 수 없다.
do $$
declare
  total integer;
begin
  select count(*) into total from pg_temp.support_test_results;
  raise exception 'CUSTOMER_SUPPORT_PREFLIGHT_OK: 순차 검사 %개 통과. 의도된 예외로 전체 롤백. 동시성/실제 Supabase 검증은 별도.', total;
end;
$$;
