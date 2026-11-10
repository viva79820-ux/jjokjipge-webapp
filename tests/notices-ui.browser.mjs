// Isolated HTTP DB/Storage only. No real Supabase credentials or resources.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import {
  browser,
  server,
  stop,
  until,
  delay,
} from "./notices-browser-tools.mjs";
const uid = "11111111-1111-4111-8111-111111111111",
  rows = [],
  files = new Map(),
  issues = [];
let admin = true,
  seq = 0,
  cleanupFail = false,
  loseResponse = false,
  writes = 0;
const stamp = () =>
  `2026-11-09T01:00:00.${String(++seq).padStart(6, "0")}+00:00`;
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" }),
  jwtBody = encode({
    ...user,
    sub: uid,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only").update(`${jwtHead}.${jwtBody}`).digest("base64url")}`;
const fixture = createServer((req, res) =>
  handle(req, res).catch(() => {
    issues.push("fixture failure");
    res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const u = new URL(req.url, "http://fixture.invalid");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (u.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  let raw = "";
  for await (const c of req) raw += c;
  if (u.pathname.startsWith("/storage/v1/")) {
    if (u.pathname.includes("/object/info/")) {
      const path = u.pathname.split("/public-images/")[1];
      if (!files.has(path)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({ size: files.get(path), content_type: "image/png" }),
      );
      return;
    }
    if (req.method === "POST") {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      const path = u.pathname.split("/public-images/")[1];
      assert.ok(!files.has(path));
      files.set(path, Buffer.byteLength(raw));
      res.end(JSON.stringify({ Key: "public-images/" + path }));
      return;
    }
    if (req.method === "DELETE") {
      if (cleanupFail) {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      for (const path of JSON.parse(raw).prefixes) files.delete(path);
      res.end("[]");
      return;
    }
    res.end("{}");
    return;
  }
  const table = u.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify({ role: admin ? "admin" : "user" }));
    return;
  }
  if (table === "reservations" || table === "inquiries") {
    res.setHeader("Content-Range", "0-0/0");
    res.end("[]");
    return;
  }
  assert.equal(table, "notices");
  let selected = rows.filter((row) =>
    [...u.searchParams].every(
      ([k, v]) => !v.startsWith("eq.") || String(row[k]) === v.slice(3),
    ),
  );
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    assert.equal(admin, true);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    writes++;
    if (req.method === "POST") {
      const input = JSON.parse(raw);
      assert.ok(!rows.some((r) => r.id === input.id));
      const row = { ...input, created_at: stamp(), updated_at: stamp() };
      rows.push(row);
      selected = [row];
    }
    if (req.method === "PATCH")
      for (const row of selected)
        Object.assign(row, JSON.parse(raw), { updated_at: stamp() });
    if (req.method === "DELETE")
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
  }
  const count = selected.length;
  const offset = Number(u.searchParams.get("offset") || 0),
    limit = Number(u.searchParams.get("limit") || 20);
  selected = selected.slice(offset, offset + limit);
  res.setHeader(
    "Content-Range",
    `0-${Math.max(0, selected.length - 1)}/${count}`,
  );
  const columns = u.searchParams.get("select")?.split(",");
  let result = selected.map((row) =>
    columns ? Object.fromEntries(columns.map((k) => [k, row[k]])) : row,
  );
  if (req.headers.accept?.includes("object+json")) result = result[0] || null;
  res.end(JSON.stringify(result));
}
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const port = 4327,
  base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
};
let app, b;
try {
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(build.status, 0, build.stdout + build.stderr);
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(base + "/category")).ok;
    } catch {
      return false;
    }
  }, "app");
  b = await browser();
  const text = (s) =>
    until(
      () =>
        b.evaluate(`document.body.innerText.includes(${JSON.stringify(s)})`),
      s,
    );
  const go = async (path) => {
    console.log("MOCK_OPEN", path);
    await b.go(base + path);
  };
  const confirm = async () => {
    assert.ok(
      await b.evaluate(
        "(()=>{const d=document.querySelector('dialog[open]');const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()",
      ),
    );
    await b.button("확인 후 처리");
    await until(
      () => b.evaluate("!document.querySelector('dialog[open]')"),
      "modal closed",
    );
    await delay(300);
  };
  const session = {
    access_token: token,
    refresh_token: "mock-only",
    user,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  };
  await b.call("Network.setCookie", {
    name: "sb-127-auth-token",
    value: "base64-" + encode(session),
    url: base,
    path: "/",
  });
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/notices/new");
  await b.fill("title", "모의 공지");
  await b.fill("body", "긴본문".repeat(100));
  await b.button("저장 전 확인");
  await b.button("돌아가기");
  assert.equal(writes, 0);
  await b.button("저장 전 확인");
  await confirm();
  await text("공지를 저장했습니다.");
  assert.equal(rows.length, 1);
  const id = rows[0].id;
  await go("/notices");
  await text("등록된 공지사항이 없습니다.");
  await go("/admin/notices/new");
  await b.fill("title", "");
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('[name=body]')).find(e=>e.checkVisibility()).value",
    ),
    "",
  );
  await go("/admin/notices/" + id);
  await b.evaluate(
    "Array.from(document.querySelectorAll('input[type=checkbox]')).filter(e=>e.checkVisibility()).at(-1).click()",
  );
  await b.evaluate(
    `(async()=>{const c=document.createElement('canvas');c.width=20;c.height=30;const blob=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([blob],'fixture.png',{type:'image/png'});const data=new DataTransfer();data.items.add(f);const el=Array.from(document.querySelectorAll('input[type=file]')).find(e=>e.checkVisibility());el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await b.fill("image_alt", "모의 이미지");
  await b.button("저장 전 확인");
  await confirm();
  assert.equal(rows[0].is_published, true);
  assert.equal(files.size, 1);
  await go("/notices");
  await text("모의 공지");
  await go("/notices/" + id);
  await text("긴본문");
  for (const width of [360, 768, 1024]) {
    await b.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),
    );
  }
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 768,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/notices/" + id);
  await b.fill("body", "유지할 충돌 초안");
  rows[0].updated_at = stamp();
  await b.button("저장 전 확인");
  await b.button("확인 후 처리");
  await text("다른 작업으로 공지가 변경됐습니다.");
  await until(
    () =>
      b.evaluate(
        "document.activeElement?.textContent.includes('최신 내용 다시 불러오기')",
      ),
    "conflict reload focus",
  );
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('[name=body]')).find(e=>e.checkVisibility()).value",
    ),
    "유지할 충돌 초안",
  );
  await b.button("최신 내용 다시 불러오기");
  await text("작성 중인 입력");
  await confirm();
  await b.fill("title", "응답 유실 저장");
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(files.size, 1);
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  await go("/admin/notices/" + id);
  cleanupFail = true;
  loseResponse = true;
  await b.button("공지 삭제");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(files.size, 1);
  await b.button("저장 결과 다시 확인");
  await text("파일 정리만 재시도");
  assert.equal(rows.length, 0);
  const before = writes;
  cleanupFail = false;
  await b.button("파일 정리만 재시도");
  await text("공지를 저장했습니다.");
  assert.equal(writes, before);
  assert.equal(files.size, 0);
  admin = false;
  await go("/admin/notices");
  await text("관리자 권한");
  assert.deepEqual(issues, []);
  console.log(
    "PASS mock notice CRUD, private/public, image upload, CAS draft preservation, lost-response recovery, cleanup-only retry, 360/768/1024",
  );
} finally {
  try {
    await b?.close();
  } finally {
    stop(app);
    fixture.closeAllConnections();
    await new Promise((r) => fixture.close(r));
  }
}
