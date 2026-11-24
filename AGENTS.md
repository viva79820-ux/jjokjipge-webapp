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
- 계획·결정·진행 상황은 `docs/planning/`에 있다(`development-plan.md` 기준 문서, `handoff.md` 최신 상태, `README.md` 기획 세션 지침). 코딩 작업은 이 파일(AGENTS.md)의 규칙을 따른다.

## 2. 기술 스택

- Next.js 16 (App Router, `app/` 폴더가 루트에 있다. `src/` 폴더는 쓰지 않는다), React 19, TypeScript
- Tailwind CSS v4: 설정 파일 없이 `app/globals.css`의 `@theme`에서 디자인 값을 정의한다
- Supabase(Auth, DB, Storage)를 `@supabase/supabase-js`와 `@supabase/ssr`로 사용한다
- 배포는 Vercel이다. 엠지미디어 회사 팀(Pro 플랜)에서 운영하고, 함수 지역은 서울(`vercel.json`의 `icn1`)이다. 유료 부가기능(Speed Insights, Observability Plus 등)은 이 프로젝트에 켜지 않는다
- 패키지 관리자는 npm이다
- 새 라이브러리를 추가하기 전에 꼭 필요한지 먼저 확인한다. 같은 일을 하는 라이브러리를 두 개 넣지 않는다
- 가로로 넘기는 슬라이드(배너, 추천 상담사 줄)는 `embla-carousel-react`만 쓴다(무료, 터치 스와이프와 마우스 드래그 지원, 드래그 중 링크가 눌리는 문제를 막아 줌)

## 3. 화면 원칙: 입력 장치별 앱 폭 (2026-11-16 디자인 v2)

- 휴대폰과 태블릿 세로 화면을 기준으로 한 웹앱이다. 넓은 PC용 별도 레이아웃(사이드바, 메가 메뉴)은 만들지 않는다.
- 터치 기기(`(hover: hover) and (pointer: fine)`가 아닌 화면)는 화면 폭에 맞추고 최대 1024px이다. 그보다 넓으면 가운데 정렬한다.
- PC(`@media (hover: hover) and (pointer: fine)`, 변형 클래스 `pc:`)는 앱 최대 폭 560px로 가운데 정렬한다. 넓은 PC 창에서도 앱 안은 휴대폰 배치다.
- 앱 바깥 배경은 페이지 배경(`background`)이다.
- 폭 클래스는 `lib/app-frame.ts`의 `appWidthClass`를 쓴다. 사이트 틀, 관리자 틀, 하단 탭, 이후에 만들 상세 예약 바가 같은 기준을 쓴다.
- 배치 구간은 viewport의 `md:`를 쓰지 않는다. 앱 틀에 `@container/app`를 두고, 앱 내용 폭이 768px 이상일 때만 `@3xl/app:`(컨테이너 48rem)로 태블릿 배치를 적용한다. PC 앱은 560px라 이 구간에 들어가지 않는다.
  - 767px 이하: 좌우 여백 16px, 휴대폰 배치.
  - 터치 기기 768px 이상: 좌우 여백 24px, 태블릿 배치(목록 2열 등 기존 열 규칙).
  - PC: 앱 내부는 휴대폰 배치.
- 글자 크기는 기기나 앱 폭에 따라 일괄로 키우지 않는다.
- 360px부터 해당 기기의 앱 폭까지 가로 스크롤이 생기거나 글자·버튼이 잘리면 안 된다. 관리자 화면도 좁은 폭에서 기능이 잘리거나 가로로 넘치면 안 된다.
- 터치 영역은 최소 44px이다. 하단 고정 탭과 가운데 전화 버튼에 콘텐츠가 가리지 않게 아래쪽 여백을 둔다.
- 누를 수 있는 요소(링크, 버튼, 탭)는 마우스를 올리면 손 모양 커서(`cursor-pointer`)가 된다. 드래그로 넘기는 영역은 `cursor-grab`, 끄는 중에는 `cursor-grabbing`이다.
- 화면에 보이는 글자는 모두 한국어로 쓴다. 코드와 변수명은 영어로 쓴다.

## 4. 정보 구조

상단 탭(6개, 가로 스크롤): 전화상담 / AI 사주 / 클래스 / 매장상담 / 타로샵 / 콘텐츠

