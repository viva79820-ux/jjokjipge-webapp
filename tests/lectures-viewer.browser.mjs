// 격리된 HTTP 모형이다. 운영 데이터베이스와 비밀값은 쓰지 않는다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { browser, delay, stop, until } from "./notices-browser-tools.mjs";

const teacherId = "11111111-1111-4111-8111-111111111111";
const lectureId = "44444444-4444-4444-8444-444444444444";
const hiddenId = "55555555-5555-4555-8555-555555555555";
const tarotId = "66666666-6666-4666-8666-666666666666";
const emptyId = "77777777-7777-4777-8777-777777777777";
const lessonA = "33333333-3333-4333-8333-333333333331";
const lessonB = "33333333-3333-4333-8333-333333333332";
const lessonC = "33333333-3333-4333-8333-333333333333";
const lessonHidden = "33333333-3333-4333-8333-333333333334";
const offlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const onlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

let showLecture = false;
let lectureWrites = 0;

const classes = [
  {
    id: offlineId,
    title: "테스트 오프라인 과정",
    description: "오프라인 수업 설명입니다.",
    field: "saju",
    video_url: null,
    is_online: false,
    is_published: true,
    poster_path: null,
    poster_alt: null,
    sort_order: 1,
    created_at: "2026-11-20T00:00:00.000000+00:00",
    updated_at: "2026-11-20T00:00:00.000000+00:00",
  },
  {
    id: onlineId,
    title: "테스트 온라인 과정",
    description: "온라인 수업 설명입니다.",
    field: "tarot",
    video_url: "https://videos.example/class-online",
    is_online: true,
    is_published: true,
    poster_path: null,
    poster_alt: null,
    sort_order: 2,
    created_at: "2026-11-20T01:00:00.000000+00:00",
    updated_at: "2026-11-20T01:00:00.000000+00:00",
  },
];

function lectureRows() {
  return [
    {
      id: lectureId,
      teacher_id: teacherId,
      title: "테스트 사주 강의",
      description: "무료로 볼 수 있는 사주 강의입니다.",
      thumbnail_path: null,
      field: "saju",
      is_published: showLecture,
      view_count: 7,
      created_at: "2026-11-26T01:00:00.000000+00:00",
      updated_at: "2026-11-26T01:00:00.000000+00:00",
    },
    {
      id: hiddenId,
      teacher_id: teacherId,
      title: "테스트 비공개 강의",
      description: "비공개 소개",
      thumbnail_path: null,
      field: "saju",
      is_published: false,
      view_count: 3,
      created_at: "2026-11-26T02:00:00.000000+00:00",
      updated_at: "2026-11-26T02:00:00.000000+00:00",
    },
    {
      id: tarotId,
      teacher_id: teacherId,
      title: "테스트 타로 강의",
      description: "무료 타로 강의입니다.",
      thumbnail_path: null,
      field: "tarot",
      is_published: showLecture,
      view_count: 2,
      created_at: "2026-11-26T00:00:00.000000+00:00",
      updated_at: "2026-11-26T00:00:00.000000+00:00",
    },
    {
      id: emptyId,
      teacher_id: teacherId,
      title: "테스트 차시없음",
      description: "재생할 차시가 없습니다.",
      thumbnail_path: null,
      field: "saju",
      is_published: true,
      view_count: 1,
      created_at: "2026-11-26T03:00:00.000000+00:00",
      updated_at: "2026-11-26T03:00:00.000000+00:00",
    },
  ];
}

function lessonRows() {
  return [
    {
      id: lessonA,
      lecture_id: lectureId,
      teacher_id: teacherId,
      title: "1강 기초",
      sort_order: 0,
      provider: "mock",
      provider_video_id: "video-1",
      status: "ready",
      duration_seconds: 120,
    },
    {
      id: lessonB,
      lecture_id: lectureId,
      teacher_id: teacherId,
      title: "2강 실전",
      sort_order: 1,
      provider: "mock",
      provider_video_id: "video-2",
      status: "ready",
      duration_seconds: 90,
    },
    {
      id: lessonC,
      lecture_id: lectureId,
      teacher_id: teacherId,
      title: "3강 정리",
      sort_order: 2,
      provider: "mock",
      provider_video_id: "video-3",
      status: "ready",
      duration_seconds: 80,
    },
    {
      id: lessonHidden,
      lecture_id: lectureId,
      teacher_id: teacherId,
      title: "숨은 변환중",
      sort_order: 3,
      provider: "mock",
      provider_video_id: "video-4",
      status: "processing",
      duration_seconds: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333335",
      lecture_id: tarotId,
      teacher_id: teacherId,
      title: "타로 1강",
      sort_order: 0,
      provider: "mock",
      provider_video_id: "video-5",
      status: "ready",
      duration_seconds: 60,
    },
    {
      id: "33333333-3333-4333-8333-333333333336",
      lecture_id: emptyId,
      teacher_id: teacherId,
      title: "준비중 차시",
      sort_order: 0,
      provider: "mock",
      provider_video_id: "video-6",
      status: "processing",
      duration_seconds: null,
    },
  ];
}

