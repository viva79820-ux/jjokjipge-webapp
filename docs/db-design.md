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

- null 허용 컬럼 전체 목록: profiles.name, profiles.phone / stores.description, stores.address, stores.hours, stores.phone, stores.image_path / counselors.store_id, counselors.intro, counselors.description, counselors.image_path, counselors.expert_url / reservations.user_id, reservations.depositor_name, reservations.confirmed_at, reservations.completed_at, reservations.cancelled_at, reservations.cancel_reason
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
| cancel_reason                                 | text null                                                                                       | 취소 사유(고객에게 보여도 되는 내용만)                     |

- **중복 예약 방지(배제 제약)**: 같은 counselor_id에서 `tstzrange(starts_at, ends_at)`가 겹치면 거부. 단 status가 `pending_payment`, `confirmed`인 예약만 대상(취소·완료는 제외). `btree_gist` 확장 필요(Supabase에서 켤 수 있음).
- 카드결제 관련 컬럼(PG 거래번호 등)은 결제 작업 때 별도 마이그레이션으로 추가한다.
- 인덱스: (user_id), (counselor_id, starts_at), (reservation_no는 unique라 자동).

### 2.6 private.reservation_counters (예약번호 일련번호, 비공개)

| 컬럼    | 타입         |
| ------- | ------------ |
| day     | date PK      |
| last_no | int not null |

- `private` 스키마라 Data API로 보이지 않는다. 예약번호 숫자 부분은 4자리로 맞추되, 하루 10,000건을 넘으면 자릿수를 늘린다(`lpad(n, greatest(4, length(n)), '0')`, lpad가 긴 숫자를 잘라 번호가 겹치는 것을 막기 위함). 예약 생성 트리거가 `insert ... on conflict do update set last_no = last_no + 1 returning last_no`로 번호를 받는다(동시에 들어와도 번호가 겹치지 않음).

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

- 관리자 메모(admin_memo)는 **넣지 않는다**(11/2 결정). 회원은 자기 예약 행의 모든 컬럼을 읽을 수 있어서, 같은 행에 관리자 메모를 두면 화면에서 조회하지 않아도 Data API로 보인다. 1차 시안의 최소 관리자 기능에는 메모가 필요 없다. 필요해지면 관리자만 읽는 별도 테이블로 추가한다.

---

## 4. 서버 코드에서 할 일 (2주차 화면 작업 때)

### 예약 생성 (Server Action, `lib/reservations/`)

1. 입력값 검증: 이름·휴대폰·이메일 형식, 결제 방법, 시작 시각(예약 가능 기간·영업시간·슬롯 단위 안인지).
2. 로그인 상태면 세션에서 user_id를 꺼낸다(브라우저가 보낸 user_id는 믿지 않음).
3. 상품을 DB에서 다시 읽어 counselor_id 일치, 공개 상태 확인. 가격·시간·이름은 DB 값으로 저장.
4. insert. 중복 시간이면 배제 제약 오류 → "이미 예약된 시간이에요" 안내.
5. 예약번호를 돌려주고 완료 화면에 보여 준다.

### 비회원 예약 조회 (`/booking/lookup`)

- 예약번호 + 이메일이 둘 다 맞을 때만 결과를 돌려준다. 돌려주는 항목: 예약번호, 상담사 이름, 상품, 시간, 상태, 결제 방법, 입금 안내. user_id는 돌려주지 않는다.
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

products / orders / order_items(타로샵), classes, reviews(상담 완료 예약과 연결), contents, 결제(PG) 컬럼. FAQ·문의는 고객센터 마이그레이션, 공지·공개 이미지 버킷은 아래 8장의 마이그레이션으로 별도 정의한다.

## 8. 공지사항·공개 이미지 (공지사항 1단계)

마이그레이션: `supabase/migrations/20261109010000_notices_schema.sql`. 실제 공지·포스터·시드·팝업 필드는 만들지 않는다.

### public.notices