- 전화상담: 상담사 목록(타로·사주 필터), 상담사 상세, 이용 방법·요금 안내, 예약
- AI 사주: 입력 틀(`/ai-saju`)과 예시 결과(`/ai-saju/result`). 주 버튼은 준비 중이고, 입력값은 저장하거나 전송하지 않는다. 실제 풀이·요금·결제·외부 연동은 없다
- 클래스: 사주·타로 강의 목록·상세·열람. 영상은 외부 링크이고 유료 강의 결제는 없다
- 매장상담: 동성로 지점 소개, 사진, 영업시간, 위치, 전화 걸기
- 타로샵: 타로카드(인쇄물) 목록·상세·장바구니·주문
- 콘텐츠: 블로그·인스타그램·유튜브 링크 모음

하단 탭: 홈 / 카테고리 / 전화하기(매장 대표번호 `tel:` 링크) / 예약조회 / 로그인·MY. 시안 그림의 "전화상담"·"MY" 라벨로 바꾸지 않는다.

디자인 v2의 화면 재구성은 네 묶음이다. ① 기반(토큰·폭·공통 부품) 다음은 ② 전화상담 목록·상세, ③ 홈, ④ 매장상담이다. ②③④는 아직 구현하지 않았다. 그 화면은 지금 기존 구성을 유지하고, 공통 기반만 새 디자인에 맞춘다. 목표 구성과 이번 구현 범위는 `docs/design/v2/IMPLEMENTATION-NOTES.md`에 구분한다.

확정한 후속 동작(①에서는 구현하지 않는다):

- 홈·매장 참고 가격은 `lib/store-price-config.ts`에서 관리하고, 고객 확인 전 참고 가격임을 표시한다.
- 전화상담·예약 가격은 기존 DB 상품을 쓴다. 매장 참고 가격으로 대체하지 않는다.
- DB 작명 분야를 넣기 전, 홈의 작명은 매장 화면의 작명 가격 안내로 연결한다.
- 전화상담 분야 필터는 전체·타로·사주를 유지한다.
- 상담사 상세는 메뉴를 고른 뒤 하단 예약 버튼으로 이동한다. 선택한 기존 DB 상품 ID를 기존 예약 URL에 넘기고, 예약·결제 서버는 유지한다.

홈의 목표 순서는 배너, 카테고리(전체·타로·사주·작명·매장), 매장 띠, 추천 선생님, 인기 상담 메뉴, 선생님 목록, 공지 한 줄, 푸터다. 전화상담 목록·상세와 매장 화면의 목표 구성은 `docs/design/v2/DESIGN-SPEC.md`를 따른다.

기타 화면: 회원가입·로그인(이메일 인증), 마이페이지(예약·상담 내역, 주문 내역, 내 후기, 1:1 문의, 회원정보), 비회원 예약·주문 조회, 공지사항(`/notices`, 카테고리의 고객센터 위 별도 카드), 고객센터(FAQ·1:1 문의·문의 조회), 후기, 최소 관리자 화면(예약·입금 확인, 상담 완료 처리, 주문 처리)

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
- 공개 이미지는 Storage `public-images` 버킷의 폴더별(`notices/`, `counselors/`, `stores/`)로 저장하고 쓰기는 관리자만 한다. DB에는 버킷 안의 상대 경로만 저장한다. 공개 버킷은 URL을 알면 누구나 볼 수 있으므로 공개해도 되는 이미지만 넣는다.
- 테이블 초안: profiles, stores, counselors(store_id, affiliation `store`/`partner`, approval_status, expert_url), consult_products, reservations, products, orders, order_items, classes, reviews, notices, faqs, inquiries, contents
  - counselors의 affiliation, approval_status, expert_url은 나중에 확장할 때 쓸 필드다. 지금은 필드만 만들고 관련 화면은 만들지 않는다.

## 7. 보안

- API 키, 비밀번호, DB 비밀번호는 코드나 문서에 쓰지 않는다. `.env.local`에만 둔다(`.gitignore`에서 이미 제외됨).
- 환경변수 이름
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: 브라우저에 노출돼도 되는 값
  - `SUPABASE_SECRET_KEY`: **서버 코드에서만** 쓴다. `NEXT_PUBLIC_`을 붙이지 않고, 클라이언트 컴포넌트에서 import하지 않는다
