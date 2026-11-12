// 실제 Supabase와 분리한 예약 조회 브라우저 검사. 포트 4333.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = 4333;
const email = "test@example.invalid";
const columns =
  "reservation_no,status,product_name,minutes,price,starts_at,ends_at,payment_method,cancel_reason,counselors(name)";
const shotDir = resolve("tmp/reservation-lookup");
const chromePath = [
  process.env.SUPPORT_CHROME,
  process.env.NOTICES_CHROME,
  process.env.LOCALAPPDATA &&
    join(
      process.env.LOCALAPPDATA,
      "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
    ),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((path) => path && existsSync(path));
if (!chromePath)
  throw new Error("Set SUPPORT_CHROME to an installed Chromium executable.");
mkdirSync(shotDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "reservation-lookup-"));
function row(patch) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    customer_name: "테스트비밀이름",
    customer_phone: "010-9999-0000",
    customer_email: email,
    depositor_name: "테스트입금자",
    reservation_no: "R-20261112-0001",
    product_name: "테스트 당시 상품",
    minutes: 30,
    price: 15000,
    starts_at: "2026-11-12T03:00:00.000Z",
    ends_at: "2026-11-12T03:30:00.000Z",
    payment_method: "bank_transfer",
    status: "pending_payment",
    cancel_reason: null,
    counselors: {
      name: "테스트 비공개상담사",
      is_active: false,
      approval_status: "rejected",
    },
    consult_products: {
      name: "테스트 현재 상품",
      price: 99000,
      is_active: false,
    },
    ...patch,
  };
}
const rows = {
  "R-20261112-0001": row({ status: "pending_payment" }),
  "R-20261112-0002": row({
    reservation_no: "R-20261112-0002",
    status: "confirmed",
  }),
  "R-20261112-0003": row({
    reservation_no: "R-20261112-0003",
    status: "completed",
  }),
  "R-20261112-0004": row({
    reservation_no: "R-20261112-0004",
    status: "cancelled",
    product_name: "테스트상품명".repeat(8),
    cancel_reason: `${"테스트취소사유".repeat(8)}\n<b>일반 텍스트</b>`,
    counselors: { name: "테스트상담사".repeat(8), is_active: false },
  }),
  "R-20261112-0006": row({
    reservation_no: "R-20261112-0006",
    status: "confirmed",
    payment_method: "card",
  }),
  "R-20261112-10000": row({
    reservation_no: "R-20261112-10000",
    status: "confirmed",
  }),
};
let fail = false;
let reads = 0;
let writes = 0;
const queries = [];
const fixtureErrors = [];
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
const fixture = createServer((req, res) => {
  handleFixture(req, res).catch((error) => {
    fixtureErrors.push(String(error));
    json(res, { code: "FIXTURE_FAILURE" }, 500);
  });
});
async function handleFixture(req, res) {
  const url = new URL(req.url, "http://fixture.invalid");
  if (url.pathname.includes("/auth/")) return json(res, {}, 401);
  if (!url.pathname.endsWith("/reservations"))
    return json(res, { code: "UNEXPECTED" }, 404);
  if (req.method !== "GET") {
    writes += 1;
    return json(res, { message: "no write" }, 405);
  }
  reads += 1;
  const query = {
    select: url.searchParams.get("select"),
    reservationNo: url.searchParams.get("reservation_no"),
    customerEmail: url.searchParams.get("customer_email"),
    raw: url.search,
  };
  queries.push(query);
  await delay(800);
  assert.equal(query.select, columns);
  assert.equal(query.raw.includes("ilike"), false);
  assert.equal(query.raw.includes("or="), false);
  assert.ok(query.reservationNo?.startsWith("eq."));
  assert.ok(query.customerEmail?.startsWith("eq."));
  if (fail)
    return json(
      res,
      { message: "SECRET_DB_ERROR reservations", code: "XX000" },
      500,
    );
  const number = query.reservationNo.slice(3);
  const mail = decodeURIComponent(query.customerEmail.slice(3));
  const found = rows[number];
  if (!found || mail !== email) return json(res, []);
  return json(res, [found]);
}
await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fakeUrl = `http://127.0.0.1:${fixture.address().port}`;
const base = `http://127.0.0.1:${port}`;
let logs = "";
let chrome;
let ws;
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: resolve("."),
    windowsHide: true,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: fakeUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
      SUPABASE_SECRET_KEY: "fixture-server-key",
      NEXT_TELEMETRY_DISABLED: "1",
      CI: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
