// 격리된 HTTP 모형과 로컬 Chromium으로 문의 답변 화면을 본다.
// RESEND_API_KEY는 비워서 실제 메일을 보내지 않는다.
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
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const id = "11111111-1111-4111-8111-111111111111";
const inquiry = {
  id,
  inquiry_no: "I-20261126-0001",
  customer_name: "테스트",
  category: "consultation",
  created_at: "2026-11-26T01:00:00.000Z",
  status: "pending",
  customer_email: "guest@example.invalid",
  customer_phone: "010-1111-2222",
  reservation_no: null,
  content: "테스트 문의 본문",
  answer: null,
  answered_at: null,
  updated_at: "2026-11-26T01:00:00.000Z",
};
const user = {
  id,
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.invalid",
};
const part = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const head = part({ alg: "HS256", typ: "JWT" });
const body = part({
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
const chromePath =
  process.env.SUPPORT_CHROME ||
  join(
    process.env.LOCALAPPDATA ?? "",
    "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
  );
assert.equal(existsSync(chromePath), true, chromePath);

const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    const payload = { role: "admin" };
    res.end(
      JSON.stringify(
        req.headers.accept?.includes("object+json") ? payload : [payload],
      ),
    );
    return;
  }
  if (table !== "inquiries") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  let rows = [inquiry];
  for (const [key, value] of url.searchParams)
    if (value.startsWith("eq."))
      rows = rows.filter((row) => String(row[key]) === value.slice(3));
  if (req.method === "PATCH") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const patch = JSON.parse(Buffer.concat(chunks).toString());
    for (const row of rows)
      Object.assign(row, patch, { updated_at: "2026-11-26T01:05:00.000Z" });
  }
  res.setHeader(
    "Content-Range",
    rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0",
  );
  const payload = req.headers.accept?.includes("object+json")
    ? (rows[0] ?? null)
    : rows;
  res.end(JSON.stringify(payload));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const profile = mkdtempSync(join(tmpdir(), "notify-inquiry-"));
