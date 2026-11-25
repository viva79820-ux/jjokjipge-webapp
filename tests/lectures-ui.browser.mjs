// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";

const teacherId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const lectureId = "44444444-4444-4444-8444-444444444444";
const people = {
  [teacherId]: {
    id: teacherId,
    email: "teacher@example.invalid",
    name: "선생님 A",
    role: "user",
    teacher: true,
  },
  [memberId]: {
    id: memberId,
    email: "member@example.invalid",
    name: "일반 회원",
    role: "user",
    teacher: false,
  },
  [adminId]: {
    id: adminId,
    email: "admin@example.invalid",
    name: "관리자",
    role: "admin",
    teacher: false,
  },
};
const lectures = [
  {
    id: lectureId,
    teacher_id: teacherId,
    title: "테스트 사주 강의",
    description: "무료로 공개할 소개입니다.",
    thumbnail_path: null,
    field: "saju",
    is_published: true,
    view_count: 0,
    created_at: "2026-11-25T01:00:00.000000+00:00",
    updated_at: "2026-11-25T01:00:00.000000+00:00",
  },
];
const consents = [];
let teachers = [teacherId];

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
  if (url.pathname === "/auth/v1/admin/users") {
    const email = url.searchParams.get("filter");
    const matches = Object.values(people).filter(
      (person) => person.email === email,
    );
    response.end(
      JSON.stringify({
        users: matches.map((person) => ({
          id: person.id,
          email: person.email,
          email_confirmed_at: "2026-11-01T00:00:00.000Z",
        })),
      }),
    );
    return;
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/")) {
    const id = url.pathname.split("/").at(-1);
    const person = people[id];
    response.end(
      JSON.stringify({
        user: person ? { id: person.id, email: person.email } : null,
      }),
    );
    return;
  }

  const table = url.pathname.split("/").at(-1);
  const object = request.headers.accept?.includes("object+json");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : null;
  if (table === "reservations") {
    response.setHeader("content-range", "*/0");
    response.end("[]");
    return;
  }
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
    if (request.method === "POST") {
      teachers.push(body.user_id);
      response.writeHead(201);
      response.end(JSON.stringify(body));
      return;
    }
    if (request.method === "DELETE") {
      const id = eq(url, "user_id");
      teachers = teachers.filter((userId) => userId !== id);
      response.end(JSON.stringify([{ user_id: id }]));
      return;
    }
    let rows = teachers
      .filter((userId) => !eq(url, "user_id") || userId === eq(url, "user_id"))
      .map((userId) => ({
        user_id: userId,
        granted_by: adminId,
        granted_at: "2026-11-25T00:00:00.000000+00:00",
      }));
    if (actor?.role !== "admin")
      rows = rows.filter((row) => row.user_id === actor?.id);
    if (!rows.length && object) return missing(response, true);
    return send(
      response,
      rows.map((row) => project(row, url)),
      object,
    );
  }
  if (table === "lecture_upload_consents") {
    const rows = consents.filter(
      (row) => !actor || actor.role === "admin" || row.user_id === actor.id,
    );
    if (!rows.length && object) return missing(response, true);
    return send(response, rows, object);
  }
  if (table === "lectures") {
    if (request.method === "PATCH") {
      assert.deepEqual(Object.keys(body), ["is_published"]);
      assert.equal(body.is_published, false);
      const row = lectures.find((item) => item.id === eq(url, "id"));
      row.is_published = false;
      response.end(JSON.stringify({ id: row.id, is_published: false }));
      return;
    }
    let rows = lectures.filter((row) => {
      const teacher = eq(url, "teacher_id");
      const id = eq(url, "id");
      return (!teacher || row.teacher_id === teacher) && (!id || row.id === id);
    });
    if (actor?.role !== "admin")
      rows = rows.filter(
        (row) => actor?.teacher && row.teacher_id === actor.id,
      );
    if (!rows.length && object) return missing(response, true);
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
  const select = url.searchParams.get("select");
  if (!select) return row;
  return Object.fromEntries(
    select.split(",").map((column) => [column, row[column]]),
  );
}

function listedIds(url, key) {
  const value = url.searchParams.get(key) || "";
  if (value.startsWith("eq.")) return [value.slice(3)];
  if (value.startsWith("in.(") && value.endsWith(")"))
    return value.slice(4, -1).split(",").filter(Boolean);
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
const appPort = 4348;
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
try {
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(build.status, 0, build.stdout + build.stderr);
  app = server(appPort, env);
  await until(async () => {
    try {
      return (await fetch(`${base}/login`)).ok;
    } catch {
      return false;
    }
  }, "lecture app");
  page = await browser();
  const session = (id) => ({
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
  const signIn = async (id) => {
    await page.call("Network.setCookie", {
      name: "sb-127-auth-token",
      value: `base64-${encode(session(id))}`,
      url: base,
      path: "/",
    });
  };
  const width = async (value) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: value,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  };
  const go = async (path) => {
    await page.go(`${base}${path}`);
  };
  const contains = (text) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(text)})`,
        ),
      text,
    );
  const screenshot = async (name) => {
    const directory =
      process.env.LECTURES_SCREENSHOT_DIR || "screenshots/lectures";
    mkdirSync(directory, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(directory, name), Buffer.from(data, "base64"));
  };
  const noOverflow = async () => {
    assert.equal(
      await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
      true,
    );
  };
  const shellWidth = async (expected) => {
    const actual = await page.evaluate(
      "Math.round(document.querySelector('[data-app-shell]').getBoundingClientRect().width)",
    );
    assert.equal(actual, expected);
  };

  await width(360);
  await signIn(memberId);
  await go("/mypage");
  await contains("일반 회원");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('강의 관리')"),
    false,
  );
  await noOverflow();
  await shellWidth(360);
  await screenshot("mypage-member-360.png");

  await signIn(teacherId);
  await go("/mypage");
  await contains("강의 관리");
  await noOverflow();
  await screenshot("mypage-teacher-360.png");
  await go("/mypage/lectures");
  await contains("테스트 사주 강의");
  await contains("공개");
  await contains("차시 0");
  await contains("조회 0");
  await noOverflow();
  await screenshot("lecture-list-360.png");
  await go("/mypage/lectures/new");
  await contains("본인이 권리를 가진 영상만 올린다");
  await contains("사주");
  await contains("타로");
  await noOverflow();
  await screenshot("lecture-new-360.png");

  await signIn(adminId);
  await width(1200);
  await go("/admin/lectures");
  await contains("테스트 사주 강의");
  await contains("비공개로 바꾸기");
  await shellWidth(560);
  await noOverflow();
  await page.button("비공개로 바꾸기");
  await contains("강의를 비공개로 바꿨어요.");
  await contains("이미 비공개예요.");
  assert.equal(lectures[0].is_published, false);
  await screenshot("lecture-admin-560.png");

  await width(360);
  await go("/admin/teachers?email=member@example.invalid");
  await contains("일반 회원");
  await contains("선생님 권한 주기");
  await noOverflow();
  await shellWidth(360);
  await screenshot("teachers-admin-360.png");
  console.log("PASS lecture teacher/member/admin 360 and PC 560");
} finally {
  try {
    await page?.close();
  } catch {}
  stop(app);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
