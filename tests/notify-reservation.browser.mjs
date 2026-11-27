// 격리된 HTTP 모형과 로컬 Chromium으로 예약 상세를 본다.
// RESEND_API_KEY는 비워서 실제 메일을 보내지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { siteConfig } from "../lib/site-config.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadSource(specifier) {
  const cache = new Map();
  function resolveFile(name, parent) {
    const raw = name.startsWith("@/")
      ? new URL(`../${name.slice(2)}`, import.meta.url)
      : new URL(name, parent);
    const path = fileURLToPath(raw);
    const found = [path, `${path}.ts`, `${path}.tsx`].find((item) =>
      existsSync(item),
    );
    if (!found) throw new Error(`Missing module: ${name}`);
    return found;
  }
  function instantiate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const commonjs = { exports: {} };
    cache.set(filename, commonjs);
    const parent = new URL(`file:///${filename.replaceAll("\\", "/")}`);
    new Function("require", "exports", "module", compiled)(
      (name) => {
        if (name.startsWith(".") || name.startsWith("@/"))
          return instantiate(resolveFile(name, parent));
        throw new Error(`Unexpected dependency: ${name}`);
      },
      commonjs.exports,
      commonjs,
    );
    return commonjs.exports;
  }
  return instantiate(resolveFile(specifier, import.meta.url));
}

const { readCounselorName, reservationConfirmedContent } = loadSource(
  "../lib/email/reservation-confirmed-message.ts",
);

const id = "11111111-1111-4111-8111-111111111111";
const starts = new Date(Date.now() + 5 * 86400000);
const reservation = {
  id,
  reservation_no: "R-20261201-0007",
  starts_at: starts.toISOString(),
  ends_at: new Date(starts.getTime() + 30 * 60 * 1000).toISOString(),
  customer_name: "테스트",
  status: "pending_payment",
  product_name: "테스트 상담 30분",
  minutes: 30,
  price: 30000,
  created_at: "2026-11-26T01:00:00.000Z",
  updated_at: "2026-11-26T01:00:00.000Z",
  customer_phone: "010-1111-2222",
  customer_email: "guest@example.invalid",
  payment_method: "bank_transfer",
  depositor_name: "테스트",
  confirmed_at: null,
  completed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  counselors: { name: "상담사 A", stores: { name: "테스트 매장" } },
};
const mail = reservationConfirmedContent({
  reservationNo: reservation.reservation_no,
  counselorName: readCounselorName(reservation.counselors),
  productName: reservation.product_name,
  when: "2026. 12. 01. 12:00",
  lookupUrl: "https://angelsaju.com/booking/lookup",
  phone: siteConfig.phone,
});
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
  if (url.pathname === "/mail-preview") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(mail.html);
    return;
  }
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
  if (table !== "reservations") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  if (req.method === "PATCH") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    Object.assign(reservation, JSON.parse(Buffer.concat(chunks).toString()));
    reservation.updated_at = "2026-11-26T01:05:00.000Z";
  }
  const payload = req.headers.accept?.includes("object+json")
    ? reservation
    : [reservation];
  res.end(JSON.stringify(payload));
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const profile = mkdtempSync(join(tmpdir(), "notify-reservation-"));
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
    const id = ++serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`CDP timeout ${method}`)),
        30000,
      );
      requests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
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
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await go(`${base}/admin/reservations/${id}`);
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
  await go(`${base}/admin/reservations/${id}`);
  await until(
    () => evaluate("document.body.innerText.includes('R-20261201-0007')"),
    "reservation detail",
  );
  await emulate(360, true);
  let box = await metrics();
  assert.equal(box.shell, 360);
  assert.equal(box.overflow, false);
  await shot("admin-reservation-360.png");
  await emulate(1280, false);
  box = await metrics();
  assert.equal(box.shell, 560);
  assert.equal(box.overflow, false);
  await shot("admin-reservation-pc560.png");
  await emulate(360, true);
  await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.textContent.includes("입금 확인 후 예약 확정"),
    );
    button.click();
  })()`);
  await until(
    () => evaluate("document.body.innerText.includes('확인 후 처리')"),
    "confirm dialog",
  );
  await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.textContent.trim() === "확인 후 처리",
    );
    button.click();
  })()`);
  await until(
    () =>
      evaluate(
        "document.body.innerText.includes('확정 메일은 보내지 못했습니다')",
      ),
    "mail failure notice",
  );
  box = await metrics();
  assert.equal(box.shell, 360);
  assert.equal(box.overflow, false);
  assert.equal(reservation.status, "confirmed");
  await shot("admin-reservation-mail-failed-360.png");
  await emulate(1280, false);
  box = await metrics();
  assert.equal(box.shell, 560);
  assert.equal(box.overflow, false);
  await shot("admin-reservation-mail-failed-pc560.png");
  await go(`http://127.0.0.1:${fixture.address().port}/mail-preview`);
  await until(
    () => evaluate("document.body.innerText.includes('대표번호')"),
    "mail preview",
  );
  await emulate(360, true);
  await shot("mail-html-360.png");
  await emulate(560, true);
  await shot("mail-html-560.png");
  const preview = await metrics();
  assert.equal(
    preview.overflow,
    false,
    `scroll=${preview.scroll} inner=${preview.inner}`,
  );
  assert.match(preview.text, /0507-1498-0232/);
  assert.match(preview.text, /예약 조회/);
} catch (error) {
  failure = error;
} finally {
  try {
    ws?.close();
  } catch {
    // 이미 닫힌 디버거 연결은 무시한다.
  }
  try {
    chrome?.kill();
  } catch {
    // 브라우저가 이미 끝났으면 정리만 계속한다.
  }
  try {
    app?.kill();
  } catch {
    // dev 서버가 이미 끝났으면 정리만 계속한다.
  }
  fixture.close();
  await delay(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows가 프로필 잠금을 늦게 풀어도 검사 결과는 유지한다.
  }
}
if (failure) throw failure;
