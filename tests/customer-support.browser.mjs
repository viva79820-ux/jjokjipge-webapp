// Optional isolated browser check: node tests/customer-support.browser.mjs
// Uses an installed Chromium/Chrome (or SUPPORT_CHROME), without extra packages.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const chromePath = [
  process.env.SUPPORT_CHROME,
  process.env.LOCALAPPDATA &&
    join(
      process.env.LOCALAPPDATA,
      "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
    ),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((path) => path && existsSync(path));
if (!chromePath)
  throw new Error("Set SUPPORT_CHROME to an installed Chromium executable.");
const profile = mkdtempSync(join(tmpdir(), "support-browser-"));
const id = "11111111-1111-4111-8111-111111111111";
const product = { id, name: "테스트 상담", minutes: 30, price: 1000 };
const row = {
  inquiry_no: "I-20261106-10000",
  category: "consultation",
  created_at: "2026-11-06T01:00:00Z",
  status: "pending",
  reservation_no: "R-참고용",
  content: "테스트 문의\n둘째 줄",
  answer: null,
  answered_at: null,
};
let faqMode = "empty",
  inquiryMode = "pending",
  insertCount = 0;
let insertFailure = false;
const calls = [];
const fixtureErrors = [];
function json(res, value, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}
const fixture = createServer((req, res) => {
  handleFixture(req, res).catch((error) => {
    fixtureErrors.push(error);
    json(res, { code: "FIXTURE_FAILURE" }, 500);
  });
});
async function handleFixture(req, res) {
  const url = new URL(req.url, "http://fixture.invalid");
  const table = url.pathname.split("/").at(-1);
  calls.push({ method: req.method, table, params: url.searchParams });
  if (table === "faqs") {
    assert.equal(url.searchParams.get("is_active"), "eq.true");
    assert.equal(url.searchParams.get("order"), "sort_order.asc,id.asc");
    if (faqMode === "error") return json(res, { code: "XX000" }, 500);
    return json(
      res,
      faqMode === "empty"
        ? []
        : [
            {
              id: "a",
              category: "consultation",
              question: "테스트 상담 질문",
              answer: "첫 줄\n둘째 줄 <b>일반 텍스트</b>",
            },
            {
              id: "b",
              category: "shop",
              question: "테스트 상품 질문",
              answer: "상품 답변",
            },
          ],
    );
  }
  if (table === "inquiries") {
    await delay(700);
    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const values = JSON.parse(body);
      assert.equal(values.user_id, null);
      assert.equal(values.customer_phone, "010-5555-5555");
      assert.equal(values.customer_email, "test@example.invalid");
      assert.equal(
        values.content.replace(/\r\n/g, "\n"),
        "테스트 문의\n둘째 줄",
      );
      if (insertFailure) return json(res, { code: "XX000" }, 500);
      insertCount++;
      row.inquiry_no = `I-20261106-${9999 + insertCount}`;
      return json(
        res,
        { inquiry_no: row.inquiry_no, created_at: row.created_at },
        201,
      );
    }
    assert.equal(
      url.searchParams.get("select"),
      "inquiry_no,category,created_at,status,reservation_no,content,answer,answered_at",
    );
    assert.ok(
      url.searchParams.has("inquiry_no") &&
        url.searchParams.has("customer_email"),
    );
    if (inquiryMode === "error") return json(res, { code: "XX000" }, 500);
    if (
      url.searchParams.get("inquiry_no") !== `eq.${row.inquiry_no}` ||
      url.searchParams.get("customer_email") !== "eq.test@example.invalid"
    )
      return json(res, null);
    return json(
      res,
      inquiryMode === "answered"
        ? {
            ...row,
            status: "answered",
            content: "긴본문".repeat(1500),
            answer: "답변 첫 줄\n" + "긴답변".repeat(1500),
            answered_at: row.created_at,
          }
        : row,
    );
  }
  if (table === "counselors") {
    const counselor = {
      id,
      slug: "a",
      name: "테스트 상담사",
      field: "tarot",
      tags: [],
      stores: { name: "테스트 매장" },
      consult_products: [product],
      intro: "테스트",
      description: "테스트",
    };
    return json(
      res,
      req.headers.accept?.includes("object+json") ? counselor : [counselor],
    );
  }
  if (table === "consult_products") return json(res, product);
  if (table === "reservations") {
    assert.equal(req.method, "GET");
    return json(res, []);
  }
  return json(res, { code: "UNEXPECTED" }, 500);
}
await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fakeUrl = `http://127.0.0.1:${fixture.address().port}`;
const portProbe = createServer();
await new Promise((done) => portProbe.listen(0, "127.0.0.1", done));
const appPort = portProbe.address().port;
await new Promise((done) => portProbe.close(done));
const base = `http://127.0.0.1:${appPort}`;
let logs = "",
  chrome,
  ws;
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
  logs = (logs + data).slice(-6000);
});
app.stderr.on("data", (data) => {
  logs = (logs + data).slice(-6000);
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
        return (await fetch(`${base}/support/inquiry`)).ok;
      } catch {
        return false;
      }
    },
    "Next startup",
    55000,
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
  const requests = new Map(),
    browserErrors = [],
    browserUrls = [];
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
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Missing element'); el.scrollIntoView({block:'center'}); const r = el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`,
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
          `Array.from(document.querySelectorAll('button')).some(el => el.textContent.trim() === ${JSON.stringify(text)} && !el.disabled && el.checkVisibility())`,
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
    const windowsVirtualKeyCode = { Backspace: 8, Tab: 9, a: 65 }[key];
    await cdp("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
    });
    await cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      modifiers,
      windowsVirtualKeyCode,
    });
  }
  async function fill(selector, value) {
    await click(selector);
    await key("a", "KeyA", 2);
    await cdp("Input.insertText", { text: value });
  }
  async function navigate(path) {
    await cdp("Page.navigate", { url: base + path });
    await until(
      () =>
        evaluate(
          `location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete' && Boolean(document.querySelector('main'))`,
        ),
      path,
      55000,
    );
    await delay(350);
  }
  async function widthCheck(width) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      `Horizontal overflow at ${width}`,
    );
    assert.ok(
      await evaluate(
        "Array.from(document.querySelectorAll('header > div > a, header > div > a > *')).every(el => {const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})",
      ),
      `Header clipping at ${width}`,
    );
    assert.ok(
      await evaluate(
        "Array.from(document.querySelectorAll('main input,main textarea,main select,main button')).every(el => {const r=el.getBoundingClientRect();return r.width===0 || (r.left>=0 && r.right<=innerWidth+1);})",
      ),
      `Clipped control at ${width}`,
    );
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
  await navigate("/category");
  await click('a[href="/support"]');
  await waitText("등록된 자주 묻는 질문이 없습니다.");
  assert.equal(
    await evaluate(
      "document.querySelector('nav[aria-label=\"고객센터 메뉴\"] [aria-current]').textContent.trim()",
    ),
    "자주 묻는 질문",
  );
  await button("타로샵");
  await waitText("이 분류에 등록된 질문이 없습니다.");
  faqMode = "active";
  await navigate("/support");
  await waitText("테스트 상담 질문");
  await click("details summary");
  assert.equal(await evaluate("document.querySelector('details').open"), true);
  assert.ok(
    await evaluate(
      "document.querySelector('details p').textContent.includes('\\n')",
    ),
  );
  assert.equal(
    await evaluate("document.querySelectorAll('details b').length"),
    0,
  );
  await button("타로샵");
  assert.equal(await textIncludes("테스트 상담 질문"), false);
  await waitText("테스트 상품 질문");
  for (const width of [360, 768, 1024]) await widthCheck(width);
  faqMode = "error";
  await navigate("/support");
  await waitText("자주 묻는 질문을 불러오지 못했습니다.");
  faqMode = "empty";
  await button("다시 시도");
  await waitText("등록된 자주 묻는 질문이 없습니다.");
  console.log(
    "PASS navigation, FAQ empty/category/expand/plain text/error/retry",
  );

  await click('a[href="/support/inquiry"]');
  await waitText("예약번호를 제외한 모든 항목은 필수입니다.");
  assert.ok(
    await evaluate(
      "document.querySelector('meta[name=robots]').content.includes('noindex')",
    ),
  );
  await button("문의 접수");
  assert.equal(await evaluate("document.activeElement.id"), "inquiry-category");
  await evaluate(
    "document.querySelector('#inquiry-category').value='consultation';document.querySelector('#inquiry-category').dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await fill("#inquiry-name", "테스트");
  await fill("#inquiry-email", "a..b@example.com");
  await key("Tab", "Tab");
  assert.equal(
    await evaluate(
      "document.querySelector('#inquiry-email').getAttribute('aria-invalid')",
    ),
    "true",
  );
  await fill("#inquiry-email", " Test@EXAMPLE.invalid ");
  assert.equal(
    await evaluate(
      "document.querySelector('#inquiry-email').getAttribute('aria-invalid')",
    ),
    "false",
  );
  async function phoneEdits(selector) {
    await fill(selector, "02055555555");
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).setSelectionRange(2,2)`,
    );
    await key("Backspace", "Backspace");
    await cdp("Input.insertText", { text: "1" });
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).value`,
      ),
      "010-5555-5555",
    );
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).selectionStart`,
      ),
      2,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).setSelectionRange(5,7)`,
    );
    await cdp("Input.insertText", { text: "99" });
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).value`,
      ),
      "010-5995-5555",
    );
    await fill(selector, "010555555559999");
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).value`,
      ),
      "010-5555-5555",
    );
  }
  await phoneEdits("#inquiry-phone");
  await fill("#inquiry-reservationNo", "R-테스트참고번호");
  await fill("#inquiry-content", "테스트 문의\n둘째 줄");
  await click("#inquiry-privacyConsent");
  for (const width of [360, 768, 1024]) await widthCheck(width);
  await evaluate("window.scrollTo(0,document.documentElement.scrollHeight)");
  assert.ok(
    await evaluate(
      "document.querySelector('button[type=submit]').getBoundingClientRect().bottom < document.querySelector('nav[aria-label=\"하단 메뉴\"]').getBoundingClientRect().top",
    ),
  );
  insertFailure = true;
  await button("문의 접수");
  await waitText("문의를 접수하지 못했습니다.");
  assert.equal(
    await evaluate("document.querySelector('#inquiry-content').value"),
    "테스트 문의\n둘째 줄",
  );
  insertFailure = false;
  await button("문의 접수");
  assert.equal(
    await evaluate("document.querySelector('button[type=submit]').disabled"),
    true,
  );
  await evaluate(
    "document.querySelector('form').requestSubmit();document.querySelector('form').requestSubmit()",
  );
  await waitText("문의가 접수되었습니다.");
  assert.equal(insertCount, 1);
  assert.equal(await evaluate("document.activeElement.tagName"), "H1");
  await evaluate(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopied=text}}})",
  );
  await button("문의번호 복사");
  await waitText("문의번호를 복사했습니다.");
  assert.equal(await evaluate("window.testCopied"), row.inquiry_no);
  await evaluate(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('blocked')}}})",
  );
  await button("문의번호 복사");
  await waitText("선택된 문의번호를 직접 복사해 주세요.");
  assert.equal(await evaluate("getSelection().toString()"), row.inquiry_no);
  for (const width of [360, 768, 1024]) await widthCheck(width);
  assert.equal(
    await evaluate(
      "document.querySelector('header > div > a').textContent.trim()",
    ),
    "쪽집게천사 타로샵",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('header > div > a').getAttribute('href')",
    ),
    "/",
  );
  await click('a[href="/support/lookup"]');
  await waitText("로그인한 경우에도 두 값이 모두 필요합니다.");
  await click('a[href="/support/inquiry"]');
  await waitText("문의가 접수되었습니다.");
  await button("새 문의 작성");
  await until(
    () => evaluate("document.activeElement.id === 'inquiry-category'"),
    "new inquiry focus",
  );
  assert.ok(
    await evaluate(
      "Array.from(document.querySelectorAll('main input, main textarea, main select')).every(el => el.type==='checkbox' ? !el.checked : el.value==='')",
    ),
  );
  assert.ok(
    await evaluate(
      "Array.from(document.querySelectorAll('main [role=alert]')).every(el=>!el.textContent.trim())",
    ),
  );
  assert.equal(await textIncludes("문의가 접수되었습니다."), false);
  assert.equal(
    await textIncludes("선택된 문의번호를 직접 복사해 주세요."),
    false,
  );
  assert.ok(
    await evaluate(
      "(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0 && r.bottom<innerHeight-100;})()",
    ),
  );
  assert.equal(
    await evaluate("location.pathname + location.search"),
    "/support/inquiry",
  );
  assert.equal(insertCount, 1);
  await button("문의 접수");
  assert.equal(await evaluate("document.activeElement.id"), "inquiry-category");
  assert.ok(
    await evaluate(
      "document.querySelector('#inquiry-category').getAttribute('aria-invalid')==='true'",
    ),
  );
  await evaluate(
    "document.querySelector('#inquiry-category').value='consultation';document.querySelector('#inquiry-category').dispatchEvent(new Event('change',{bubbles:true}))",
  );
  await fill("#inquiry-name", "테스트 두 번째");
  await fill("#inquiry-email", "test@example.invalid");
  await fill("#inquiry-phone", "01055555555");
  await fill("#inquiry-content", "테스트 문의\n둘째 줄");
  await click("#inquiry-privacyConsent");
  await click('a[href="/support/lookup"]');
  await waitText("로그인한 경우에도 두 값이 모두 필요합니다.");
  await click('a[href="/support/inquiry"]');
  await until(
    () =>
      evaluate(
        "document.querySelector('#inquiry-name')?.value==='테스트 두 번째'",
      ),
    "draft preservation",
  );
  await button("문의 접수");
  await waitText("문의가 접수되었습니다.");
  assert.equal(insertCount, 2);
  assert.equal(
    await textIncludes("선택된 문의번호를 직접 복사해 주세요."),
    false,
  );
  await evaluate(
    "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopied=text}}})",
  );
  await button("문의번호 복사");
  await waitText("문의번호를 복사했습니다.");
  assert.equal(await evaluate("window.testCopied"), row.inquiry_no);
  console.log(
    "PASS form validation, correction, content retention, phone editing, double click, receipt, copy/fallback, refresh safety",
  );

  await click('a[href="/support/lookup"]');
  await waitText("로그인한 경우에도 두 값이 모두 필요합니다.");
  assert.ok(
    await evaluate(
      "document.querySelector('meta[name=robots]').content.includes('noindex')",
    ),
  );
  async function lookup(email = "test@example.invalid") {
    await fill("#lookup-inquiryNo", row.inquiry_no.toLowerCase());
    await fill("#lookup-email", email);
    await button("문의 조회");
  }
  await lookup();
  await waitText("문의를 조회하고 있습니다.");
  await waitText("아직 답변이 등록되지 않았습니다.");
  assert.equal(
    await evaluate("document.activeElement.textContent"),
    "조회 결과",
  );
  assert.ok(await textIncludes("답변 대기"));
  await fill("#lookup-email", "other@example.invalid");
  assert.equal(await textIncludes("접수한 문의"), false);
  await button("문의 조회");
  await waitText("문의번호와 이메일을 다시 확인해 주세요.");
  await fill("#lookup-email", `${"a".repeat(242)}@example.com`);
  for (const width of [360, 768, 1024]) await widthCheck(width);
  inquiryMode = "answered";
  row.inquiry_no = "I-20261106-9223372036854775807";
  await lookup();
  await waitText("답변 완료");
  for (const width of [360, 768, 1024]) await widthCheck(width);
  const screenshot = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(
    "node_modules/.cache/customer-support-1024.png",
    Buffer.from(screenshot.data, "base64"),
  );
  inquiryMode = "error";
  await button("문의 조회");
  assert.equal(await textIncludes("접수한 문의"), false);
  await waitText("문의를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  await button("다시 조회하기");
  assert.equal(
    await evaluate("document.querySelector('#lookup-email').value"),
    "",
  );
  assert.equal(
    await evaluate("document.querySelector('#lookup-inquiryNo').value"),
    "",
  );
  assert.equal(await evaluate("document.activeElement.id"), "lookup-inquiryNo");
  assert.equal(await textIncludes("접수한 문의"), false);
  assert.equal(
    await evaluate("localStorage.length + sessionStorage.length"),
    0,
  );
  assert.equal(await evaluate("location.search"), "");
  assert.ok(
    browserUrls.every(
      (url) => !url.includes("test@example") && !url.includes("I-20261106"),
    ),
  );
  console.log(
    "PASS lookup pending/answered/mismatch/error/reset, previous-result removal, noindex, no storage or URL data, 360/768/1024 layout",
  );

  await navigate("/consult/a/book");
  await waitText("전화상담 예약");
  await until(
    () => evaluate("Boolean(document.querySelector('#phone'))"),
    "booking phone",
  );
  await phoneEdits("#phone");
  assert.equal(
    calls.filter(
      (call) => call.table === "reservations" && call.method === "POST",
    ).length,
    0,
  );
  assert.deepEqual(browserErrors, []);
  assert.deepEqual(fixtureErrors, []);
  console.log("PASS existing booking phone regression; no live DB was used");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    await delay(500);
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
    await delay(500);
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
}
