<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 쪽집게천사 웹앱 — 작업 지침

이 파일은 이 저장소에서 일하는 모든 AI 에이전트(Codex 등)와 개발자가 따르는 규칙이다. 위의 Next.js 블록은 `next dev`가 자동으로 관리하므로 건드리지 않는다.

## 1. 프로젝트 개요
- 고객: 쪽집게천사. 2005년부터 운영한 대구 동성로의 사주·타로 상담점이다(매장 여러 곳, 상담사 약 10명).
- 제작: 엠지미디어. 1차 시안은 2026-11-26에 시연하고, 오픈은 2026-12-31이다.
- 목적: 오프라인 매장 손님 외에 온라인으로도 상담과 판매를 한다.
- 화면 구조는 상담 플랫폼 "홍카페"의 탭 구조를 참고한다. 구조만 참고하고 로고·그림·문구는 가져오지 않는다.

## 2. 기술 스택
- Next.js 16 (App Router, `app/` 폴더가 루트에 있다. `src/` 폴더는 쓰지 않는다), React 19, TypeScript
- Tailwind CSS v4: 설정 파일 없이 `app/globals.css`의 `@theme`에서 디자인 값을 정의한다
- Supabase(Auth, DB, Storage)를 `@supabase/supabase-js`와 `@supabase/ssr`로 사용한다
- 배포는 Vercel이다. 1차 시안은 무료 플랜으로 배포한다
- 패키지 관리자는 npm이다
- 새 라이브러리를 추가하기 전에 꼭 필요한지 먼저 확인한다. 같은 일을 하는 라이브러리를 두 개 넣지 않는다

## 3. 화면 원칙: 모바일 웹앱 전용
- PC 화면과 반응형은 만들지 않는다. 모든 화면은 폭 360~480px 폰 기준으로 만든다.
- 전체 레이아웃은 `max-width: 480px`로 가운데 정렬한다. PC로 열면 폰 화면처럼 보이면 된다.
- 터치 영역은 최소 44px이다. 하단 고정 탭 때문에 콘텐츠가 가려지지 않게 아래쪽 여백을 둔다.
- 화면에 보이는 글자는 모두 한국어로 쓴다. 코드와 변수명은 영어로 쓴다.

## 4. 정보 구조
상단 탭(5개): 전화상담 / 클래스 / 콘텐츠 / 매장상담 / 타로샵
- 전화상담: 상담사 목록(타로·사주 필터), 상담사 상세, 이용 방법·요금 안내, 예약
- 클래스: 사주·타로 강의 목록·상세·열람. 영상은 외부 링크이고 유료 강의 결제는 없다
- 콘텐츠: 블로그·인스타그램·유튜브 링크 모음
- 매장상담: 동성로 지점 소개, 사진, 영업시간, 위치, 전화 걸기
- 타로샵: 타로카드(인쇄물) 목록·상세·장바구니·주문

메인: 상담사 배너 슬라이드 → 카테고리(전체·타로·사주·오프라인 매장) → 후기 바로가기 → 추천 상담사 → 상담사 리스트(추천·신규 탭)

하단 탭: 홈 / 카테고리 / 전화하기(매장 대표번호 `tel:` 링크) / 예약조회 / 로그인·MY

기타 화면: 회원가입·로그인(이메일 인증), 마이페이지(예약·상담 내역, 주문 내역, 내 후기, 1:1 문의, 회원정보), 비회원 예약·주문 조회, 고객센터(공지·FAQ·1:1 문의), 후기, 최소 관리자 화면(예약·입금 확인, 상담 완료 처리, 주문 처리)

## 5. 핵심 기능 규칙
### 전화상담: 예약형 콜백 구조
1. 고객이 상담사 → 상담 상품(예: 사주 30분) → 희망 날짜·시간을 고른다.
2. 회원은 연락처가 자동으로 채워진다. 비회원은 이름, 휴대폰 번호(연락용, 인증 없음), 이메일(인증 코드)을 입력한다. **로그인 없이도 예약할 수 있어야 한다.**
3. 결제는 무통장입금(관리자가 입금을 확인하면 확정)이나 카드결제(PG, 결제되면 바로 확정)로 한다.
4. 예약이 확정되면 이메일로 알린다.
5. 예약 시간에 상담사가 매장 전화로 고객에게 건다. 이 부분은 웹앱 밖에서 이루어진다.
6. 관리자가 "상담 완료"로 처리하면 고객이 후기를 쓸 수 있다.
- 예약 상태: `pending_payment`(입금 대기) → `confirmed`(확정) → `completed`(완료) / `cancelled`(취소)
- 예약번호는 사람이 읽기 쉬운 형식으로 만든다(예: `R-20261102-0001`). 비회원은 예약번호와 이메일로 조회한다.

### 회원
- Supabase Auth 이메일 인증을 쓴다. 휴대폰 인증은 쓰지 않는다.
- 회원 추가 정보는 `profiles` 테이블에 둔다(`auth.users`와 1:1).

### 결제
- 1차 시안은 **테스트 모드만** 쓴다. 실결제 키는 절대 쓰지 않는다.
- PG 연동 코드는 한 곳(`lib/payments/`)에 모아 둔다. 나중에 PG사를 바꾸기 쉽게 하기 위해서다.
- 포인트·코인 충전 기능은 만들지 않는다(PG 업종 심사 제한 때문). 상품은 "날짜를 지정한 상담"이나 "실물 상품"으로만 판다.