function roleOf(request) {
  const authorization = request.headers.authorization || "";
  const apiKey = request.headers.apikey || "";
  if (
    authorization === "Bearer fixture-secret" ||
    apiKey === "fixture-secret"
  ) {
    return "service";
  }
  return "anon";
}

function publishedLectureIds() {
  return new Set(
    lectureRows()
      .filter((row) => row.is_published)
      .map((row) => row.id),
  );
}

function visibleRows(table, role) {
  if (table === "classes") {
    return classes.filter((row) => role === "service" || row.is_published);
  }
  if (table === "lectures") {
    return lectureRows().filter(
      (row) => role === "service" || row.is_published,
    );
  }
  if (table === "lecture_lessons") {
    const published = publishedLectureIds();
    return lessonRows().filter(
      (row) =>
        role === "service" ||
        (row.status === "ready" && published.has(row.lecture_id)),
    );
  }
  if (table === "profiles") {
    if (role !== "service") return [];
    return [{ id: teacherId, name: "선생님 A" }];
  }
  if (table === "lecture_progress") return [];
  return [];
}

function matches(row, params) {
  for (const [key, value] of params) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    if (value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    } else if (value.startsWith("in.(") && value.endsWith(")")) {
      const list = value
        .slice(4, -1)
        .split(",")
        .map((item) => item.trim().replaceAll('"', ""));
      if (!list.includes(String(row[key]))) return false;
    }
  }
  return true;
}

function sortRows(rows, order) {
  if (!order) return rows;
  const parts = order.split(",");
  return [...rows].sort((left, right) => {
    for (const part of parts) {
      const [column, direction] = part.split(".");
      if (left[column] === right[column]) continue;
      const compared = left[column] > right[column] ? 1 : -1;
      return direction === "desc" ? -compared : compared;
    }
    return 0;
  });
}

function send(response, body, total, offset = 0) {
  const list = Array.isArray(body) ? body : [body];
  response.statusCode = 200;
  if (Array.isArray(body)) {
    response.setHeader(
      "content-range",
      list.length
        ? `${offset}-${offset + list.length - 1}/${total}`
        : `*/${total}`,
    );
  }
  response.end(JSON.stringify(body));
}