- 비회원 예약 조회처럼 RLS를 우회해야 하는 일은 서버 코드(Server Action이나 Route Handler)에서만 하고, 입력값을 꼭 검증한다.
- 앞으로 만드는 모든 관리자 서버 액션은 맨 처음에 `lib/admin/auth.ts`의 `requireAdmin()`을 호출하고 권한 없음이면 중단한다. 레이아웃의 권한 확인만으로는 서버 액션이 보호되지 않는다.

## 8. 디자인 (v2, 2026-11-16 확정, 이름·헤더·상단 탭은 2026-11-20)

- 화면 기준은 `docs/design/v2/DESIGN-SPEC.md`와 `tokens.json`이다. 정확한 크기·색은 시안 HTML에서 읽는다. 시안 HTML로 기존 화면을 통째로 바꾸지 않는다. 서비스 이름, 공통 헤더, 상단 탭은 `DESIGN-SPEC.md` 8·9장(2026-11-20)이 11/13 시안보다 우선한다.
- `docs/design/mood-*.png`는 이전 시안 기록으로만 둔다. 어두운 가지색, 한지 미색, 금색 테두리, CSS 장식선은 쓰지 않는다.
- 시안 속 인물, 상담사 이름, 번호, 경력, 휴무, 가격은 샘플이다. 운영 데이터로 넣지 않는다.
- 홈·전화상담·매장 화면의 새 구성은 8.5의 공통 부품과 달리 아직 구현 전이 있다. 그 구성을 완료된 규칙처럼 적지 않는다.

### 8.1 색 토큰

`app/globals.css`의 `@theme`에 아래 이름으로 정의하고, 화면에서는 이 토큰만 쓴다(예: `bg-brand`, `text-muted`, `border-border`). 색상 값을 컴포넌트에 직접 쓰거나 `bg-[#...]` 같은 임의 값을 쓰지 않는다.

| 토큰             | 값        | 쓰는 곳                                                      |
| ---------------- | --------- | ------------------------------------------------------------ |
| `background`     | `#F7F3FA` | 페이지 배경, 앱 바깥 배경. 시안의 page                       |
| `surface`        | `#FFFFFF` | 카드, 헤더, 하단 탭, 입력칸                                  |
| `surface-muted`  | `#F0E9F4` | 선택 안 된 보조 컨트롤                                       |
| `foreground`     | `#2A1F33` | 본문·제목. 시안의 ink                                        |
| `muted`          | `#6B6175` | 보조 글자. 시안의 ink-muted                                  |
| `border`         | `#E7E1EC` | 카드 테두리, 구분선. 시안의 line                             |
| `error`          | `#B42318` | 입력 오류. 가격·배지 강조에는 쓰지 않는다                    |
| `brand`          | `#7C429A` | 주요 버튼, 선택된 탭, 강조 제목                              |
| `brand-deep`     | `#5E2F78` | 시안의 brand-strong. 누른 상태, brand-soft 위 글자           |
| `brand-soft`     | `#F3EAF8` | 시안의 brand-tint. 칩, 안내 배경, 사진 없는 상담사 자리      |
| `on-brand`       | `#FFFFFF` | brand 배경 위의 글자·아이콘                                  |
| `on-brand-muted` | `#E4D3EC` | brand 배경 위의 보조 글자                                    |
| `halo`           | `#FFE780` | 강조 배지 배경. 글자는 foreground. 넓은 면적에는 쓰지 않는다 |
| `pink`           | `#C2255C` | 번호 배지, 가격 숫자. 오류 표시에는 쓰지 않는다              |

- 금색 토큰은 쓰지 않는다. 쓰던 곳은 의미에 따라 `border`, `brand`, `halo`, `pink` 등으로 나눈다. gold를 노랑으로 일괄 치환하지 않는다.
- 글자와 배경의 대비는 4.5:1 이상을 지킨다.
- 새 그림자·그라데이션은 쓰지 않는다. 구분은 1px `border`와 배경색으로 한다.

### 8.2 글꼴

