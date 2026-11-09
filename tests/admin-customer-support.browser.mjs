// Isolated HTTP adapters and installed Chromium; never connects to the real DB.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const id = "11111111-1111-4111-8111-111111111111";
let seq = 1,
  admin = true,
  faqRows = [];
const stamp = () =>
  `2026-11-06T01:00:00.${String(seq++).padStart(6, "0")}+00:00`;
const inquiry = {
  id,
  inquiry_no: "I-20261106-0001",
  category: "shop",
  customer_name: "테스트",
  customer_email: "test@example.invalid",
  customer_phone: "010-1111-2222",
  created_at: stamp(),
  updated_at: stamp(),
  status: "pending",
  content: "테스트 문의\n" + "긴본문".repeat(100),
  answer: null,
  answered_at: null,
  reservation_no: null,
};
const user = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.invalid",
};
const part = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const head = part({ alg: "HS256", typ: "JWT" }),
  body = part({
    sub: id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
const token = `${head}.${body}.${createHmac("sha256", "fixture-only").update(`${head}.${body}`).digest("base64url")}`;
const session = {
  access_token: token,
  refresh_token: "fixture-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const fixtureErrors = [];
const fixture = createServer((req, res) =>
  handle(req, res).catch((e) => {
    fixtureErrors.push(e.message);
    res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const u = new URL(req.url, "http://fixture.invalid");
  res.setHeader("Content-Type", "application/json");
  if (u.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  const table = u.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify({ role: admin ? "admin" : "user" }));
    return;
  }
  if (table === "reservations") {
    res.setHeader("Content-Range", "0-0/0");
    res.end("[]");
    return;
  }
  assert.ok(["faqs", "inquiries"].includes(table));
  const isWrite = ["POST", "PATCH", "DELETE"].includes(req.method);
  if (isWrite) {
    assert.equal(admin, true);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
  }
  let rows = table === "faqs" ? faqRows : [inquiry];
  for (const [key, value] of u.searchParams)
    if (value.startsWith("eq."))
      rows = rows.filter((r) => String(r[key]) === value.slice(3));
  if (req.method === "POST") {
    let str = "";
    for await (const c of req) str += c;
    const r = { ...JSON.parse(str), id, updated_at: stamp() };
    faqRows.push(r);
    rows = [r];
    res.statusCode = 201;
  }
  if (req.method === "PATCH") {
    let str = "";
    for await (const c of req) str += c;
    const patch = JSON.parse(str);
    for (const row of rows) Object.assign(row, patch, { updated_at: stamp() });
  }
  if (req.method === "DELETE")
    faqRows = faqRows.filter((r) => !rows.includes(r));
  res.setHeader(
    "Content-Range",
    `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
  );
  const select = u.searchParams.get("select")?.split(",");
  let result = rows.map((r) =>
    select ? Object.fromEntries(select.map((k) => [k, r[k]])) : r,
  );
  if (req.headers.accept?.includes("object+json")) result = result[0] ?? null;
  res.end(JSON.stringify(result));
}
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${port}`,
  profile = mkdtempSync(join(tmpdir(), "admin-support-browser-"));
let logs = "",
  chrome,
  ws,
  serial = 0;
const fixtureEnv = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
};
const built = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  { windowsHide: true, env: fixtureEnv, encoding: "utf8" },
);
assert.equal(built.status, 0, built.stdout + built.stderr);
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  { windowsHide: true, env: fixtureEnv, stdio: ["ignore", "pipe", "pipe"] },
);
app.stdout.on("data", (d) => {
  logs = (logs + d).slice(-5000);
});
app.stderr.on("data", (d) => {
  logs = (logs + d).slice(-5000);
});
async function until(f, label) {
  const end = Date.now() + 55000;
  while (Date.now() < end) {
    if (await f()) return;
    await delay(100);
  }
  throw Error(`Timed out ${label}`);
}
try {
  await until(async () => {
    try {
      return (await fetch(base + "/admin/login")).ok;
    } catch {
      return false;
    }
  }, "startup");
  chrome = spawn(
    process.env.SUPPORT_CHROME ||
      join(
        process.env.LOCALAPPDATA,
        "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
      ),
    [
      "--headless=new",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await until(() => existsSync(join(profile, "DevToolsActivePort")), "chrome");
  const debug = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
    "\n",
  )[0];
  const targets = await (
    await fetch(`http://127.0.0.1:${debug}/json/list`)
  ).json();
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const requests = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = requests.get(m.id);
      requests.delete(m.id);
      if (m.error) p?.reject(Error(m.error.message));
      else p?.resolve(m.result);
    }
  });
  function cdp(method, params = {}) {
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error(`CDP timeout ${method}`)),
        55000,
      );
      requests.set(id, {
        resolve: (r) => {
          clearTimeout(timeout);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const r = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async function visible(selector) {
    return evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e=>e.checkVisibility())`,
    );
  }
  async function click(selector) {
    await until(() => visible(selector), selector);
    const r = await evaluate(
      `(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.checkVisibility());e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    for (const type of ["mousePressed", "mouseReleased"])
      await cdp("Input.dispatchMouseEvent", {
        type,
        button: "left",
        clickCount: 1,
        ...r,
      });
  }
  async function button(label) {
    await until(
      () =>
        evaluate(
          `Array.from(document.querySelectorAll('button')).some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(label)})`,
        ),
      label,
    );
    await evaluate(
      `document.querySelectorAll('[data-target]').forEach(e=>e.removeAttribute('data-target'));Array.from(document.querySelectorAll('button')).find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(label)}).setAttribute('data-target','1')`,
    );
    await click("[data-target]");
  }
  async function fill(selector, value) {
    await until(
      () =>
        evaluate(
          `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e=>e.checkVisibility()&&!e.matches(':disabled'))`,
        ),
      "editable input",
    );
    await click(selector);
    for (const type of ["keyDown", "keyUp"])
      await cdp("Input.dispatchKeyEvent", {
        type,
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers: 2,
      });
    await cdp("Input.insertText", { text: value });
  }
  async function text(s) {
    await until(
      () => evaluate(`document.body.innerText.includes(${JSON.stringify(s)})`),
      s,
    );
  }
  async function go(path) {
    console.log(`OPEN ${path}`);
    await cdp("Page.stopLoading");
    await cdp("Page.navigate", { url: base + path });
    await until(
      () => evaluate("document.readyState==='complete'"),
      "navigation",
    );
    await delay(500);
  }
  async function confirm() {
    await button("확인 후 처리");
    await until(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "dialog close",
    );
    await delay(250);
  }
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await go("/admin/support/inquiries");
  await until(
    () => evaluate("location.pathname==='/admin/login'"),
    "unauthenticated redirect",
  );
  await cdp("Network.setCookie", {
    name: "sb-127-auth-token",
    value:
      "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    url: base,
    path: "/",
  });
  await go("/admin");
  await text("미답변 문의 1건");
  await go("/admin/support/faqs/new");
  await text("FAQ 등록");
  await fill("[name=question]", "테스트 FAQ");
  await fill("[name=answer]", "테스트 답변\n둘째 줄");
  await evaluate(
    "Array.from(document.querySelectorAll('[name=category]')).find(e=>e.checkVisibility()).value='shop';Array.from(document.querySelectorAll('[name=category]')).find(e=>e.checkVisibility()).dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await button("저장 전 확인");
  await text("공개로 저장하면 고객 FAQ에 반영됩니다.");
  await button("돌아가기");
  assert.equal(faqRows.length, 0);
  await button("저장 전 확인");
  await confirm();
  await until(
    () =>
      evaluate(
        "location.pathname==='/admin/support/faqs' && location.search.includes('notice=saved')",
      ),
    "created list",
  );
  assert.equal(faqRows[0].is_active, false);
  await text("FAQ를 저장했습니다.");
  await click('a[href*="/faqs/' + id + '"]');
  await fill("[name=question]", "테스트 수정 FAQ");
  await click("input[type=checkbox]");
  await button("저장 전 확인");
  await confirm();
  await text("FAQ를 저장했습니다.");
  assert.equal(faqRows[0].is_active, true);
  await click('a[href*="/faqs/' + id + '"]');
  await fill("[name=answer]", "두 번째 저장");
  await button("저장 전 확인");
  await confirm();
  assert.equal(faqRows[0].answer, "두 번째 저장");
  await text("총 1건");
  await click('a[href*="/faqs/new"]');
  await text("FAQ 등록");
  await until(() => visible("[name=question]"), "new FAQ form");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('[name=question]')).find(e=>e.checkVisibility()).value",
    ),
    "",
  );
  await go(`/admin/support/faqs/${id}`);
  for (const width of [360, 768, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    );
  }
  // External state change simulates another administrator saving in a different tab.
  await fill("[name=answer]", "보존할 초안");
  faqRows[0].updated_at = stamp();
  await button("저장 전 확인");
  await button("확인 후 처리");
  await text("다른 작업으로 FAQ가 변경됐습니다.");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('[name=answer]')).find(e=>e.checkVisibility()).value",
    ),
    "보존할 초안",
  );
  await button("돌아가기");
  await until(
    () =>
      evaluate(
        "document.activeElement?.textContent.includes('최신 내용 다시 불러오기')",
      ),
    "conflict focus",
  );
  assert.ok(
    await evaluate(
      "document.activeElement.getBoundingClientRect().bottom<=innerHeight",
    ),
  );
  await button("최신 내용 다시 불러오기");
  await text("작성 중인 입력이 사라지고");
  await confirm();
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('[name=answer]')).find(e=>e.checkVisibility()).value",
    ),
    "두 번째 저장",
  );
  await go("/support");
  await text("테스트 수정 FAQ");
  await text("쪽집게천사 운명나라");
  for (const width of [360, 768, 1024]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    );
  }
  await go("/admin/support/faqs");
  await click('a[href*="/faqs/new"]');
  await text("FAQ 등록");
  await until(() => visible("[name=question]"), "new FAQ form");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('[name=question]')).find(e=>e.checkVisibility()).value",
    ),
    "",
  );
  await go(
    `/admin/support/inquiries/${id}?returnTo=${encodeURIComponent("/admin/support/inquiries?category=shop&status=pending&page=2")}`,
  );
  await text("답변 등록");
  await fill("[name=answer]", "충돌 답변 초안");
  inquiry.updated_at = stamp();
  await button("저장 전 확인");
  await button("확인 후 처리");
  await text("다른 작업으로 문의가 변경됐습니다.");
  await button("돌아가기");
  await until(
    () =>
      evaluate(
        "document.activeElement?.textContent.includes('최신 내용 다시 불러오기')",
      ),
    "inquiry conflict focus",
  );
  assert.ok(
    await evaluate(
      "document.activeElement.getBoundingClientRect().bottom<=innerHeight",
    ),
  );
  await button("최신 내용 다시 불러오기");
  await text("작성 중인 입력이 사라지고");
  assert.equal(
    await evaluate(
      "Array.from(document.querySelectorAll('[name=answer]')).find(e=>e.checkVisibility()).value",
    ),
    "충돌 답변 초안",
  );
  await confirm();
  await fill("[name=answer]", "테스트 답변 등록");
  await button("저장 전 확인");
  await text("저장하면 고객이 문의 조회에서 답변을 확인할 수 있습니다.");
  await confirm();
  assert.equal(inquiry.status, "answered");
  await text("답변을 저장했습니다.");
  assert.ok(await evaluate("location.search.includes('status=answered')"));
  assert.ok(
    await evaluate(
      "location.search.includes('category=shop') && !new URLSearchParams(location.search).has('page')",
    ),
  );
  await click('a[href*="/inquiries/' + id + '"]');
  await fill("[name=answer]", "테스트 답변 수정");
  await button("저장 전 확인");
  await confirm();
  assert.equal(inquiry.answer, "테스트 답변 수정");
  await go("/admin");
  await text("미답변 문의 0건");
  await go("/support/lookup");
  await fill("#lookup-inquiryNo", inquiry.inquiry_no);
  await fill("#lookup-email", inquiry.customer_email);
  await button("문의 조회");
  await text("테스트 답변 수정");
  await text("답변 완료");
  await go(`/admin/support/faqs/${id}`);
  await button("FAQ 삭제");
  await text("고객 FAQ에서도 사라집니다.");
  await confirm();
  await until(
    () => evaluate("location.pathname==='/admin/support/faqs'"),
    "deleted list",
  );
  assert.equal(faqRows.length, 0);
  admin = false;
  await go("/admin/support/inquiries");
  await text("관리자 권한");
  assert.deepEqual(fixtureErrors, []);
  console.log(
    "PASS isolated FAQ lifecycle, confirmation/cancel, stale conflict/reload, second save, fresh new form, inquiry answer/edit/customer lookup, dashboard, auth pages, 360/768/1024",
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await delay(500);
  }
  ws?.close();
  for (const child of [chrome, app])
    if (child?.pid)
      try {
        execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {}
  await new Promise((r) => fixture.close(r));
  if (resolve(profile).startsWith(resolve(tmpdir()) + "\\")) {
    await delay(500);
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