## 6. DB 규칙 (Supabase)
- **모든 테이블은 만들 때 RLS를 켜고, 누가 읽고 쓸 수 있는지 정책을 같이 작성한다.** RLS 없는 테이블은 만들지 않는다.
  - 이 프로젝트의 Data API는 새 테이블을 자동으로 공개하는 설정이다. 그래서 RLS가 없으면 브라우저에 노출된 키만으로 누구나 그 테이블을 읽고 쓸 수 있다.
  - 공개 정보(상담사, 매장, 상품, 강의, 공지, FAQ, 콘텐츠): 누구나 읽기만 허용하고, 쓰기는 관리자만 허용한다.
  - 개인정보(profiles, reservations, orders, inquiries): 본인 것만 읽게 하고, 관리자는 전체를 읽을 수 있게 한다. 비회원 조회와 생성은 서버 코드에서 처리한다.
- DB 구조 변경은 `supabase/migrations/`에 SQL 마이그레이션 파일로만 한다. 대시보드에서 직접 고치지 않는다.
- 관리자 여부는 `profiles.role`(`user` / `admin`)로 구분한다.
- 테이블 초안: profiles, stores, counselors(store_id, affiliation `store`/`partner`, approval_status, expert_url), consult_products, reservations, products, orders, order_items, classes, reviews, notices, faqs, inquiries, contents
  - counselors의 affiliation, approval_status, expert_url은 나중에 확장할 때 쓸 필드다. 지금은 필드만 만들고 관련 화면은 만들지 않는다.

## 7. 보안
- API 키, 비밀번호, DB 비밀번호는 코드나 문서에 쓰지 않는다. `.env.local`에만 둔다(`.gitignore`에서 이미 제외됨).
- 환경변수 이름
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 브라우저에 노출돼도 되는 값
  - `SUPABASE_SECRET_KEY`: **서버 코드에서만** 쓴다. `NEXT_PUBLIC_`을 붙이지 않고, 클라이언트 컴포넌트에서 import하지 않는다
- 비회원 예약 조회처럼 RLS를 우회해야 하는 일은 서버 코드(Server Action이나 Route Handler)에서만 하고, 입력값을 꼭 검증한다.

## 8. 디자인
- 브랜드 색(임시. 디자인 시안이 확정되면 바뀐다): 진보라 `#2B1E4A`, 금색 `#C9A227`, 연보라 `#F4F1FA`
- 글꼴은 Pretendard, 아이콘은 lucide-react를 쓴다.
- 색과 간격은 `app/globals.css`의 `@theme` 토큰으로만 쓴다. 컴포넌트에 색상 값을 직접 쓰지 않는다.
- 반복되는 부품(상단 탭, 하단 탭, 상담사 카드, 버튼, 섹션 제목)은 `components/`에 만들어 재사용한다.

## 9. 더미 데이터
- 고객 자료가 오기 전까지는 더미 데이터를 쓴다. 더미라는 것이 티 나게 만든다(예: "상담사 A").
- 인터넷의 실제 인물 사진, 네이버 리뷰·사진·문구는 쓰지 않는다. 사진 자리는 회색 실루엣이나 자리표시 이미지로 둔다.
- 쪽집게천사의 실제 전화번호, 주소, 가격도 고객이 확정하기 전에는 화면에 넣지 않는다(설정값 한 곳에 모아 두고 나중에 바꾼다).

## 10. 만들지 않는 것
채팅상담, 060 전화 연동, 코인 충전, 휴대폰 본인인증, PC·반응형 레이아웃, 유료 강의 결제, 방문 예약, 외부 상담사 입점·정산, 네이버 리뷰 자동 수집(크롤링)

## 11. 작업 방식
- 작업은 작게 나눈다. 한 번에 화면 하나나 기능 하나만 한다.
- 작업을 끝내기 전에 `npm run lint`와 `npm run build`가 통과하는지 확인한다.
- 기존 코드를 고칠 때는 요청과 관련된 부분만 고친다. 관련 없는 리팩터링이나 포맷 변경은 하지 않는다.
- 요구사항이 애매하면 추측해서 만들지 말고 질문한다.
- 커밋 메시지(제목과 설명)는 한글로 쓴다. 제목은 무엇을 했는지 한 줄로 쓰고(예: `상담사 목록 화면 추가`), 설명에는 바뀐 내용을 적는다.

## 12. 브랜치와 배포
- `main`은 배포 브랜치다. main에 올라가면 Vercel 실서비스와 Supabase DB(`supabase/migrations/`)에 자동으로 반영된다. **main에서 직접 작업하지 않는다.**
- 작업 하나마다 main에서 브랜치를 만든다. 이름은 영어로 쓴다(예: `feat/counselor-list`, `fix/booking-form`). 미리보기 주소에 브랜치 이름이 들어가기 때문이다.
- 작업이 끝나면 다음 순서로 진행한다.
  1. `npm run lint`와 `npm run build`가 통과하는지 확인한다.
  2. 커밋하고 작업 브랜치를 push한다. Vercel이 미리보기 주소를 만든다.
  3. 작업자가 미리보기를 확인하고 승인하면 로컬에서 main에 merge하고 push한다. **PR은 만들지 않는다.**
  4. 합친 작업 브랜치는 삭제한다.
- **작업자 승인 없이 main에 merge하거나 push하지 않는다.**
- 미리보기도 실서비스와 같은 DB를 쓰고, DB 변경은 main에 합칠 때만 적용된다. 그래서 DB 구조를 바꾸는 작업은 마이그레이션만 담은 작은 브랜치로 먼저 main에 합치고, 그다음에 그 테이블을 쓰는 화면 작업을 한다.
