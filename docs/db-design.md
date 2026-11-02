# 쪽집게천사 DB 설계안 v1 (2주차: 회원·전화상담 예약)

작성: 2026.11.02 · 상태: **확정(11/2, 마이그레이션 진행)** · 기준: 개발계획 v1.3, 저장소 AGENTS.md 5·6·7장
표시 규칙: [확인] 공식 문서로 확인 / [미확인] 확인 필요 / [결정 필요] 작업자·대표님 결정 필요

이 문서가 확정되면 Codex에 "마이그레이션만 담은 브랜치"(`feat/db-reservations`)를 맡긴다(reasoning high). AGENTS.md 12장대로 이 브랜치를 먼저 main에 merge하고, 그다음 화면 작업을 한다.

---

## 1. 설계 원칙

1. **모든 테이블 RLS 켬.** 정책 없는 동작은 막힌다. 테이블 자동 공개 설정이라 필수(AGENTS.md 6장).
2. **예약 생성은 서버 코드에서만** 한다(회원·비회원 모두). 브라우저에서 reservations에 직접 쓰는 권한은 주지 않는다. 가격·시간은 브라우저가 보낸 값이 아니라 DB의 상품 값으로 정한다.
3. **비회원 조회도 서버 코드에서만** 한다(예약번호 + 이메일 일치 시에만 필요한 항목만 돌려줌).
4. 서버 코드는 `SUPABASE_SECRET_KEY`를 쓴다(RLS를 우회하므로 서버 전용, 입력값 검증 필수, AGENTS.md 7장).
5. 같은 상담사의 같은 시간 **중복 예약은 DB가 막는다**(배제 제약). 동시에 두 명이 눌러도 한 건만 들어간다.
6. 관리자 판별 함수는 Data API에 노출되지 않는 `private` 스키마에 둔다.
7. 정책 안에서는 `auth.uid()` 대신 `(select auth.uid())`를 쓴다(Supabase 성능 권장 방식).
8. 시각은 `timestamptz`로 저장하고 화면에는 한국 시간(Asia/Seoul)으로 보여 준다.

---

## 2. 테이블