- 모든 글자는 Pretendard 하나만 쓴다(`app/fonts/PretendardVariable.woff2`, `next/font/local`, `--font-sans`). 새 서체나 외부 폰트 요청을 추가하지 않는다. 제목은 굵기로 구분한다.
- 글자 크기는 기기 폭에 따라 키우지 않는다. `text-[17px]` 같은 임의 값 대신 아래 토큰을 쓴다.

| 토큰       | 크기 / 줄높이 | 굵기    | 쓰는 곳                |
| ---------- | ------------- | ------- | ---------------------- |
| `display`  | 26 / 34       | 800     | 화면 제목, 상세 이름   |
| `title`    | 20 / 28       | 700     | 섹션 제목              |
| `subtitle` | 17 / 24       | 700     | 카드 안 이름·메뉴명    |
| `body`     | 15 / 22       | 400     | 본문, 상단 탭          |
| `label`    | 14 / 20       | 600~700 | 버튼, 필터             |
| `caption`  | 13 / 18       | 500     | 날짜, 설명, 매장명     |
| `price`    | 18 / 24       | 800     | 가격. 색은 `pink`      |
| `logo`     | 20 / 24       | 800     | 공통 헤더의 한 줄 이름 |
| `fine`     | 12 / 16       | 600     | 칩, 하단 탭 라벨       |

- 12px보다 작은 글자는 쓰지 않는다. 12px는 칩과 하단 탭 라벨에만 쓴다.

### 8.3 모서리·간격·그림자

- 입력칸·썸네일 8px(`rounded-input`). 카드·배너·카테고리 16px(`rounded-card`). 버튼·칩·배지는 pill(`rounded-full`).
- `rounded-button`은 쓰지 않는다. 버튼을 pill로 만들 때 입력칸까지 pill이 되면 안 된다.
- 간격: 화면 좌우 여백 16px, 터치 태블릿은 24px. 섹션 사이 28px, 섹션 제목과 내용 사이 12px. 카드 안쪽은 휴대폰 12px, 터치 태블릿 16px.
- 그림자와 그라데이션은 쓰지 않는다.

### 8.4 장식

- 금색 장식선, 배너 안쪽 장식 테두리, 한지 장식(구름, 매화, 처마, 등불)은 쓰지 않는다.
- 로고와 매장 사진은 `public/images/brand/`의 제공 파일을 쓴다. 장식용 CSS 선으로 대체하지 않는다.

### 8.5 부품 규칙

반복되는 부품은 `components/`에 만들어 재사용한다. 아이콘은 lucide-react를 쓴다.