| 컬럼                   | 타입·기본값                | 제약·의미                                                                                          |
| ---------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| id                     | uuid PK, gen_random_uuid() | 필수                                                                                               |
| title                  | text                       | 필수, 공백만 불가(탭·줄바꿈 포함), 최대 100자                                                      |
| body                   | text                       | 필수, 공백만 불가, 최대 5000자                                                                     |
| image_path             | text null                  | 선택 이미지 1장, `notices/<8-4-4-4-12 자리 16진수 UUID>.<jpg 또는 jpeg 또는 png 또는 webp>`만 허용 |
| image_alt              | text null                  | 값이 있으면 공백만 불가·최대 200자. image_path가 있으면 필수                                       |
| is_pinned              | boolean, false             | 필수, 상단 고정                                                                                    |
| is_published           | boolean, false             | 필수, 신규 기본 비공개                                                                             |
| published_at           | timestamptz null           | 공개 상태이면 필수                                                                                 |
| created_at, updated_at | timestamptz, now()         | 필수, 기존 private.set_updated_at() 트리거로 갱신                                                  |

- 이미지 DB 값은 버킷 안의 상대 경로만 저장한다. 빈 문자열·전체 URL·버킷 접두사·다른 폴더·상위 경로·다른 확장자는 거부한다. 이미지가 없어도 유효한 대체 설명을 보관할 수 있다.
- CHECK에서 NULL이 통과하는 특성을 고려해 필수값에는 NOT NULL, 이미지·설명 및 공개·시각의 결합에는 명시적인 IS NOT NULL을 사용한다.
- 인덱스: `(is_published, is_pinned desc, published_at desc, id desc)`. id는 동일 정렬 값의 안정적인 보조 기준이다.
- 최초 공개 시 **후속 서버 액션**이 서버 현재 시각을 published_at에 넣는다. 비공개로 바꾸거나 다시 공개해도 최초 값을 지우거나 덮어쓰지 않는다. 이번 DB 단계는 공개 시각 필수 CHECK만 둔다. 예약 공개·자동 게시 기능은 없다.
- RLS: anon·authenticated는 공개 공지만 SELECT, 관리자는 비공개 포함 SELECT 및 CRUD. UPDATE는 USING과 WITH CHECK 모두 기존 private.is_admin()을 사용한다.
- PUBLIC·anon·authenticated·service_role의 새 테이블 기본 권한을 모두 회수한 뒤 anon·authenticated에 SELECT, authenticated에 INSERT·UPDATE·DELETE만 부여한다. 쓰기는 RLS로 관리자만 가능하다. service_role에는 별도 권한을 부여하지 않는다. 기존 객체 권한은 유지한다.

### Storage public-images

- ID·이름 `public-images`, public=true, file_size_limit=5242880(5MiB), allowed_mime_types는 image/jpeg·image/png·image/webp 집합이다.
- 공지는 `notices/`, 향후 상담사·매장은 `counselors/`, `stores/` 폴더를 사용한다. 이번에는 다른 테이블의 경로 제약을 바꾸지 않는다.
- 버킷이 없으면 생성한다. 있으면 이름·공개 여부·용량·MIME 집합을 비교하며 MIME 배열 순서·중복은 무시한다. 같으면 행을 변경하지 않고 재사용한다. 다르면 SQLSTATE P0001, `NOTICES_BUCKET_CONFIG_MISMATCH`와 항목명으로 중단하며 설정을 바꾸지 않는다.
- storage.objects에는 authenticated 대상 `public_images_select_admin`, `public_images_insert_admin`, `public_images_update_admin`, `public_images_delete_admin` 정책을 추가한다. 조건은 bucket_id='public-images' AND private.is_admin()이며 UPDATE는 양쪽 조건에 적용한다. 기존 정책·Storage 전역 권한·보호 장치는 변경하지 않는다.
- **공개 URL을 알면 누구나 이미지를 볼 수 있다. 비공개 공지의 이미지도 예외가 아니다.** 관리자 SELECT 정책은 목록·메타데이터 접근 제한이며 공개 URL을 숨기지 않는다. 공개해도 되는 포스터·상담사·매장 이미지만 넣고 개인정보·비공개 자료는 넣지 않는다.

