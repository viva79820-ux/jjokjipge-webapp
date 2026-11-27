// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, stop, until } from "./notices-browser-tools.mjs";
import { formatStorageTime } from "../lib/lectures/storage-view.ts";

const teacherId = "11111111-1111-4111-8111-111111111111";
const adminId = "33333333-3333-4333-8333-333333333333";
const lectureId = "44444444-4444-4444-8444-444444444444";
const people = {
  [teacherId]: {
    id: teacherId,
    email: "teacher@example.invalid",
    name: "선생님 A",
    role: "user",
  },
  [adminId]: {
    id: adminId,
    email: "admin@example.invalid",
    name: "관리자",
    role: "admin",
  },
};
const lectures = [
  {
    id: lectureId,
    teacher_id: teacherId,
    title: "테스트 사주 강의",
    description: "무료로 공개할 소개입니다. 차시는 보기만 합니다.",
    thumbnail_path: null,
    field: "saju",
    is_published: true,
    view_count: 4,
    created_at: "2026-11-25T01:00:00.000000+00:00",
    updated_at: "2026-11-25T01:00:00.000000+00:00",
  },
];
const lessons = [
  {
    id: "55555555-5555-4555-8555-555555555551",
    title: "1강 기초",
    sort_order: 0,
    status: "ready",
    duration_seconds: 90,
    storage_bytes: 120_000_000,
  },
  {
    id: "55555555-5555-4555-8555-555555555552",
    title: "2강 실습",
    sort_order: 1,
    status: "processing",
    duration_seconds: null,
    storage_bytes: null,
  },
  {
    id: "55555555-5555-4555-8555-555555555553",
    title: "3강 정리",
    sort_order: 2,
    status: "failed",
    duration_seconds: null,
    storage_bytes: 0,
  },
];
let storageRow = null;

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
    const wanted = listedIds(url, "id");
    const rows = Object.values(people)
      .filter((person) => wanted.length === 0 || wanted.includes(person.id))
      .map((person) =>
        project({ id: person.id, name: person.name, role: person.role }, url),
      );
    if (object && rows.length !== 1) return missing(response);
    return send(response, object ? rows[0] : rows, object);
  }
  if (table === "lectures") {
    let rows = lectures.filter((row) => {
      const id = eq(url, "id");
      return !id || row.id === id;
    });
    if (actor?.role !== "admin") rows = [];
    if (object && rows.length !== 1) return missing(response);
    return send(
      response,
      object ? project(rows[0], url) : rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_lessons") {
    if (actor?.role !== "admin") {
      if (object) return missing(response);
      return send(response, [], false);
    }
    const lecture = eq(url, "lecture_id");
    const rows = lecture ? lessons : [];
    return send(
      response,
      rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_storage_state") {
    if (actor?.role !== "admin" || !storageRow) {
      if (object) return missing(response);
      return send(response, [], false);
    }
    const projected = project(storageRow, url);
    return send(response, object ? projected : [projected], object);
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

function listedIds(url, key) {
  const value = url.searchParams.get(key) || "";
  if (value.startsWith("eq.")) return [value.slice(3)];
  if (value.startsWith("in.(") && value.endsWith(")")) {
    return value.slice(4, -1).split(",").filter(Boolean);
  }
  return [];
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
const appPort = 4391;
const base = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
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
    "lecture admin app",
    180000,
  );
  page = await browser();
  const session = {
    access_token: tokenFor(adminId),
    refresh_token: "mock-only",
    user: {
      id: adminId,
      email: people[adminId].email,
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
  const absent = async (text) => {
    assert.equal(
      await page.evaluate(
        `document.body.innerText.includes(${JSON.stringify(text)})`,
      ),
      false,
      text,
    );
  };
  const shotDir = "tmp/lectures-admin-storage";
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
  const alerted = formatStorageTime("2026-11-27T03:00:00.000Z");
  const states = [
    [
      "empty",
      null,
      ["사용량 기록이 없어요.", "마지막 점검", "기록 없음"],
      ["50%", "85%"],
    ],
    [
      "half",
      {
        id: 1,
        used_bytes: 500_000_000,
        limit_bytes: 1_000_000_000,
        alerted_80_at: null,
      },
      ["50%", "500MB", "1GB", "마지막 점검", "기록 없음"],
      ["저장 용량이 한도의 80% 이상이에요.", "80% 알림"],
    ],
    [
      "high",
      {
        id: 1,
        used_bytes: 850_000_000,
        limit_bytes: 1_000_000_000,
        alerted_80_at: "2026-11-27T03:00:00.000Z",
      },
      ["85%", "저장 용량이 한도의 80% 이상이에요.", "80% 알림", alerted],
      [],
    ],
  ];
  for (const [viewport, suffix, shell] of [
    [360, "360", 360],
    [1200, "560", 560],
  ]) {
    await width(viewport);
    for (const [name, row, texts, missingTexts] of states) {
      storageRow = row;
      await page.go(`${base}/admin/lectures`);
      for (const text of texts) await contains(text);
      await contains("테스트 사주 강의");
      await contains("차시 보기");
      await contains("비공개로 바꾸기");
      for (const text of missingTexts) await absent(text);
      await noOverflow();
      await shellWidth(shell);
      await screenshot(`${name}-${suffix}.png`);
    }
    await page.go(`${base}/admin/lectures/${lectureId}`);
    for (const text of [
      "테스트 사주 강의",
      "선생님 A",
      "사주",
      "무료로 공개할 소개입니다.",
      "비공개로 바꾸기",
      "1강 기초",
      "순서 1",
      "공개 가능",
      "1분 30초",
      "120MB",
      "2강 실습",
      "변환 중",
      "길이 없음",
      "용량 없음",
      "3강 정리",
      "실패",
      "0B",
    ]) {
      await contains(text);
    }
    assert.equal(
      await page.evaluate("document.querySelectorAll('main form').length"),
      1,
    );
    await noOverflow();
    await shellWidth(shell);
    await screenshot(`detail-${suffix}.png`);
  }
  console.log("PASS lecture admin storage screens at 360 and PC 560");
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