- 헤더: 흰 바탕, 높이 60px. 왼쪽 천사 로고 마크 높이 34px, 한 줄 이름은 `logo` 토큰(20px·800). "쪽집게천사"는 `brand`, "운세통"은 `foreground`. 설명 줄은 두지 않는다. 오른쪽 로그인 아이콘은 `/login`으로 가고 터치 영역은 44px 이상이다. 메타데이터와 관리자 제목의 정식 이름은 `siteConfig.name`인 "쪽집게천사 운세통"이다. 검색 버튼은 넣지 않는다.
- 상단 탭: 높이 48px. 순서는 전화상담, AI 사주, 클래스, 매장상담, 타로샵, 콘텐츠이고 한 줄 가로 스크롤이다. 칸 너비를 균등하게 나누어 글자를 줄이지 않는다. 각 탭 좌우 12px, 탭 사이 4px, 줄 양끝 8px. 스크롤바는 숨긴다. 15px. 선택은 `brand`·700·아래 3px 선, 나머지는 `muted`. 키보드 포커스가 보이고, 선택된 탭이 화면 밖이면 스크롤해 보여 준다. AI 사주는 `/ai-saju` 입력 틀로 연결한다. 주 버튼은 준비 중이고, 예시 결과는 `/ai-saju/result`다. 결과 화면은 공통 헤더·하단 탭 대신 뒤로가기 헤더와 하단 동작 바를 쓴다. 세로 구분선과 금색 장식은 넣지 않는다.
- 하단 탭: 흰 바탕, 기본 높이 72px와 safe-area. 라벨은 홈·카테고리·전화하기·예약조회·로그인이다. 전화하기는 `siteConfig.phone`의 `tel:` 링크다. 선택은 `brand`, 나머지는 `muted`. 가운데 전화 버튼은 지름 54px, `brand` 바탕, 흰 아이콘, 흰 테두리 4px, 위로 20px 올라온다. 폭은 `appWidthClass`와 같다.
- 주 버튼: 높이 44px 이상, pill, `brand` 배경 + `on-brand` 글자, 14px·700. 보조 버튼: `surface` 배경 + `brand` 테두리·글자. "전화 상담 예약" 버튼은 왼쪽에 전화 아이콘(lucide `Phone`)을 붙인다. 기존 href, disabled, 포커스 동작은 유지한다.
- 칩: 높이 24px, pill, `brand-soft` 바탕 + `brand-deep` 글자, 12px. `primary` prop은 유지하고 대표 분야는 700, 나머지는 600이다.
- 배지: 상태 배지는 `brand-soft` 바탕 + `brand-deep` 글자. `tone="halo"`는 `halo` 바탕 + `foreground` 글자. 금색 테두리는 쓰지 않는다.
- 섹션 제목: `title` 크기. 오른쪽에 필요하면 "더보기 ›" 링크(`muted`).
- 슬라이드(배너, 추천 상담사 줄): `embla-carousel-react`로 만든다. 휴대폰은 손가락으로 밀고, PC는 마우스로 끌어서 넘긴다. 스크롤바는 보이지 않게 한다.
- 상담사 사진이 없거나 불러오지 못하면 `brand-soft` 바탕과 가운데 천사 로고 마크를 보여 준다. 로고 폭은 영역의 약 60%다. 회색 사람 아이콘은 쓰지 않는다. 실제 사진 URL과 Storage 처리는 바꾸지 않는다.
- 홈 배너·상담사 카드의 전체 재배치, 번호 배지, 상세 전용 헤더·예약 바는 다음 작업이다. 그 전까지 기존 화면 구성은 유지하고, 색·모서리·글자·폭만 이 장의 공통 규칙에 맞춘다. 터치 태블릿의 기존 2열은 `@3xl/app:`로만 적용한다.

### 8.6 쓰지 않는 것

- 하트(찜) 버튼: 계획에 없고 로그인이 필요하다. 넣으려면 별도 결정이 필요하다.
- 통계성 문구와 배지: "지금 많이 찾는", 인기, 만족도, 재상담률, 급상승, 상담중. 추천 상담사는 "추천 상담사"로만 표기한다.
- 검색 버튼(계획에 없음).

## 9. 더미 데이터와 참고 자료

- 고객 자료가 오기 전까지는 더미 데이터를 쓴다. 더미라는 것이 티 나게 만든다(예: "상담사 A").
- 인터넷의 실제 인물 사진, 네이버 리뷰·사진·문구는 쓰지 않는다.
- 상담사 사진이 없으면 천사 로고 마크를 보여 준다. 실제 상담사 사진은 관리자 업로드와 Storage 흐름으로만 올린다.
- 제공된 로고·매장 사진은 `public/images/brand/`에 둔다. `gayeon.jpg`와 실제 상담사 사진은 저장소에 넣지 않는다. 제공 매장 사진을 DB `image_path`에 자동 등록하지 않는다.
- 시안 샘플의 이름·번호·경력·휴무·가격으로 관리자 등록 정보를 덮어쓰지 않는다. `fields`와 `careers`는 이미 구현되어 있으므로 시안 문장의 "DB에 없다"는 설명을 따르지 않는다. 없는 번호·휴무는 만들지 않는다.
- 매장 방문 참고 가격은 `lib/store-price-config.ts` 한 곳에 둔다. 고객 확정 전 참고 자료이고, 출처는 1호점 가격판 판독 값이다. 일반·중고등·인원별 금액을 하나로 합치지 않는다.
- 전화상담·예약 가격은 기존 DB 상품이다. 참고 가격과 승인된 운영 자료를 섞지 않는다.
- 쪽집게천사의 실제 전화번호, 주소, 확정 가격은 고객이 확정하기 전에 운영 값으로 넣지 않는다.

## 10. 만들지 않는 것

채팅상담, 060 전화 연동, 코인 충전, 휴대폰 본인인증, 넓은 PC 전용 레이아웃(사이드바, 메가 메뉴), 유료 강의 결제, 방문 예약, 외부 상담사 입점·정산, 네이버 리뷰 자동 수집(크롤링)

