# Bunny Stream 연결

결제 직후, 쪽집게천사 운세통이 강의 영상을 Bunny Stream에 올리고 재생하게 만드는 순서다. 키 값은 이 문서에 적지 않는다. 값은 Vercel 환경변수와 비밀번호 저장소에만 둔다.

대시보드 주소는 [https://dash.bunny.net](https://dash.bunny.net)이다. 화면 이름은 2026-11-27에 연 공식 문서를 기준으로 적었다. 문서를 열지 못한 이름은 "미확인"이다.

## 1. 계정

1. [로그인 페이지](https://dash.bunny.net)에서 결제한 bunny.net 계정으로 들어간다.
2. 비밀번호를 잊었으면 로그인 페이지의 Forgot Password를 쓴다. 출처: [Change Password](https://bunny.net/docs/account/change-password).

## 2. Stream 라이브러리

라이브러리 하나가 강의 영상, 플레이어, 화질, 보안을 같이 가진다.

1. 대시보드에서 Delivery > Stream으로 간다.
2. Create Your first Video Library를 누른다.
3. 이름을 적는다. 운영에서 알아볼 이름이면 된다.
4. Choose storage regions에서 지역을 고르고 Add Video Library를 누른다.

출처: [Quickstart](https://bunny.net/docs/stream/quickstart).

지역:

- CLI 문서는 기본 저장 지역이 항상 DE라고 적는다. 복제 지역 코드는 UK, SE, NY, LA, SG, SYD, BR, JH다. SG, LA, NY가 미리 선택되는 예시다.
- 복제 지역은 한 번 켜면 빼지 못한다. Quickstart의 경고와 같다.
- 권장: DE는 그대로 두고, 복제는 SG만 켠다. 문서에 나온 코드 가운데 한국에 가장 가까운 곳이 SG다. 나머지 지역은 켜지 않는다.
- 대시보드가 코드 대신 도시 이름을 보여 주면 싱가포르만 추가한다. 코드와 도시 이름의 화면 대응은 이번 조회에서 확인하지 못했다. 미확인.
- 지역 코드 출처: [bunny stream CLI](https://bunny.net/docs/cli/commands/stream).

화질은 영상을 올리기 전에 Encoding에서 정한다. 나중에 바꿔도 이미 올린 영상에는 적용되지 않는다.

1. Stream > Your Library > Encoding을 연다.
2. Enabled resolutions는 360p, 720p, 1080p만 켠다. 비트레이트 숫자는 누르지 않고 미리 맞춰 둔 값을 쓴다.
3. Keep original files, Enable Early-Play, Enable MP4 Fallback, Enable Content Tagging, Watermark는 끈다. Early-Play는 원본 주소가 공개될 수 있다. 원본 보관과 MP4 폴백, 해상도를 늘리면 저장 용량이 커진다.

출처: [Free Encoding](https://bunny.net/docs/stream/encoding).

## 3. 플레이어

앱이 이어보기를 `lecture_progress`에 저장한다. Bunny 플레이어의 이어보기는 끈다.

1. Stream > 라이브러리의 Player 구역을 연다.
2. Resumable Player를 끈다.
3. Enable legacy player는 끄고 둔다. 재생 주소는 `player.mediadelivery.net`이다.

Player와 Player Settings라는 이름이 문서마다 다르다. Player에서 Resumable Player가 없으면 Player Settings를 연다.

출처:

- [Dashboard](https://bunny.net/docs/stream/dashboard)의 Player, Resumable Player
- [Player customization](https://bunny.net/docs/stream/player-settings)의 Resumable Player
- [Bunny Player](https://bunny.net/docs/stream/player)의 Player Settings, Enable legacy player

임베드 토큰은 1차에서 끈다. 앱의 재생 주소는 토큰 쿼리가 없는 임베드다. 지금 켜면 403이 난다.

1. 라이브러리의 Security 페이지를 연다.
2. Embed view token authentication을 끈다. Dashboard 문서는 같은 구역을 Security, 기능을 Token Authentication이라고 부른다.
3. CDN token authentication과 Block Direct URL File Access도 1차에서는 켜지 않는다. 허용 도메인 없이 Block Direct URL File Access만 켜면 썸네일과 미리보기가 403이 될 수 있다.

출처:

- [Sign Bunny Player embed URLs](https://bunny.net/docs/stream/player/signed-embeds)
- [Embedded view token authentication](https://bunny.net/docs/stream/token-authentication)
- [Dashboard](https://bunny.net/docs/stream/dashboard)의 Security

## 4. 웹훅

1. Stream > Your Library > API를 연다.
2. Webhook URL에 아래 주소를 그대로 넣는다.

```text
https://angelsaju.com/api/lectures/bunny-webhook
```

미리보기 주소는 배포마다 바뀌므로 웹훅에 넣지 않는다. 서명 확인에 쓰는 값은 라이브러리의 Read-Only API key다.

출처: [Dashboard](https://bunny.net/docs/stream/dashboard)의 API, Webhook URL. [Webhooks](https://bunny.net/docs/stream/webhooks).

## 5. 키를 찾는 곳

값을 문서, 채팅, 깃에 붙이지 않는다. 각 칸의 복사 버튼으로 Vercel에만 넣는다.

| 환경변수                        | 넣는 값            | 찾는 곳                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LECTURE_VIDEO_PROVIDER`        | `bunny`            | 키 아님. 이 글자 그대로                                                                                                                                                                                                                                                                                                               |
| `BUNNY_STREAM_LIBRARY_ID`       | Video library ID   | Stream > 라이브러리 > API. [Authentication](https://bunny.net/docs/stream/authentication)                                                                                                                                                                                                                                             |
| `BUNNY_STREAM_API_KEY`          | 라이브러리 Api Key | 같은 API 화면의 Api Key. 계정 키가 아니다                                                                                                                                                                                                                                                                                             |
| `BUNNY_STREAM_READONLY_API_KEY` | Read-Only API key  | 웹훅 서명 비밀. API 필드 이름은 ReadOnlyApiKey. [Get Video Library](https://bunny.net/docs/api-reference/core/stream-video-library/get-video-library), [Webhooks](https://bunny.net/docs/stream/webhooks). 대시보드에서 그 칸의 화면 이름은 미확인. CLI는 `bunny stream libraries credentials <라이브러리> --read-only --show-secret` |
| `BUNNY_ACCOUNT_API_KEY`         | 계정 API 키        | 문서가 Account > API와 Account > API Key로 나뉜다. Account의 API 항목을 연다. [API quickstart](https://bunny.net/docs/api-reference/quickstart), [API Keys](https://bunny.net/docs/account/api-keys)                                                                                                                                  |
| `LECTURE_STORAGE_LIMIT_BYTES`   | 바이트 단위 정수   | 직접 정한다. 비우면 관리자 카드는 한도 미설정이다. 예시일 뿐이며 운영 한도가 아니다. 100GB를 십진으로 적으면 `100000000000`                                                                                                                                                                                                           |
| `CRON_SECRET`                   | 긴 임의 문자열     | 직접 만든다. 용량 점검 크론이 이 값으로 호출된다                                                                                                                                                                                                                                                                                      |

`BUNNY_ACCOUNT_API_KEY`는 계정 전체 권한이다. `BUNNY_STREAM_API_KEY`와 바꾸지 않는다. 토큰 인증 키(Security의 Token authentication key)도 위 표의 키가 아니다. 1차에서는 쓰지 않는다.

## 6. Vercel에 넣기

운영과 미리보기는 같은 Supabase를 쓴다. 환경변수는 두 곳 모두 채우되, 영상 1개 확인은 운영 주소에서 한다.

1. Vercel 프로젝트의 Settings → Environment Variables를 연다.
2. 위 표를 하나씩 추가한다. Production과 Preview를 둘 다 켠다.
3. 저장만으로는 이미 배포된 서버가 새 값을 읽지 않는다. Deployments에서 Production과 Preview를 각각 Redeploy한다.
4. `LECTURE_VIDEO_PROVIDER`가 `bunny`가 아니면 업로드는 모형 저장소로 간다. 웹훅과 용량이 Bunny와 맞지 않는다.

## 7. 영상 1개로 확인

웹훅이 `https://angelsaju.com`으로만 오므로 확인은 운영 사이트에서 한다. 미리보기에서 올려도 같은 데이터베이스에 남는다. 테스트 영상은 한 번만 올린다.

1. 업로드. 선생님 계정으로 짧은 mp4 차시 하나를 올린다. 상태가 업로드 중으로 바뀌는지 본다.
2. 변환. Bunny Encoding이 끝나면 상태가 변환 중을 지나 공개 가능이 된다. 웹훅 Status 3이 공개 가능이다.
3. 웹훅. 공개 가능으로 바뀌면 `https://angelsaju.com/api/lectures/bunny-webhook`이 서명을 통과해 상태를 기록한 것이다. 미리보기 배포는 이 주소를 받지 않는다.
4. 재생. 공개 가능 차시가 임베드 플레이어로 재생된다. 임베드 토큰을 켜 두었다면 이 단계에서 403이 난다. 3장대로 끄고 Redeploy한 뒤 다시 본다.
5. 이어서 보기. 중간까지 본 뒤 나갔다가 같은 회원으로 다시 연다. 앱이 저장한 위치부터 이어진다. Resumable Player는 꺼져 있어야 한다.
6. 삭제. 그 차시를 삭제한다. 영상 파일도 같이 지워지고 되돌릴 수 없다.
7. 용량. 관리자 `/admin/lectures` 위쪽 영상 저장소 카드에 사용량과 한도가 보인다. 한도가 비어 있으면 "한도 미설정"이다. 사용률이 80% 이상이면 경고 문구가 보이고, 80% 알림을 남긴 시각이 있으면 그 시각이 보인다. 카드 숫자는 한국 시간 03:00 점검이 끝난 뒤에 바뀐다. 점검 경로는 `/api/lectures/storage-check`이고 Vercel Cron이 `CRON_SECRET`으로 호출한다. 마지막 점검 시각은 데이터베이스에 칸이 없어 카드에는 "기록 없음"으로 나온다.

용량이 계속 0이면 `BUNNY_ACCOUNT_API_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `CRON_SECRET`이 Production에 있는지, 그리고 Redeploy를 했는지 확인한다.
