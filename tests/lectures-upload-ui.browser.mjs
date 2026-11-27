// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, stop, until } from "./notices-browser-tools.mjs";

const teacherId = "11111111-1111-4111-8111-111111111111";
const emptyId = "55555555-5555-4555-8555-555555555555";
const uploadingId = "66666666-6666-4666-8666-666666666666";
const processingId = "77777777-7777-4777-8777-777777777777";
const readyId = "88888888-8888-4888-8888-888888888888";
const failedId = "99999999-9999-4999-8999-999999999999";
const lecture = (id, title, published, views, created) => ({
  id,
  teacher_id: teacherId,
  title,
  description: "무료로 공개할 소개입니다.",
  thumbnail_path: null,
  field: "saju",
  is_published: published,
  view_count: views,
  created_at: created,
  updated_at: created,
});
const lectures = [
  lecture(
    emptyId,
    "차시 없는 강의",
    false,
    0,
    "2026-11-27T05:00:00.000000+00:00",
  ),
  lecture(
    uploadingId,
    "업로드 중 강의",
    true,
    3,
    "2026-11-27T04:00:00.000000+00:00",
  ),
  lecture(
    processingId,
    "변환 중 강의",
    true,
    8,
    "2026-11-27T03:00:00.000000+00:00",
  ),
  lecture(
    readyId,
    "공개 가능 강의",
    true,
    12,
    "2026-11-27T02:00:00.000000+00:00",
  ),
  lecture(failedId, "실패한 강의", true, 1, "2026-11-27T01:00:00.000000+00:00"),
];
const lessons = [
  {
    id: "66666666-6666-4666-8666-666666666661",
    lecture_id: uploadingId,
    teacher_id: teacherId,
    title: "1강 올리기",
    sort_order: 0,
    status: "uploading",
    duration_seconds: null,
  },
  {
    id: "77777777-7777-4777-8777-777777777771",
    lecture_id: processingId,
    teacher_id: teacherId,
    title: "2강 변환",
    sort_order: 0,
    status: "processing",
    duration_seconds: null,
  },
  {
    id: "88888888-8888-4888-8888-888888888881",
    lecture_id: readyId,
    teacher_id: teacherId,
    title: "3강 정리",
    sort_order: 0,
    status: "ready",
    duration_seconds: 90,
  },
  {
    id: "99999999-9999-4999-8999-999999999991",
    lecture_id: failedId,
    teacher_id: teacherId,
    title: "4강 실패",
    sort_order: 0,
    status: "failed",
    duration_seconds: null,
  },
];
const people = {
  [teacherId]: {
    id: teacherId,
    email: "teacher@example.invalid",
    name: "선생님 A",
    role: "user",
  },
};

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const tokenFor = (id) => {
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({
    sub: id,
    email: people[id].email,
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const signature = createHmac("sha256", "mock-only")
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
};
const actorFrom = (request) => {
  const header = request.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString());
    return people[payload.sub] || null;
  } catch {
    return null;
  }
};

const fixture = createServer((request, response) =>
  handle(request, response).catch((error) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: error.message }));
  }),
);

