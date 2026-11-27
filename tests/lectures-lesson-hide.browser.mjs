// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, stop, until } from "./notices-browser-tools.mjs";

const teacherId = "11111111-1111-4111-8111-111111111111";
const adminId = "33333333-3333-4333-8333-333333333333";
const lectureId = "44444444-4444-4444-8444-444444444444";
const visibleLessonId = "55555555-5555-4555-8555-555555555551";
const hiddenLessonId = "55555555-5555-4555-8555-555555555552";
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
const lecture = {
  id: lectureId,
  teacher_id: teacherId,
  title: "테스트 사주 강의",
  description: "차시 하나만 숨기는 소개입니다.",
  thumbnail_path: null,
  field: "saju",
  is_published: true,
  view_count: 4,
  created_at: "2026-11-25T01:00:00.000000+00:00",
  updated_at: "2026-11-25T01:00:00.000000+00:00",
};
const lessons = [
  {
    id: visibleLessonId,
    lecture_id: lectureId,
    teacher_id: teacherId,
    title: "1강 기초",
    sort_order: 0,
    status: "ready",
    duration_seconds: 90,
    storage_bytes: 1200,
    admin_hidden: false,
  },
  {
    id: hiddenLessonId,
    lecture_id: lectureId,
    teacher_id: teacherId,
    title: "2강 숨김",
    sort_order: 1,
    status: "ready",
    duration_seconds: 60,
    storage_bytes: 800,
    admin_hidden: true,
  },
];

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
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : null;
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
  if (table === "teachers") {
    const rows =
      actor?.id === teacherId
        ? [{ user_id: teacherId, granted_by: adminId }]
        : [];
    if (!rows.length && object) return missing(response);
    return send(
      response,
      rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_upload_consents") {
    const rows =
      actor?.id === teacherId
        ? [
            {
              user_id: teacherId,
              agreed_at: "2026-11-25T00:00:00.000000+00:00",
              statement: "본인이 권리를 가진 영상만 올린다",
            },
          ]
        : [];
    if (!rows.length && object) return missing(response);
    return send(response, object ? rows[0] : rows, object);
  }
  if (table === "lectures") {
    let rows = [lecture];
    const id = eq(url, "id");
    const teacher = eq(url, "teacher_id");
    if (id) rows = rows.filter((row) => row.id === id);
    if (teacher) rows = rows.filter((row) => row.teacher_id === teacher);
    if (actor?.role !== "admin" && actor?.id !== teacherId) rows = [];
    if (object && rows.length !== 1) return missing(response);
    return send(
      response,
      object ? project(rows[0], url) : rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_lessons") {
    if (request.method === "PATCH") {
      assert.deepEqual(body, { admin_hidden: true });
      assert.equal(actor?.role, "admin");
      const row = lessons.find(
        (item) =>
          item.id === eq(url, "id") &&
          item.lecture_id === eq(url, "lecture_id") &&
          item.admin_hidden === false,
      );
      if (!row) return missing(response);
      row.admin_hidden = true;
      const payload = { id: row.id, admin_hidden: true };
      return send(response, object ? payload : [payload], object);
    }
    let rows = lessons.slice();
    const id = eq(url, "id");
    const lectureFilter = eq(url, "lecture_id");
    const teacher = eq(url, "teacher_id");
    if (id) rows = rows.filter((row) => row.id === id);
    if (lectureFilter)
      rows = rows.filter((row) => row.lecture_id === lectureFilter);
    if (teacher) rows = rows.filter((row) => row.teacher_id === teacher);
    if (eq(url, "admin_hidden") === "false") {
      rows = rows.filter((row) => row.admin_hidden === false);
    }
    if (actor?.role !== "admin" && actor?.id !== teacherId) rows = [];
    if (object && rows.length !== 1) return missing(response);
    return send(
      response,
      object ? project(rows[0], url) : rows.map((row) => project(row, url)),
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
const appPort = 4397;
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
    "lecture lesson hide app",
    180000,
  );
  page = await browser();
  const sessionFor = (id) => ({
    access_token: tokenFor(id),
    refresh_token: "mock-only",
    user: {
      id,
      email: people[id].email,
      aud: "authenticated",
      role: "authenticated",
    },
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  });
  const signIn = (id) =>
    page.call("Network.setCookie", {
      name: "sb-127-auth-token",
      value: `base64-${encode(sessionFor(id))}`,
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
  const shotDir = "tmp/lectures-lesson-hide";
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
  const cardHas = async (title, text, expected) => {
    const actual = await page.evaluate(
      `(() => { const card = Array.from(document.querySelectorAll("li")).find((node) => node.innerText.includes(${JSON.stringify(title)})); return Boolean(card && card.innerText.includes(${JSON.stringify(text)})); })()`,
    );
    assert.equal(actual, expected, `${title} / ${text}`);
  };
  await signIn(adminId);
  for (const [viewport, suffix, shell] of [
    [360, "360", 360],
    [1200, "560", 560],
  ]) {
    await width(viewport);
    await page.go(`${base}/admin/lectures/${lectureId}`);
    for (const text of [
      "테스트 사주 강의",
      "선생님 A",
      "1강 기초",
      "차시 숨기기",
      "2강 숨김",
      "관리자 숨김",
    ]) {
      await contains(text);
    }
    await cardHas("1강 기초", "차시 숨기기", true);
    await cardHas("1강 기초", "관리자 숨김", false);
    await cardHas("2강 숨김", "관리자 숨김", true);
    await cardHas("2강 숨김", "차시 숨기기", false);
    await noOverflow();
    await shellWidth(shell);
    await screenshot(`admin-${suffix}.png`);
  }
  await signIn(teacherId);
  for (const [viewport, suffix, shell] of [
    [360, "360", 360],
    [1200, "560", 560],
  ]) {
    await width(viewport);
    await page.go(`${base}/mypage/lectures/${lectureId}`);
    for (const text of [
      "테스트 사주 강의",
      "1강 기초",
      "2강 숨김",
      "관리자 숨김",
    ]) {
      await contains(text);
    }
    await cardHas("1강 기초", "관리자 숨김", false);
    await cardHas("2강 숨김", "관리자 숨김", true);
    await noOverflow();
    await shellWidth(shell);
    await screenshot(`teacher-${suffix}.png`);
  }
  await signIn(adminId);
  await width(360);
  await page.go(`${base}/admin/lectures/${lectureId}`);
  await contains("차시 숨기기");
  await page.button("차시 숨기기");
  await contains("차시를 숨길까요?");
  await contains("다시 공개할 수 없어요.");
  await page.evaluate(
    `(() => { const dialog = document.querySelector("dialog"); const cancel = Array.from(dialog.querySelectorAll("button")).find((node) => node.textContent.trim() === "취소"); cancel.click(); })()`,
  );
  await until(
    () => page.evaluate("document.querySelector('dialog') == null"),
    "hide dialog closed",
  );
  await contains("차시 숨기기");
  await page.button("차시 숨기기");
  await contains("차시를 숨길까요?");
  await page.evaluate(
    `(() => { const dialog = document.querySelector("dialog"); const confirm = Array.from(dialog.querySelectorAll("button")).find((node) => node.textContent.trim() === "차시 숨기기"); confirm.click(); })()`,
  );
  await contains("차시를 숨겼어요. 다시 공개할 수 없어요.");
  await cardHas("1강 기초", "관리자 숨김", true);
  await cardHas("2강 숨김", "관리자 숨김", true);
  assert.equal(
    await page.evaluate("document.body.innerText.includes('차시 숨기기')"),
    false,
  );
  console.log("PASS lecture lesson hide screens at 360 and PC 560");
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
