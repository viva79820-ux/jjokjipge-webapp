# 쪽집게천사 — 인수인계 (최신, 11/4 오전 기준)

이 파일은 항상 **가장 최신 상태 하나만** 유지한다(날짜별로 새 파일을 만들지 않고 덮어쓴다. 지난 내용은 git 기록에 남는다).
기준 문서는 `docs/planning/development-plan.md`(v1.4), DB 구조는 `docs/db-design.md`, 기획 세션 지침은 `docs/planning/README.md`.
11/4: 기획 세션을 Claude 프로젝트에서 Codex 웹으로 옮겼다.

---

## 1. 지금 상태 한눈에

- **main에 반영된 기능**(실서비스 https://jjokjipge-webapp.vercel.app)
  - 메인, 전화상담(상담사 목록·상세), 매장상담 — **모두 DB에서 읽음**(더미 파일 삭제)
  - **전화상담 예약**(`/consult/[id]/book`): 상품·날짜·시간 선택(화면 안에서 즉시 전환), 연락처(휴대폰 자동 하이픈, 실시간 유효성 검사), 무통장입금, 동의 2개, 완료 화면(예약번호·예시 계좌). main 커밋 `cdf951f`
  - **관리자 로그인과 관리자 화면 틀**(`/admin`, `/admin/login`): 고객 화면은 route group `app/(site)/`로 분리, 관리자는 `app/admin/(panel)/`. 메뉴 5개(대시보드, 예약 관리, 고객센터, 상담사·상품, 매장)는 아직 빈 화면. 11/3 오후 main에 merge
  - 관리자 계정: 작업자 본인 실제 이메일로 1개 생성, profiles.role = 'admin' 지정(11/3)
- **DB 적용 완료**(Supabase 서울): profiles, stores, counselors, consult_products, reservations + 비공개 예약번호 카운터. RLS 전부 켬. 더미 데이터(매장 2, 상담사 6, 상품 12) 들어 있음. Security Advisor 오류·경고 0. 사전 검사 15개 실제 DB에서 통과(11/3).
- **11/3 대표님 지시(카톡 11:05)**: 금요일(11/6) 쪽집게천사 촬영 때 자료를 받아 온다. **자료 받기 전까지 어드민 작업을 진행**: ① 시스템 전체를 확인할 수 있는 대시보드 ② 고객센터(주요 문의 정리 = FAQ, 1:1 문의 보내기).
- **민원·환불 처리 방침 초안 v0.1**(.docx)을 만들어 대표님께 보냄(쪽집게천사가 수정 후 확정). 프로젝트 문서 목록에도 있음(작업자가 올림).
- 예약 조회 화면(`/booking/lookup`)은 어드민 뒤로 미룸. 예약 완료 화면의 "예약 조회" 링크는 아직 빈 화면으로 감.
- 11/3 대표님께 오늘 진행 상황 카톡 초안을 써 줌(보냈는지는 작업자 확인).

## 2. 바로 다음 할 일

1. **대시보드 + 예약 관리** Codex 프롬프트 작성(11/4~5). 아래 3장 계획대로. 관리자 페이지·데이터 함수·서버 액션마다 `requireAdmin()` 확인 필수.
2. **고객센터**(11/5~6): DB 마이그레이션(faqs, inquiries, 문의번호) → 사전 검사 → merge → 고객 화면(FAQ, 1:1 문의, 문의 조회) → 관리자 화면(FAQ 관리, 문의 답변).
3. **상담사·상품·매장 관리**(11/9): 금요일(11/6) 자료를 바로 입력할 수 있게. 사진 업로드는 Supabase Storage 버킷 마이그레이션 필요.
4. 테스트 예약 정리: Supabase Table Editor → reservations에서 customer_name "테스트" 줄 삭제(작업자가 했는지 확인).
5. 그다음: 비회원 예약 조회 → 회원가입·로그인·마이페이지.

## 3. 어드민·고객센터 계획 (11/3 확정)

- 관리자 로그인: Supabase Auth 이메일+비밀번호. 관리자 계정은 Supabase 대시보드에서 직접 만들고(Authentication → Add user, 자동 확인) SQL로 profiles.role = 'admin' 지정. 공개 회원가입·인증 메일과 무관(기본 메일 제약 문제 없음).
- 권한: `/admin` 아래는 서버에서 로그인 + role 확인. 데이터 수정은 관리자 본인 세션으로 해서 **RLS(private.is_admin())가 최종 방어**. 비밀 키를 어드민 화면에 쓰지 않는다.
- 메뉴(1차): 대시보드 / 예약 관리(목록·필터·상세·상태 변경: 입금 확인→확정, 상담 완료, 취소+사유) / 상담사·상품 관리 / 매장 관리 / 고객센터 관리(FAQ, 1:1 문의 답변). 타로샵 주문·강의·콘텐츠·후기 관리는 해당 기능을 만들 때 추가.
- 대시보드: 오늘 예약, 입금 대기, 다가오는 상담 일정, 미답변 문의, 최근 예약. 통화 매출 같은 수치는 만들지 않음(검토회신 4.1).
- 관리자 권한은 한 단계(admin = 전부). 상담사 계정·보기 전용 권한은 2차.
- 고객센터 공개 화면: FAQ(분류: 예약·입금, 취소·환불, 상담 방식, 타로샵 / 펼침 목록, 내용은 민원·환불 초안 기반 예시), **1:1 문의는 비회원 가능**(분류, 이름, 이메일, 연락처, 예약번호(선택), 내용 → 문의번호 발급, 문의번호 + 이메일로 답변 확인). DB 테이블 faqs, inquiries 추가(마이그레이션 브랜치 먼저).
- 관리자 계정 만들기: Supabase → Authentication → Users → Add user → Create new user(이메일·비밀번호, Auto Confirm User 체크) → SQL Editor에서 `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '...');` → 확인은 `select ... from public.profiles join auth.users` 조회로(편집기는 update 결과 행 수를 안 보여 줌). admin@admin.com 같은 남의 도메인·짐작 쉬운 주소는 쓰지 않고 사람마다 실제 이메일로.

## 4. 예약 기능 구조 (main 기준)

- 운영 기본값(`lib/booking-config.ts`, 고객 회신 전 임시): 12~22시, 30분 단위, 오늘~14일 후(날짜 15개), 지금으로부터 120분 이후, 입금 기한 24시간(안내만), 예시 계좌.
- 서버 전용 비밀 키 클라이언트 `lib/supabase/admin.ts`(server-only). **`lib/reservations/` 안에서만 사용**. 빈 시간 계산은 기존 예약의 시각만 읽음.
- 예약 생성 서버 액션 `lib/reservations/actions.ts`: 서버 재검증, 상품 DB 재조회(가격·시간 DB 값), 시간 조건 재검사, 중복 시 23P01 처리, 로그인 사용자면 user_id(지금은 회원 기능 없음).
- 화면·서버 공통 검사 규칙 `lib/reservations/rules.ts`(비밀 키·DB 없음).
- 공통 부품 추가: `components/ui/drag-row.tsx`(embla 가로 드래그, 추천 상담사 줄·날짜 줄), `components/ui/badge.tsx`(금색 배지). error 색 토큰 추가(AGENTS.md 8.1).
- 정해진 운영 방침(민원·환불 초안과 같음): 비회원 이메일 인증 생략, 고객 직접 취소 없음(매장 연락), 무통장입금만(카드는 PG 테스트 연동 때), 상담 시작 전 취소 전액 환불.
- **오픈 전 보강 필요(시안은 괜찮음)**: 가짜 예약으로 시간을 막는 문제 → ① 입금 기한 지나면 자동 취소 ② 같은 휴대폰·이메일의 입금 대기 예약 개수 제한 ③ 간단한 자동 입력 방지.

## 5. 초기 세팅 결과 (실제 값, 변경 없음)

| 항목                 | 값                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub               | `viva79820-ux/jjokjipge-webapp` (비공개)                                                                                                   |
| 로컬 경로            | `C:\Users\angel\Desktop\jjokjipge\jjokjipge-webapp`                                                                                        |
| Next.js              | 16.4.3(cacheComponents 켜짐 → DB 읽는 부분은 Suspense 경계 필요), React 19.3, Tailwind v4                                                  |
| 패키지               | @supabase/ssr, @supabase/supabase-js, lucide-react, pretendard, embla-carousel-react 8.6.0, prettier(dev)                                  |
| Vercel 환경변수      | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`(11/2 추가, Production·Preview, Secret 타입 권장) |
| Supabase             | 조직 `jjokjipge`(Free), 서울. Data API 켬, 테이블 자동 공개 켬, 자동 RLS 끔 → 테이블마다 RLS 직접                                          |
| Supabase GitHub 연동 | main에 merge되면 `supabase/migrations/` 자동 적용(11/3 실제로 동작 확인)                                                                   |

## 6. 작업 요령과 교훈 (11/2~11/3 추가분)

### Codex CLI

- **모델은 GPT-6.1 Sol을 쓴다(작업자 결정, 11/3).** Terra는 코딩 품질이 낮다고 판단. 비밀 키·DB·권한 작업은 high, 단순 수정은 낮춰도 됨. 프로젝트 지침의 "Terra" 문구는 작업자가 고칠 예정.
- Sol이 "Selected model is at capacity"로 중간에 멈출 수 있다. push됐는지는 기획 세션에서 `git fetch` 후 원격 브랜치가 있는지로 확인한다. 이어서 하라는 짧은 지시를 보내면 된다.
- Codex 출력에 일본어가 섞이는 경우가 있었다(모델 출력 오류, 내용은 정상).
- Codex가 설계 빈틈(NOT NULL 누락)이나 admin_memo 노출을 스스로 찾아 멈춘 적이 있다 → "설계와 다르게 하지 말고 멈추고 질문" 지시가 효과적이다.
- 프롬프트 형식은 그대로: AGENTS.md·설계 문서 읽기 → 브랜치 → 배경 → 구체 지시 → 하지 않는 것 → 확인 → 마무리(?? 검사, 서버 종료, format·lint·build, 한글 커밋, push, main merge 금지) → 요구사항 점검표.
- merge는 별도 짧은 프롬프트(작업자 승인 명시).

### DB 마이그레이션 요령

- merge 전 **사전 검사**: 두 SQL을 한 파일로 묶고 끝에 일부러 오류를 내는 검사 블록을 붙여 Supabase SQL Editor에서 실행 → 결과가 오류 문구로 나오고 모든 변경은 되돌려짐. 실행 시 "Potential issue detected" 창이 뜨면 **Run without RLS**(주황)를 누른다(초록은 SQL을 바꿔 버림).
- 사전 검사 SQL 끝의 검사 블록 예: 임시 테이블 test_results에 항목별 통과 여부를 넣고, 마지막에 `raise exception '[검사 결과...] %', 요약`으로 결과를 보여 주며 전체를 되돌린다(11/3 예약 DB 때 15개 항목: 데이터 수, 예약번호 형식, 겹치는 시간 차단, 이어지는 시간 허용, 끝 시각 검사, 취소 후 재예약, 가입 시 프로필 자동 생성, 비회원·회원 권한).
- 가능하면 기획 세션 환경의 PostgreSQL에 Supabase 비슷한 역할(anon, authenticated, auth.users, auth.uid)을 꾸며 먼저 검사한다.
- merge 후 확인: Table Editor 테이블·RLS 정책 수, Security Advisor(**Rerun linter**를 눌러 최신으로).

### 관리자 인증 구조 (main)

- `lib/admin/auth.ts`(server-only): getAdmin(), requireAdmin() — 요청마다 getClaims + 본인 profiles.role 확인. 로그인 안 됐으면 `/admin/login?next=`로.
- `lib/admin/actions.ts`: 로그인(서버 재검증, 관리자가 아니면 즉시 로그아웃, 실패 문구 통일), 로그아웃.
- `lib/admin/rules.ts`: next는 `/admin`으로 시작하는 경로만 허용(외부 주소·`//`·역슬래시 차단).
- `proxy.ts`가 `x-admin-path` 헤더를 항상 덮어써서 현재 경로를 전달(위조 불가).
- Next.js는 레이아웃이 막아도 페이지가 따로 실행될 수 있으므로 **관리자 페이지마다 확인**한다. 관리자 데이터는 관리자 세션 + RLS로 읽어서 최종 방어.

### 작업자 선호 (추가 확인)

- 시연을 작업자가 한다고 가정하지 않는다(11/2 지적). 먼 일정의 일을 지금 결정하게 만들지 않는다.
- 화면을 직접 써 보고 사용성 피드백을 준다(휴대폰 자동 하이픈, 실시간 유효성 검사, 드래그, 새로고침 느낌 등). 공통 부품을 제대로 쓰는지 신경 쓴다.
- 카톡 글은 요청할 때만, 마크다운 없이.

## 7. 아직 안 된 것 / 확인 필요

- 어드민·고객센터 계획 확정(3장)
- 예약 조회 화면, 회원가입·로그인(일반 회원), 마이페이지
- 대표님 보고: C안+B안 디자인, 반응형 범위 변경 → 11/2 카톡으로 보고함. 전화상담 가격·시간 단위·가능 시간대는 11/9 전에 필요(금요일 촬영 때 자료 수집 예정)
- 민원·환불 방침: 쪽집게천사 수정 회신 대기
- 도메인 angelsaju.com 계정 확인(대표님·고객 몫)
- 외부 메일 발송(Resend 등): 외부 사람이 실제로 가입·메일을 받아야 하는 시점 전에 결정(기본 메일은 조직 멤버에게만, 시간당 2통)
- 기획 세션 이전(Codex 웹 환경 설정, 시작 스킬)이 잘 동작하는지 첫 세션에서 확인