const screenshotDir = join(process.cwd(), "screenshots", "notify-emails");
let logs = "";
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
    windowsHide: true,
    env: {
      ...process.env,
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      RESEND_API_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
      SUPABASE_SECRET_KEY: "fixture-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
app.stdout.on("data", (chunk) => {
  logs = (logs + chunk).slice(-8000);
});
app.stderr.on("data", (chunk) => {
  logs = (logs + chunk).slice(-8000);
});
let chrome;
let ws;
let appReady = false;
let failure;
try {
  const readyAt = Date.now() + 120000;
  while (Date.now() < readyAt) {
    try {
      if ((await fetch(`${base}/admin/login`)).ok) {
        appReady = true;
        break;
      }
    } catch {
      // dev 서버가 포트를 열 때까지 기다린다.
    }
    await delay(200);
  }
  if (!appReady) throw new Error(logs || "dev server did not start");
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const chromeReady = Date.now() + 20000;
  const portFile = join(profile, "DevToolsActivePort");
  while (!existsSync(portFile)) {
    if (Date.now() > chromeReady) throw new Error("chrome did not start");
    await delay(50);
  }
  const debugPort = readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  ws = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve) =>
    ws.addEventListener("open", resolve, { once: true }),
  );
  const requests = new Map();
  let serial = 0;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = requests.get(message.id);
    requests.delete(message.id);
    if (message.error) pending?.reject(new Error(message.error.message));
    else pending?.resolve(message.result);
  });
  function cdp(method, params = {}) {
    const callId = ++serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`CDP timeout ${method}`)),
        30000,
      );
      requests.set(callId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id: callId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(fn, label) {
    const end = Date.now() + 60000;
    while (Date.now() < end) {
      if (await fn()) return;
      await delay(100);
    }
    throw new Error(`${label}\n${logs}`);
  }
  async function go(url) {
    await cdp("Page.navigate", { url });
    await until(
      () => evaluate("document.readyState === 'complete'"),
      `navigation ${url}`,
    );
    await delay(300);
  }
  async function emulate(width, mobile) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile,
    });
  }
  async function metrics() {
    return evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      return {
        shell: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        text: document.body.innerText,
      };
    })()`);
  }
  async function shot(name) {
    mkdirSync(screenshotDir, { recursive: true });
    await evaluate(
      "document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())",
    );
    const { data } = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(screenshotDir, name), Buffer.from(data, "base64"));
  }
  async function clickButton(label) {
    await until(
      () =>
        evaluate(`(() => {
          const button = [...document.querySelectorAll("button")].find((node) =>
            node.textContent.trim() === ${JSON.stringify(label)} && !node.disabled
          );
          return Boolean(button);
        })()`),
      label,
    );
    await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find((node) =>
        node.textContent.trim() === ${JSON.stringify(label)} && !node.disabled
      );
      button.click();
    })()`);
  }
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await go(`${base}/admin/support/inquiries/${id}`);
  await until(
    () => evaluate("location.pathname === '/admin/login'"),
    "login redirect",
  );
  await cdp("Network.setCookie", {
    name: "sb-127-auth-token",
    value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
    url: base,
    path: "/",
  });
  await go(`${base}/admin/support/inquiries/${id}`);
  await until(
    () => evaluate("document.body.innerText.includes('I-20261126-0001')"),
    "inquiry detail",
  );
  await until(
    () => evaluate("document.body.innerText.includes('답변 등록')"),
    "answer form",
  );
  await evaluate(`(() => {
    const field = document.querySelector("[name=answer]");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(field, "테스트 답변");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await clickButton("저장 전 확인");
  await until(
    () =>
      evaluate(
        "document.body.innerText.includes('문의 조회에서 답변을 확인할 수 있습니다')",
      ),
    "save dialog",
  );
  await clickButton("확인 후 처리");
  const failureVisible = `(() => {
    const text = document.body.innerText;
    return (
      location.search.includes("notice=mail_failed") &&
      text.includes("답변을 저장했습니다. 알림 메일은 보내지 못했습니다.") &&
      !text.includes("불러오는 중")
    );
  })()`;
  await until(() => evaluate(failureVisible), "mail failure list");
  assert.equal(inquiry.status, "answered");
  assert.equal(inquiry.answer, "테스트 답변");
  await emulate(360, true);
  await until(() => evaluate(failureVisible), "mail failure at 360");
  let box = await metrics();
  assert.equal(box.shell, 360);
  assert.equal(box.overflow, false);
  assert.match(
    box.text,
    /답변을 저장했습니다\. 알림 메일은 보내지 못했습니다\./,
  );
  await shot("admin-inquiry-mail-failed-360.png");
  await emulate(1280, false);
  await until(() => evaluate(failureVisible), "mail failure at 560");
  box = await metrics();
  assert.equal(box.shell, 560);
  assert.equal(box.overflow, false);
  assert.match(
    box.text,
    /답변을 저장했습니다\. 알림 메일은 보내지 못했습니다\./,
  );
  await shot("admin-inquiry-mail-failed-pc560.png");
  await evaluate(`(() => {
    const link = [...document.querySelectorAll("a")].find((node) =>
      node.textContent.trim() === "상세 보기"
    );
    link.click();
  })()`);
  await until(
    () => evaluate("document.body.innerText.includes('답변 수정')"),
    "answer edit",
  );
  await evaluate(`(() => {
    const field = document.querySelector("[name=answer]");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(field, "테스트 답변 수정");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await clickButton("저장 전 확인");
  await clickButton("확인 후 처리");
  await until(
    () =>
      evaluate(`(() => {
        const text = document.body.innerText;
        return (
          text.includes("답변을 저장했습니다.") &&
          !text.includes("알림 메일은 보내지 못했습니다") &&
          !text.includes("불러오는 중") &&
          location.search.includes("notice=saved")
        );
      })()`),
    "edit does not send mail",
  );
  assert.equal(inquiry.answer, "테스트 답변 수정");
} catch (error) {
  failure = error;
} finally {
  try {
    ws?.close();
  } catch {
    // 이미 닫힌 디버거 연결은 무시한다.
  }
  for (const child of [chrome, app]) {
    if (!child?.pid) continue;
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      // 프로세스가 이미 끝났으면 정리만 계속한다.
    }
  }
  fixture.close();
  await delay(400);
  if (resolve(profile).startsWith(resolve(tmpdir()))) {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Windows가 프로필 잠금을 늦게 풀어도 검사 결과는 유지한다.
    }
  }
}
if (failure) throw failure;