## 11. 작업 방식

- 작업은 작게 나눈다. 한 번에 화면 하나나 기능 하나만 한다.
- 코드는 사람이 읽기 좋게 쓴다. 여러 요소나 속성을 한 줄에 몰아 쓰지 말고 줄을 나눈다. 포맷은 Prettier에 맡긴다.
- 작업을 끝내기 전에 `npm run format`을 실행하고, `npm run lint`와 `npm run build`가 통과하는지 확인한다.
- 기존 코드를 고칠 때는 요청과 관련된 부분만 고친다. 관련 없는 리팩터링이나 포맷 변경은 하지 않는다.
- 요구사항이 애매하면 추측해서 만들지 말고 질문한다.
- 커밋 메시지(제목과 설명)는 한글로 쓴다. 제목은 무엇을 했는지 한 줄로 쓰고(예: `상담사 목록 화면 추가`), 설명에는 바뀐 내용을 적는다.

### 11.1 한글 파일 쓰기 (2026-11-02 추가)

- 한글이 들어간 파일은 반드시 UTF-8로 저장한다.
- 파일을 만들거나 고칠 때는 에이전트의 파일 편집 기능(apply_patch 등)만 쓴다. PowerShell이나 셸 명령으로 파일 내용을 쓰지 않는다(`>`, `>>`, `Set-Content`, `Out-File`, `echo ... >` 금지). 이 PC의 터미널은 한글을 `?`로 바꿔 저장한 적이 있다.
- 커밋 전에 바뀐 파일에서 `??`를 검색한다(`git grep -n -I "??" -- app components lib`. `-I`는 글꼴·이미지 같은 바이너리 파일을 빼는 옵션이다). 한글이 `?`로 바뀐 곳이 있으면 고친 뒤 커밋한다.

### 11.2 끝내기 전 자기 점검 (2026-11-02 추가)

lint와 build 통과는 "코드가 돌아간다"는 뜻일 뿐, 요청대로 만들었다는 뜻이 아니다. 작업을 끝내기 전에 아래를 모두 한다.

1. 프롬프트의 요구사항을 항목별로 다시 읽고, 하나씩 코드에서 찾아 확인한다.
2. `git diff`로 바뀐 내용 전체를 처음부터 끝까지 읽는다. 요청하지 않은 변경, 빠진 부분, 깨진 글자가 없는지 본다.
3. 화면에 보이는 문구는 실제 파일에서 한 번 더 확인한다(더미 문구, 버튼 글자, 안내 문구).
4. 보고할 때는 "요구사항 점검표"를 붙인다. 요구사항마다 `완료` / `일부` / `안 함`과 근거(파일 이름)를 적고, 확인하지 못한 것은 확인하지 못했다고 쓴다.

## 12. 브랜치와 배포

- `main`은 배포 브랜치다. main에 올라가면 Vercel 실서비스와 Supabase DB(`supabase/migrations/`)에 자동으로 반영된다. **main에서 직접 작업하지 않는다.**
- 작업 하나마다 main에서 브랜치를 만든다. 이름은 영어로 쓴다(예: `feat/counselor-list`, `fix/booking-form`). 미리보기 주소에 브랜치 이름이 들어가기 때문이다.
- 작업이 끝나면 다음 순서로 진행한다.
  1. `npm run format`을 실행하고, `npm run lint`와 `npm run build`가 통과하는지 확인한다.
  2. 커밋하고 작업 브랜치를 push한다. Vercel이 미리보기 주소를 만든다.
  3. 작업자가 미리보기를 확인하고 승인하면 로컬에서 main에 merge하고 push한다. **PR은 만들지 않는다.**
  4. 합친 작업 브랜치는 삭제한다.
- **작업자 승인 없이 main에 merge하거나 push하지 않는다.**
- 미리보기도 실서비스와 같은 DB를 쓰고, DB 변경은 main에 합칠 때만 적용된다. 그래서 DB 구조를 바꾸는 작업은 마이그레이션만 담은 작은 브랜치로 먼저 main에 합치고, 그다음에 그 테이블을 쓰는 화면 작업을 한다.

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