const fixture = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://fixture.invalid");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    response.writeHead(401);
    response.end(JSON.stringify({ message: "no user" }));
    return;
  }
  if (!url.pathname.startsWith("/rest/v1/")) {
    response.writeHead(404);
    response.end("{}");
    return;
  }
  const table = url.pathname.split("/").at(-1);
  if (
    table === "lectures" &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    lectureWrites += 1;
  }
  const rows = sortRows(
    visibleRows(table, roleOf(request)).filter((row) =>
      matches(row, url.searchParams),
    ),
    url.searchParams.get("order"),
  );
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = url.searchParams.get("limit");
  const page =
    limit == null ? rows : rows.slice(offset, offset + Number(limit));
  if (request.method === "HEAD") {
    response.setHeader("content-range", `*/${total}`);
    response.end();
    return;
  }
  send(response, page, total, offset);
});

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const appPort = 4392;
const base = `http://127.0.0.1:${appPort}`;
const shotDir = join(process.cwd(), "tmp", "lectures-viewer");
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  LECTURE_VIDEO_PROVIDER: "mock",
  LECTURE_VIEWER_DIST: "tmp/lectures-viewer-next",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
};
const logs = [];
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ],
  {
    env,
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
for (const stream of [app.stdout, app.stderr]) {
  stream?.on("data", (chunk) => {
    logs.push(String(chunk));
    if (logs.join("").length > 200000) logs.shift();
  });
}
let page;
try {
  mkdirSync(shotDir, { recursive: true });
  await until(
    async () => {
      try {
        const response = await fetch(`${base}/class`);
        if (!response.ok) {
          const text = await response.text();
          writeFileSync(join(shotDir, "class-error.html"), text);
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    "lecture viewer app",
    180000,
  );
  page = await browser();
  await page.call("Network.setCacheDisabled", { cacheDisabled: true });
  const emulate = async (width, fine) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: !fine,
    });
    await page.call("Emulation.setTouchEmulationEnabled", {
      enabled: !fine,
      maxTouchPoints: fine ? 1 : 5,
    });
    await page.call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: fine
        ? [
            { name: "hover", value: "hover" },
            { name: "pointer", value: "fine" },
          ]
        : [
            { name: "hover", value: "none" },
            { name: "pointer", value: "coarse" },
          ],
    });
    await delay(200);
  };
  const text = (value) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(value)})`,
        ),
      value,
    );
  const absent = async (value) => {
    assert.equal(
      await page.evaluate(
        `document.body.innerText.includes(${JSON.stringify(value)})`,
      ),
      false,
      value,
    );
  };
  const shot = async (name) => {
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const metrics = () =>
    page.evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      return {
        app: Math.round(shell.getBoundingClientRect().width),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    })()`);
  const open = async (path) => {
    await page.go(`${base}${path}`);
  };

  await emulate(360, false);
  await open("/class");
  await text("테스트 오프라인 과정");
  await text("테스트 온라인 과정");
  await text("오프라인");
  await text("온라인");
  await absent("테스트 사주 강의");
  await absent("테스트 비공개 강의");
  await absent("테스트 차시없음");
  await absent("등록된 클래스가 없습니다.");
  let box = await metrics();
  assert.equal(box.fine, false);
  assert.equal(box.app, 360);
  assert.equal(box.overflow, false);
  await shot("class-empty-360.png");
  await emulate(1280, true);
  await open("/class");
  await text("테스트 오프라인 과정");
  box = await metrics();
  assert.equal(box.fine, true);
  assert.equal(box.app, 560);
  assert.equal(box.overflow, false);
  await shot("class-empty-pc560.png");

  showLecture = true;
  await emulate(360, false);
  await open("/class");
  await text("테스트 사주 강의");
  await text("선생님 A");
  await text("차시 3개");
  await text("조회 7");
  await text("테스트 타로 강의");
  await text("차시 1개");
  await text("테스트 오프라인 과정");
  await absent("테스트 비공개 강의");
  await absent("테스트 차시없음");
  await absent("숨은 변환중");
  box = await metrics();
  assert.equal(box.app, 360);
  assert.equal(box.overflow, false);
  await shot("class-list-360.png");
  await emulate(1280, true);
  await open("/class");
  await text("테스트 사주 강의");
  box = await metrics();
  assert.equal(box.app, 560);
  assert.equal(box.overflow, false);
  await shot("class-list-pc560.png");

  await open("/class?field=tarot");
  await text("테스트 타로 강의");
  await text("테스트 온라인 과정");
  await absent("테스트 사주 강의");
  await absent("테스트 오프라인 과정");

  await emulate(360, false);
  await open(`/class/lectures/${lectureId}`);
  await text("테스트 사주 강의");
  await text("선생님 A");
  await text("조회 7");
  await text("영상 미리보기(모형)");
  await text("1강 기초");
  await text("2강 실전");
  await text("3강 정리");
  await absent("숨은 변환중");
  assert.equal(
    await page.evaluate(
      `document.querySelector("button[aria-current='true']")?.textContent?.includes("1강 기초")`,
    ),
    true,
  );
  box = await metrics();
  assert.equal(box.app, 360);
  assert.equal(box.overflow, false);
  await shot("lecture-detail-360.png");
  await page.evaluate(
    `[...document.querySelectorAll("button")].find((button) => button.textContent.includes("2강 실전")).click()`,
  );
  await until(
    () =>
      page.evaluate(
        `document.querySelector("button[aria-current='true']")?.textContent?.includes("2강 실전")`,
      ),
    "2강 실전",
  );
  await text("영상 미리보기(모형)");

  await emulate(1280, true);
  await open(`/class/lectures/${lectureId}`);
  await text("3강 정리");
  box = await metrics();
  assert.equal(box.fine, true);
  assert.equal(box.app, 560);
  assert.equal(box.overflow, false);
  await shot("lecture-detail-pc560.png");

  await open(`/class/lectures/${hiddenId}`);
  await text("강의를 찾을 수 없습니다.");
  await open("/class/lectures/not-a-uuid");
  await text("강의를 찾을 수 없습니다.");
  assert.equal(lectureWrites, 0);
  assert.equal(lectureRows().find((row) => row.id === lectureId).view_count, 7);
  console.log("PASS lectures viewer");
  console.log(shotDir);
} catch (error) {
  mkdirSync(shotDir, { recursive: true });
  writeFileSync(join(shotDir, "dev-log.txt"), logs.join("").slice(-12000));
  throw error;
} finally {
  try {
    await page?.close();
  } catch {}
  stop(app);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