### SQL 사전 검사와 실행 범위

1. 기획 검토 후 SQL Editor에서 `supabase/tests/notices_preflight.sql` 전체를 실행한다. 초기 설치 전용이며 notices·신규 인덱스·신규 정책·public-images 버킷(이름 충돌 포함)이 이미 있으면 중단한다. 기존 버킷 재사용 기능은 마이그레이션 자체에 유지한다.
2. SQLSTATE P0001과 `NOTICES_PREFLIGHT_OK` 및 검사 수가 포함된 **마지막 의도된 예외**만 성공이다. DETAIL에 검사 전 버킷과 storage.objects 정책 전체 원본 JSON을 제공한다. 결과창의 초기 snapshot도 확인할 수 있으며, 반드시 DETAIL JSON을 별도로 보관한다. 임시 테이블은 롤백되므로 원본을 거기에만 의존하지 않는다.
3. `supabase/tests/notices_rollback_check.sql`의 baseline에 그 JSON을 넣고 전체를 **별도로** 실행한다. 첫 ROLLBACK으로 aborted 트랜잭션을 종료한다. `NOTICES_ROLLBACK_OK`와 원본 정책 전체 일치를 확인한다. baseline 누락·임의 초기값은 통과시키지 않는다.

기존 객체 때문에 시작 단계에서 중단됐다면 설치 전용 롤백 확인을 실행하지 않는다. 기존 버킷은 변경·삭제하지 않았으므로 초기 snapshot과 읽기 전용 조회로 설정 및 정책을 대조한다. 사전 검사 실패를 롤백 확인 성공으로 대체할 수 없다.

검사는 실제 SET LOCAL ROLE과 임시 테스트 사용자·프로필을 사용하고 전체 롤백한다. 사전 검사가 새로 만든 버킷 안에서만 동일 설정·MIME 순서 재사용과 설정 불일치를 하위 트랜잭션으로 검사하며, 실제 마이그레이션의 버킷 DO 블록을 그대로 재실행한다. CHECK/권한 오류는 지정 SQLSTATE만 인정한다. 0행 차단과 실제 원본 유지도 확인한다. updated_at은 now()가 트랜잭션 동안 고정되므로 과거 시각에서 now()로 바뀌는지 확인한다.

Storage 검사는 메타데이터 SQL·정책·버킷 설정 검사다. 실제 파일 업로드·공개 URL·용량 초과 및 MIME 차단은 후속 Storage API 검사 대상이다. 직접 SQL이 Supabase의 보호 장치로 막히면 전체 검사 실패로 남기고 해당 항목은 미검증으로 보고한다. 보호 장치를 해제하거나 다른 오류를 성공 처리하지 않는다. 로컬 SQL 실행 환경이 없는 경우 파일 작성·본문 동기화 검사와 실제 SQL 실행을 구분해 보고한다.

자동 검증 보조 파일:

- `node --test tests/notices-schema.test.mjs`: 사전 검사의 마이그레이션 전체와 버킷 재실행 본문이 원본과 일치하는지만 확인한다. 보안 SQL 실행 검사가 아니다.
- `node tests/notices-schema.model.mjs`: 별도 PGlite 실행 환경을 준비한 경우 인메모리 PostgreSQL에서 사전 검사와 롤백 확인을 실제 실행한다. 기본 모듈 위치는 무시되는 `node_modules/.cache/notices-pg-runtime/` 아래이며, 다른 환경에서는 `NOTICES_PGLITE_MODULE`로 모듈 경로/URL을 전달할 수 있다. 프로젝트 package.json·lockfile에는 의존성을 추가하지 않는다. Auth·Storage는 최소 모형이고 기존 관리자 함수·트리거 본문을 재사용한다. 기존 정책 원본·별도 롤백·기존 버킷 때문에 중단되는 사례도 확인한다. Supabase 고유 보호 트리거나 실제 Storage 서비스를 재현하지 않는다.