공통 컬럼: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`(수정 시 트리거로 갱신). 상태값은 enum 대신 `text + check`로 둔다(값을 나중에 바꾸기 쉬움).

**NOT NULL 규칙(11/2 추가, Codex 검토 반영)**: 아래 표에서 "null 허용", "null"이라고 적은 컬럼만 null을 허용하고, **나머지는 모두 NOT NULL**이다. 기본값이 있는 컬럼(boolean, sort_order, tags, status 등)도 NOT NULL + 기본값이다.

- null 허용 컬럼 전체 목록: profiles.name, profiles.phone / stores.description, stores.address, stores.hours, stores.phone, stores.image_path / counselors.store_id, counselors.intro, counselors.description, counselors.image_path, counselors.expert_url / reservations.user_id, reservations.depositor_name, reservations.confirmed_at, reservations.completed_at, reservations.cancelled_at, reservations.cancel_reason, reservations.admin_memo
- 특히 reservations의 counselor_id, product_id, product_name, minutes, price, starts_at, ends_at, customer_name, customer_phone, customer_email, payment_method, status는 NOT NULL이다(null이면 시간 검사와 중복 예약 방지 배제 제약이 의도대로 동작하지 않기 때문).

### 2.1 profiles (회원 추가 정보, auth.users와 1:1)

| 컬럼  | 타입                                                    | 설명                      |
| ----- | ------------------------------------------------------- | ------------------------- |
| id    | uuid PK, `references auth.users(id) on delete cascade`  |                           |
| name  | text                                                    | 이름(예약 자동 입력용)    |
| phone | text                                                    | 휴대폰(연락용, 인증 없음) |
| role  | text not null default 'user', check in ('user','admin') | 관리자 구분               |

- 회원가입 때 트리거가 자동으로 만든다(`handle_new_user`, 가입 정보의 name을 넣음).
- **role은 사용자가 바꿀 수 없게** 한다: 수정 권한을 name, phone 컬럼에만 준다(컬럼 단위 권한). 관리자 지정은 Supabase SQL 편집기에서 직접 한다.
- 이메일은 auth.users에 있으므로 복사하지 않는다.

### 2.2 stores (매장)

| 컬럼                              | 타입                              | 설명                        |
| --------------------------------- | --------------------------------- | --------------------------- |
| id                                | uuid PK default gen_random_uuid() |                             |
| slug                              | text unique not null              | 주소용 이름(예: `store-a`)  |
| name, description, address, hours | text                              |                             |
| phone                             | text null                         | 비면 사이트 대표번호 사용   |
| image_path                        | text null                         | Storage 경로(사진은 나중에) |
| sort_order                        | int default 0                     |                             |
| is_active                         | boolean default true              |                             |

### 2.3 counselors (상담사)

| 컬럼                   | 타입                                                               | 설명                                                               |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| id                     | uuid PK                                                            |                                                                    |
| slug                   | text unique not null                                               | 주소 `/consult/[slug]`. 지금 더미 주소(`/consult/a`)와 맞추려고 둠 |
| store_id               | uuid FK → stores, null 허용                                        | 근무 매장                                                          |
| name                   | text not null                                                      | 활동명                                                             |
| field                  | text check in ('tarot','saju')                                     | 대표 분야                                                          |
| tags                   | text[] default '{}'                                                | 첫 번째가 대표 분야                                                |
| intro                  | text                                                               | 목록용 한 줄                                                       |
| description            | text                                                               | 상세 소개                                                          |
| image_path             | text null                                                          |                                                                    |
| is_recommended, is_new | boolean default false                                              | 메인 추천·신규 탭                                                  |
| affiliation            | text default 'store' check in ('store','partner')                  | 확장 대비(화면 없음)                                               |
| approval_status        | text default 'approved' check in ('pending','approved','rejected') | 확장 대비                                                          |
| expert_url             | text null                                                          | 네이버 엑스퍼트 연결 대비                                          |
| sort_order             | int, is_active boolean                                             |                                                                    |

### 2.4 consult_products (상담 상품)

| 컬럼         | 타입                                   | 설명               |
| ------------ | -------------------------------------- | ------------------ |
| id           | uuid PK                                |                    |
| counselor_id | uuid FK → counselors on delete cascade | 상담사별 상품      |
| name         | text not null                          | 예: 타로 상담 20분 |
| minutes      | int not null check (minutes > 0)       |                    |
| price        | int not null check (price >= 0)        | 원 단위            |
| sort_order   | int, is_active boolean                 |                    |

- 고객이 "모든 상담사 같은 가격"으로 정해도 이 구조로 담을 수 있다(상담사마다 같은 행). 가격 자료가 오면 값만 바꾼다 → 6장 결정 필요 3번.

### 2.5 reservations (전화상담 예약)

| 컬럼                                          | 타입                                                                                            | 설명                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| id                                            | uuid PK                                                                                         |                                                            |
| reservation_no                                | text unique not null                                                                            | `R-20261102-0001`. 트리거가 한국 날짜 기준 일련번호로 만듦 |
| user_id                                       | uuid null FK → auth.users on delete set null                                                    | 회원이면 채움, 비회원은 null                               |
| counselor_id                                  | uuid FK → counselors (restrict)                                                                 |                                                            |
| product_id                                    | uuid FK → consult_products (restrict)                                                           |                                                            |
| product_name, minutes, price                  | text, int, int                                                                                  | **예약 당시 값 저장**(나중에 가격이 바뀌어도 기록 유지)    |
| starts_at, ends_at                            | timestamptz                                                                                     | ends_at = starts_at + minutes. check (ends_at > starts_at) |
| customer_name, customer_phone, customer_email | text not null                                                                                   | 회원도 저장(예약 당시 연락처)                              |
| payment_method                                | text check in ('bank_transfer','card')                                                          |                                                            |
| depositor_name                                | text null                                                                                       | 무통장 입금자명                                            |
| status                                        | text default 'pending_payment' check in ('pending_payment','confirmed','completed','cancelled') |                                                            |
| confirmed_at, completed_at, cancelled_at      | timestamptz null                                                                                |                                                            |
| cancel_reason, admin_memo                     | text null                                                                                       | admin_memo는 고객에게 보여 주지 않음                       |

- **중복 예약 방지(배제 제약)**: 같은 counselor_id에서 `tstzrange(starts_at, ends_at)`가 겹치면 거부. 단 status가 `pending_payment`, `confirmed`인 예약만 대상(취소·완료는 제외). `btree_gist` 확장 필요(Supabase에서 켤 수 있음).
- 카드결제 관련 컬럼(PG 거래번호 등)은 결제 작업 때 별도 마이그레이션으로 추가한다.
- 인덱스: (user_id), (counselor_id, starts_at), (reservation_no는 unique라 자동).

### 2.6 private.reservation_counters (예약번호 일련번호, 비공개)

| 컬럼    | 타입         |
| ------- | ------------ |
| day     | date PK      |
| last_no | int not null |

- `private` 스키마라 Data API로 보이지 않는다. 예약 생성 트리거가 `insert ... on conflict do update set last_no = last_no + 1 returning last_no`로 번호를 받는다(동시에 들어와도 번호가 겹치지 않음).

---

## 3. RLS 정책

| 테이블           | 읽기                                                                                       | 쓰기                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| profiles         | 본인(`id = (select auth.uid())`), 관리자 전체                                              | 본인 수정만(name, phone 컬럼만). 생성은 트리거, 삭제는 탈퇴 서버 코드                    |
| stores           | 누구나: `is_active`인 것. 관리자: 전체                                                     | 관리자만                                                                                 |
| counselors       | 누구나: `is_active and approval_status = 'approved'`. 관리자: 전체                         | 관리자만                                                                                 |
| consult_products | 누구나: `is_active`이고 상담사도 공개 상태인 것. 관리자: 전체                              | 관리자만                                                                                 |
| reservations     | 회원 본인(`user_id = (select auth.uid())`), 관리자 전체. **비회원(anon)은 직접 읽기 없음** | **생성: 정책 없음(서버 코드만)**. 수정: 관리자만(상태 변경). 삭제: 없음(취소는 status로) |

관리자 판별 함수(정책에서 사용):

```sql
create schema if not exists private;
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
```

예시(reservations 읽기):

```sql
create policy "reservations_select_own_or_admin"
on public.reservations for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
```

profiles 컬럼 권한(role 보호):

```sql
revoke update on public.profiles from anon, authenticated;
grant update (name, phone) on public.profiles to authenticated;
```

- 회원이 자기 예약 행에서 볼 수 있는 컬럼에 admin_memo가 포함된다. 화면에서는 admin_memo를 조회하지 않도록 select 컬럼을 지정한다. 완전히 숨기려면 관리자 메모를 별도 테이블로 뺀다 → 1차 시안은 화면에서 조회하지 않는 방식으로 충분하다고 판단.

---

## 4. 서버 코드에서 할 일 (2주차 화면 작업 때)

### 예약 생성 (Server Action, `lib/reservations/`)

1. 입력값 검증: 이름·휴대폰·이메일 형식, 결제 방법, 시작 시각(예약 가능 기간·영업시간·슬롯 단위 안인지).
2. 로그인 상태면 세션에서 user_id를 꺼낸다(브라우저가 보낸 user_id는 믿지 않음).
3. 상품을 DB에서 다시 읽어 counselor_id 일치, 공개 상태 확인. 가격·시간·이름은 DB 값으로 저장.
4. insert. 중복 시간이면 배제 제약 오류 → "이미 예약된 시간이에요" 안내.
5. 예약번호를 돌려주고 완료 화면에 보여 준다.

### 비회원 예약 조회 (`/booking/lookup`)

- 예약번호 + 이메일이 둘 다 맞을 때만 결과를 돌려준다. 돌려주는 항목: 예약번호, 상담사 이름, 상품, 시간, 상태, 결제 방법, 입금 안내. admin_memo·user_id는 돌려주지 않는다.
- 틀렸을 때 "어느 쪽이 틀렸는지" 알려 주지 않는다.

### 예약 가능 시간 계산

- 1차 시안은 **공통 영업시간 + 30분 단위**를 코드 설정(`lib/booking-config.ts`)으로 둔다. 값은 더미(예: 12:00~22:00, 오늘부터 14일, 지금으로부터 2시간 이후). 고객 자료가 오면 값만 바꾼다.
- 이미 잡힌 시간은 reservations에서 해당 상담사·날짜의 `pending_payment`, `confirmed` 예약을 읽어 비활성 처리한다. 비회원은 reservations를 직접 읽을 수 없으므로 **서버 코드에서 "시작·끝 시각만"** 돌려준다.
- 상담사별 근무표가 필요하면 2차로 `counselor_schedules` 테이블을 추가한다.

---

## 5. 마이그레이션 구성 (Codex 작업 단위)

`supabase/migrations/`에 두 파일:

1. `<시각>_reservations_schema.sql`: 확장(btree_gist), private 스키마, 함수(is_admin, handle_new_user, updated_at 트리거, 예약번호 트리거), 테이블 6개, 제약, 인덱스, RLS 켜기, 정책, 컬럼 권한.
2. `<시각>_seed_dummy.sql`: 지금 `lib/dummy/`의 매장 2곳·상담사 6명·상품 12개를 그대로 넣는다(slug는 `a`~`f`로 지금 주소와 맞춤). 이름에 "더미"가 티 나는 지금 값 그대로. **오픈 전에 삭제 마이그레이션으로 지운다.**

작업자 쪽에서 할 일

- `SUPABASE_SECRET_KEY`를 `.env.local`과 Vercel 환경변수(Production·Preview)에 등록한다. 값은 Supabase → Project Settings → API Keys의 Secret key. 값은 문서나 대화에 옮겨 적지 않는다.
- merge 후 Supabase → Database → Tables에서 테이블 6개가 생겼는지, Advisors → Security Advisor에 RLS 경고가 없는지 확인한다.
- 본인 계정을 관리자로 지정(SQL 편집기, 회원가입 후).

---

## 6. 예약 화면 작업 때 정할 것 (마이그레이션에는 영향 없음)

1. 비회원 이메일 인증 코드: 추천은 1차 시안에서 생략(이메일 형식만 검사). 메일 발송 수단이 아직 없기 때문. 비회원 조회는 예약번호 + 이메일로 됨.
2. 고객 직접 취소: 추천은 1차 시안에서 관리자만 취소(환불 규정이 아직 없음). 고객 화면에는 "취소는 매장으로 연락" 안내.
3. 예약 가능 시간: 공통 영업시간 + 30분 단위, 값은 더미(코드 설정). 고객 자료(가격·시간 단위·가능 시간대, 11/9 전 필요)가 오면 값만 바꿈.
4. 더미 데이터는 마이그레이션으로 넣고 오픈 전에 삭제 마이그레이션으로 지운다(확정).

## 6-1. 나중에 확인할 것 (3주차 끝, 11/20 내부 시안 전)

- Supabase 기본 메일 제약 [확인: Supabase Auth SMTP 문서]: 조직 멤버 이메일로만, 시간당 2통. 외부 사람이 실제로 가입해야 하는 시점 전에 외부 메일 서비스(Resend 등, 보내는 도메인 필요) 연결 여부를 정한다. DB 구조와는 무관.

## 7. 이번 범위에서 빠진 것 (3주차 이후 별도 설계)

products / orders / order_items(타로샵), classes, reviews(상담 완료 예약과 연결), notices / faqs / inquiries, contents, Storage 버킷(사진), 결제(PG) 컬럼.