app.stdout.on("data", (data) => {
  logs = (logs + data).slice(-8000);
});
app.stderr.on("data", (data) => {
  logs = (logs + data).slice(-8000);
});
async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(80);
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  await until(
    async () => {
      try {
        return (await fetch(`${base}/booking/lookup`)).ok;
      } catch {
        return false;
      }
    },
    "Next startup",
    90000,
  );
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await until(
    () => existsSync(join(profile, "DevToolsActivePort")),
    "Chromium startup",
  );
  const debugPort = readFileSync(
    join(profile, "DevToolsActivePort"),
    "utf8",
  ).split("\n")[0];
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  ws = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((done) =>
    ws.addEventListener("open", done, { once: true }),
  );
  let sequence = 0;
  const requests = new Map();
  const browserErrors = [];
  const browserUrls = [];
  const consoleText = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = requests.get(message.id);
      requests.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown")
      browserErrors.push(message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent")
      browserUrls.push(message.params.request.url);
    if (message.method === "Runtime.consoleAPICalled")
      consoleText.push(JSON.stringify(message.params.args ?? []));
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      requests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (response.exceptionDetails)
      throw new Error(response.exceptionDetails.text);
    return response.result.value;
  }
  async function textIncludes(value) {
    return evaluate(
      `document.body.innerText.includes(${JSON.stringify(value)})`,
    );
  }
  async function waitText(text) {
    await until(() => textIncludes(text), text);
  }
  async function click(selector) {
    await until(
      () =>
        evaluate(
          `Boolean(document.querySelector(${JSON.stringify(selector)})?.checkVisibility())`,
        ),
      `visible: ${selector}`,
    );
    const rect = await evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
    );
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...rect,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...rect,
    });
  }
  async function button(text) {
    await until(
      () =>
        evaluate(
          `Array.from(document.querySelectorAll('button')).some(el => el.textContent.trim() === ${JSON.stringify(text)} && el.getAttribute('aria-disabled') !== 'true' && el.checkVisibility())`,
        ),
      `button ready: ${text}`,
    );
    const index = await evaluate(
      `Array.from(document.querySelectorAll('button')).findIndex(el => el.textContent.trim() === ${JSON.stringify(text)} && el.checkVisibility())`,
    );
    assert.ok(index >= 0, `Missing button: ${text}`);
    await evaluate(
      `document.querySelectorAll('button')[${index}].setAttribute('data-browser-button','target')`,
    );
    await click('[data-browser-button="target"]');
    await evaluate(
      `document.querySelector('[data-browser-button="target"]')?.removeAttribute('data-browser-button')`,
    );
  }
  async function key(key, code, modifiers = 0) {
    const windowsVirtualKeyCode = { Backspace: 8, Tab: 9, Enter: 13, a: 65 }[
      key
    ];
    const event = {
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    };
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    if (key === "Enter")
      await cdp("Input.dispatchKeyEvent", {
        type: "char",
        text: "\r",
        ...event,
      });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }
  async function fill(selector, value) {
    await click(selector);
    await key("a", "KeyA", 2);
    if (value) await cdp("Input.insertText", { text: value });
  }
  async function navigate(path) {
    const pathname = path.split("?")[0];
    await cdp("Page.navigate", { url: base + path });
    await until(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(pathname)} && document.readyState === 'complete' && Boolean(document.querySelector('h1'))`,
        ),
      path,
      90000,
    );
    await delay(200);
  }
  async function shot(name) {
    const image = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotDir, name), Buffer.from(image.data, "base64"));
  }
  async function widthCheck(width) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(150);
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      `Horizontal overflow at ${width}`,
    );
    assert.ok(
      await evaluate(
        "Array.from(document.querySelectorAll('main input,main button,[data-lookup-result]')).every(el => {const r=el.getBoundingClientRect();return r.width===0 || r.right<=innerWidth+1;})",
      ),
      `Clipped content at ${width}`,
    );
    await shot(`result-${width}.png`);
  }
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(
    "/booking/lookup?reservationNo=LEAK-CHECK&email=leak@example.invalid",
  );
  await until(() => evaluate("location.search === ''"), "query removed");
  assert.equal(
    await evaluate("document.querySelector('h1').textContent"),
    "예약 조회",
  );
  assert.equal(
    await evaluate("document.querySelector('#lookup-reservationNo').value"),
    "",
  );
  assert.equal(
    await evaluate("document.querySelector('#lookup-email').value"),
    "",
  );
  assert.equal(await evaluate("document.querySelector('form').method"), "post");
  assert.ok(
    await evaluate(
      "document.querySelector('meta[name=robots]').content.includes('noindex')",
    ),
  );
  assert.equal(await textIncludes("로그인"), true);
  const beforeEmpty = reads;
  await button("조회");
  await waitText("예약번호를 R-20261102-0001 형식으로 입력해 주세요.");
  assert.equal(
    await evaluate("document.activeElement.id"),
    "lookup-reservationNo",
  );
  assert.equal(reads, beforeEmpty);
  await fill("#lookup-reservationNo", "R-20261112-0000");
  await fill("#lookup-email", email);
  await button("조회");
  await waitText("형식으로 입력해 주세요.");
  assert.equal(reads, beforeEmpty);
  await fill("#lookup-reservationNo", "R-20261112-0001");
  await fill("#lookup-email", "wrong@example.invalid");
  await button("조회");
  await waitText("예약을 조회하고 있습니다.");
  await waitText("예약번호와 이메일을 다시 확인해 주세요.");
  assert.equal(
    await evaluate("document.activeElement.getAttribute('role')"),
    "alert",
  );
  assert.equal(await textIncludes("테스트 비공개상담사"), false);
  await fill("#lookup-email", ` ${email.toUpperCase()} `);
  await button("조회");
  await waitText("입금 대기");
  await waitText("예약 조회가 완료되었습니다.");
  await waitText("테스트 비공개상담사");
  await waitText("테스트 당시 상품");
  await waitText("2026년 11월 12일 목");
  await waitText("12:00");
  await waitText("12:30");
  await waitText("30분");
  await waitText("15,000원");
  await waitText("예시 가격");
  await waitText("무통장입금");
  await waitText("현재 시안의 예시 계좌");
  await waitText("입금이 확인되면 예약이 확정돼요.");
  assert.equal(await textIncludes("테스트비밀이름"), false);
  assert.equal(await textIncludes("010-9999-0000"), false);
  assert.equal(await textIncludes("테스트입금자"), false);
  assert.equal(await textIncludes("테스트 현재 상품"), false);
  assert.equal(await textIncludes("자동 취소"), false);
  assert.equal(await textIncludes("메일을 보냈"), false);
  assert.equal(
    await evaluate(
      "document.querySelector('[data-lookup-result]').innerText.includes('test@example.invalid')",
    ),
    false,
  );
  assert.ok(
    await evaluate(
      "['#lookup-reservationNo','#lookup-email','button[type=submit]'].every(sel => document.querySelector(sel).getBoundingClientRect().height >= 44)",
    ),
  );
  await fill("#lookup-email", "wrong@example.invalid");
  assert.equal(await textIncludes("테스트 비공개상담사"), false);
  await button("조회");
  await waitText("예약번호와 이메일을 다시 확인해 주세요.");
  assert.equal(await textIncludes("입금 대기"), false);
  fail = true;
  await fill("#lookup-email", email);
  await button("조회");
  await waitText("예약을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  assert.equal(await textIncludes("SECRET_DB_ERROR"), false);
  assert.equal(await textIncludes("테스트 비공개상담사"), false);
  fail = false;
  const beforeDouble = reads;
  await evaluate(
    "document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()",
  );
  await waitText("입금 대기");
  assert.equal(reads, beforeDouble + 1);
  await navigate("/booking/lookup");
  await fill("#lookup-reservationNo", "R-20261112-0006");
  await click("#lookup-reservationNo");
  await key("Tab", "Tab");
  assert.equal(await evaluate("document.activeElement.id"), "lookup-email");
  await cdp("Input.insertText", { text: email });
  assert.equal(
    await evaluate("document.querySelector('#lookup-reservationNo').value"),
    "R-20261112-0006",
  );
  assert.equal(
    await evaluate("document.querySelector('#lookup-email').value"),
    email,
  );
  await key("Enter", "Enter");
  await waitText("카드결제");
  await waitText("예약 확정");
  assert.equal(
    await evaluate("document.activeElement.id"),
    "lookup-result-title",
  );
  assert.equal(await textIncludes("예시 계좌"), false);
  for (const [number, label] of [
    ["R-20261112-0002", "예약 확정"],
    ["R-20261112-0003", "상담 완료"],
    ["R-20261112-10000", "R-20261112-10000"],
  ]) {
    await fill("#lookup-reservationNo", number);
    await fill("#lookup-email", email);
    await button("조회");
    await waitText(label);
  }
  assert.equal(
    await evaluate(
      "document.querySelector('[data-lookup-result] dd').textContent",
    ),
    "R-20261112-10000",
  );
  await fill("#lookup-reservationNo", "R-20261112-0004");
  await button("조회");
  await waitText("예약 취소");
  await waitText("<b>일반 텍스트</b>");
  assert.equal(
    await evaluate(
      "document.querySelectorAll('[data-lookup-result] b, [data-lookup-result] script').length",
    ),
    0,
  );
  for (const width of [360, 768, 1024]) await widthCheck(width);
  await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  assert.ok(
    await evaluate(
      "document.querySelector('[data-lookup-result]').getBoundingClientRect().bottom <= document.querySelector('nav[aria-label=\"하단 메뉴\"]').getBoundingClientRect().top + 1",
    ),
  );
  assert.equal(await evaluate("location.pathname"), "/booking/lookup");
  assert.equal(await evaluate("location.search"), "");
  assert.equal(
    await evaluate("location.href.includes('test@example.invalid')"),
    false,
  );
  assert.equal(await evaluate("location.href.includes('R-20261112')"), false);
  assert.equal(await evaluate("localStorage.length"), 0);
  assert.equal(await evaluate("sessionStorage.length"), 0);
  assert.equal(
    await evaluate("document.cookie.includes('test@example')"),
    false,
  );
  assert.ok(browserUrls.every((url) => !url.includes(email)));
  assert.ok(browserUrls.every((url) => !url.includes("R-20261112")));
  assert.ok(consoleText.every((line) => !line.includes(email)));
  assert.equal(writes, 0);
  assert.ok(queries.length > 0);
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(fixtureErrors, []);
  const html = await (await fetch(`${base}/booking/lookup`)).text();
  assert.equal(html.includes("fixture-server-key"), false);
  for (const src of html.match(/src="([^"]+)"/g) ?? []) {
    const path = src.slice(5, -1);
    const body = await (await fetch(new URL(path, base))).text();
    assert.equal(body.includes("fixture-server-key"), false, path);
  }
  console.log(
    "PASS guest lookup, errors, statuses, relock, keyboard, layout, no private storage",
  );
} catch (error) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const safeLogs = secret ? logs.split(secret).join("[secret]") : logs;
  console.error(safeLogs);
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await delay(400);
  }
  ws?.close();
  for (const child of [chrome, app])
    if (child?.pid) {
      try {
        if (process.platform === "win32")
          execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            windowsHide: true,
            stdio: "ignore",
          });
        else child.kill("SIGTERM");
      } catch {
        /* process may already have exited */
      }
    }
  await new Promise((done) => fixture.close(done));
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + "/") ||
    resolve(profile).startsWith(resolve(tmpdir()) + "\\")
  ) {
    await delay(400);
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