async function handle(request, response) {
  const url = new URL(request.url, "http://fixture.invalid");
  const actor = actorFrom(request);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,OPTIONS",
  );
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (!actor) {
      response.writeHead(401);
      response.end(JSON.stringify({ message: "no user" }));
      return;
    }
    response.end(
      JSON.stringify({
        id: actor.id,
        aud: "authenticated",
        role: "authenticated",
        email: actor.email,
        email_confirmed_at: "2026-11-01T00:00:00.000Z",
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/auth/")) {
    response.end("{}");
    return;
  }
  const table = url.pathname.split("/").at(-1);
  const object = request.headers.accept?.includes("object+json");
  if (table === "profiles") {
    const row = actor
      ? { id: actor.id, name: actor.name, role: actor.role, phone: null }
      : null;
    if (!row && object) return missing(response);
    return send(response, object ? row : row ? [row] : [], object);
  }
  if (table === "teachers") {
    const rows =
      actor?.id === teacherId
        ? [
            {
              user_id: teacherId,
              granted_by: teacherId,
              granted_at: "2026-11-25T00:00:00.000000+00:00",
            },
          ]
        : [];
    if (!rows.length && object) return missing(response);
    return send(
      response,
      rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_upload_consents") {
    const rows = actor
      ? [
          {
            user_id: actor.id,
            agreed_at: "2026-11-25T00:00:00.000000+00:00",
            statement: "본인이 권리를 가진 영상만 올린다",
          },
        ]
      : [];
    if (!rows.length && object) return missing(response);
    return send(response, object ? rows[0] : rows, object);
  }
  if (table === "lectures") {
    let rows = lectures.filter((row) => {
      const teacher = eq(url, "teacher_id");
      const id = eq(url, "id");
      return (!teacher || row.teacher_id === teacher) && (!id || row.id === id);
    });
    if (actor?.id !== teacherId) rows = [];
    if (!rows.length && object) return missing(response);
    if (object) return send(response, project(rows[0], url), true);
    return send(
      response,
      rows.map((row) => project(row, url)),
      false,
    );
  }
  if (table === "lecture_lessons") {
    let rows = lessons.filter((row) => row.teacher_id === actor?.id);
    const teacher = eq(url, "teacher_id");
    if (teacher) rows = rows.filter((row) => row.teacher_id === teacher);
    if (!rows.length && object) return missing(response);
    return send(
      response,
      rows.map((row) => project(row, url)),
      object,
    );
  }
  response.setHeader("content-range", "*/0");
  response.end(object ? "null" : "[]");
}

function eq(url, key) {
  const value = url.searchParams.get(key) || "";
  return value.startsWith("eq.") ? value.slice(3) : "";
}

function project(row, url) {
  if (!row) return row;
  const select = url.searchParams.get("select");
  if (!select || select === "*") return row;
  return Object.fromEntries(
    select.split(",").map((column) => [column, row[column]]),
  );
}

function send(response, rows, object) {
  if (object) {
    response.end(JSON.stringify(rows ?? null));
    return;
  }
  const list = Array.isArray(rows) ? rows : [rows];
  response.setHeader(
    "content-range",
    `0-${Math.max(list.length - 1, 0)}/${list.length}`,
  );
  response.end(JSON.stringify(list));
}

function missing(response) {
  response.writeHead(406);
  response.end(
    JSON.stringify({
      code: "PGRST116",
      details: "The result contains 0 rows",
      message: "Cannot coerce the result to a single JSON object",
    }),
  );
}

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const appPort = 4373;
const base = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  LECTURE_VIDEO_PROVIDER: "mock",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
};
let app;
let page;
let logs = "";
try {
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const keep = (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000);
  };
  app.stdout?.on("data", keep);
  app.stderr?.on("data", keep);
  await until(
    async () => {
      try {
        return (await fetch(`${base}/login`)).ok;
      } catch {
        return false;
      }
    },
    "lecture upload app",
    180000,
  );
  page = await browser();
  const session = {
    access_token: tokenFor(teacherId),
    refresh_token: "mock-only",
    user: {
      id: teacherId,
      email: people[teacherId].email,
      aud: "authenticated",
      role: "authenticated",
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  };
  await page.call("Network.setCookie", {
    name: "sb-127-auth-token",
    value: `base64-${encode(session)}`,
    url: base,
    path: "/",
  });
  const width = async (value) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: value,
      height: 8000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  };
  const contains = (text) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(text)})`,
        ),
      text,
      90000,
    );
  const shotDir = "tmp/lectures-upload-ui";
  mkdirSync(shotDir, { recursive: true });
  const screenshot = async (name) => {
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const noOverflow = async () => {
    assert.equal(
      await page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
      true,
    );
  };
  const shellWidth = async (expected) => {
    const actual = await page.evaluate(
      "Math.round(document.querySelector('[data-app-shell]').getBoundingClientRect().width)",
    );
    assert.equal(actual, expected);
  };
  const pages = [
    [
      "/mypage/lectures",
      "list",
      ["차시 없는 강의", "업로드 중 1", "변환 중 1", "실패 1", "차시 0"],
    ],
    [
      `/mypage/lectures/${emptyId}`,
      "empty",
      ["등록된 차시가 없어요.", "차시 올리기"],
    ],
    [
      `/mypage/lectures/${uploadingId}`,
      "uploading",
      ["1강 올리기", "업로드 중"],
    ],
    [`/mypage/lectures/${processingId}`, "processing", ["2강 변환", "변환 중"]],
    [
      `/mypage/lectures/${readyId}`,
      "ready",
      ["3강 정리", "공개 가능", "1분 30초"],
    ],
    [`/mypage/lectures/${failedId}`, "failed", ["4강 실패", "실패"]],
  ];
  for (const [viewport, suffix, shell] of [
    [360, "360", 360],
    [1200, "560", 560],
  ]) {
    await width(viewport);
    for (const [path, name, texts] of pages) {
      await page.go(`${base}${path}`);
      for (const text of texts) await contains(text);
      await noOverflow();
      await shellWidth(shell);
      await screenshot(`${name}-${suffix}.png`);
    }
  }
  await width(360);
  await page.go(`${base}/mypage/lectures/${failedId}`);
  await contains("4강 실패");
  await page.button("삭제");
  await contains("영상 파일도 함께 지워지고 되돌릴 수 없어요.");
  await page.evaluate(
    `(() => { const dialog = document.querySelector("dialog"); const cancel = Array.from(dialog.querySelectorAll("button")).find((button) => button.textContent.trim() === "취소"); cancel.click(); })()`,
  );
  await contains("4강 실패");
  assert.equal(
    await page.evaluate("document.querySelector('dialog') == null"),
    true,
  );
  console.log("PASS lecture upload screens at 360 and PC 560");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  try {
    await page?.close();
  } catch {}
  stop(app);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
