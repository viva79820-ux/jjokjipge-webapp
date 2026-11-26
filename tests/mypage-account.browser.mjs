// 마이페이지 문의·회원정보·탈퇴 화면 검사. 포트 4341. 실제 Supabase와 분리한다.
import assert from "node:assert/strict";
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
import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { startAuthMock } from "./member-auth-mock.mjs";

const port = 4341;
const password = "Test-Pass-88";
const email = "member-account@example.invalid";
const shotDir = resolve("tmp/mypage-account");
const chromePath = [
  process.env.SUPPORT_CHROME,
  process.env.LOCALAPPDATA &&
    join(
      process.env.LOCALAPPDATA,
      "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
    ),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((path) => path && existsSync(path));
if (!chromePath) throw new Error("Chromium 실행 파일을 찾지 못했습니다.");
mkdirSync(shotDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "mypage-account-"));
const mock = await startAuthMock();
const base = `http://127.0.0.1:${port}`;
let logs = "";
let chrome;
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
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            !key.startsWith("VERCEL") && key !== "NEXT_TELEMETRY_DISABLED",
        ),
      ),
      NEXT_PUBLIC_SUPABASE_URL: mock.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mock.publicKey,
      SUPABASE_SECRET_KEY: mock.secretKey,
      CI: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  },
);
function remember(chunk) {
  logs = `${logs}${chunk}`.slice(-8000);
}
app.stdout.on("data", remember);
app.stderr.on("data", remember);

function stop(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let last = "";
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error instanceof Error ? error.message : "";
    }
    await delay(100);
  }
  throw new Error(`시간 초과: ${label}${last ? ` (${last})` : ""}\n${logs}`);
}

try {
  await fetch(`${mock.url}/__test/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "other-member@example.invalid",
      password,
      name: "다른회원",
      inquiries: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001",
          inquiry_no: "I-20261125-0002",
          category: "other",
          created_at: "2026-11-25T03:00:00.000Z",
          status: "answered",
          content: "다른회원비밀문의",
          answer: "다른회원비밀답변",
          answered_at: "2026-11-25T04:00:00.000Z",
        },
      ],
    }),
  });
  await fetch(`${mock.url}/__test/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name: "테스트회원",
      phone: "010-1111-2222",
      inquiries: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
          inquiry_no: "I-20261125-0001",
          category: "other",
          created_at: "2026-11-25T01:00:00.000Z",
          status: "answered",
          content: "로그인 회원 문의",
          answer: "테스트 답변입니다",
          answered_at: "2026-11-25T02:00:00.000Z",
        },
      ],
    }),
  });
  await until(
    async () => {
      try {
        const status = await new Promise((resolve, reject) => {
          const req = httpRequest(`${base}/login`, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          });
          req.setTimeout(120000, () => req.destroy());
          req.on("error", reject);
          req.end();
        });
        return status >= 200 && status < 400;
      } catch {
        return false;
      }
    },
    "개발 서버",
    180000,
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
    {
      windowsHide: true,
      stdio: "ignore",
      detached: process.platform !== "win32",
    },
  );
  await until(
    () => existsSync(join(profile, "DevToolsActivePort")),
    "브라우저",
  );
  const debugPort = readFileSync(
    join(profile, "DevToolsActivePort"),
    "utf8",
  ).split("\n")[0];
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  const ws = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((done) =>
    ws.addEventListener("open", done, { once: true }),
  );
  let sequence = 0;
  const pending = new Map();
  const browserErrors = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown")
      browserErrors.push(message.params.exceptionDetails.text);
  });
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolvePromise, reject) => {
      pending.set(id, { resolve: resolvePromise, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await cdp("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails)
      throw new Error(response.exceptionDetails.text || "브라우저 실행 실패");
    return response.result.value;
  }
  async function goto(path) {
    await cdp("Page.navigate", { url: `${base}${path}` });
    await until(
      async () => (await evaluate("document.readyState")) === "complete",
      path,
    );
    await delay(300);
  }
  async function textOf() {
    return evaluate("document.body ? document.body.innerText : ''");
  }
  async function fill(name, value) {
    const selector = JSON.stringify(`[name="${name}"]`);
    await until(
      async () => evaluate(`Boolean(document.querySelector(${selector}))`),
      name,
    );
    await evaluate(`(() => {
      const field = document.querySelector(${selector});
      field.focus();
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
      setter?.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await cdp("Input.insertText", { text: value });
  }
  async function clickSubmit() {
    await evaluate(`document.querySelector('button[type="submit"]').click()`);
  }
  async function shot(name) {
    const image = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotDir, name), Buffer.from(image.data, "base64"));
  }
  async function emulate(width, fine) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: !fine,
    });
    await cdp("Emulation.setTouchEmulationEnabled", {
      enabled: !fine,
      maxTouchPoints: fine ? 1 : 5,
    });
    await cdp("Emulation.setEmulatedMedia", {
      media: "screen",
      features: fine
        ? [
            { name: "hover", value: "hover" },
            { name: "pointer", value: "fine" },
          ]
        : [
            { name: "hover", value: "none" },
            { name: "pointer", value: "coarse" },
          ],
    });
    await delay(200);
  }
  async function appWidth() {
    return evaluate(
      `Math.round(document.querySelector("[data-app-shell]").getBoundingClientRect().width)`,
    );
  }
  async function overflow() {
    return evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
  }

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await goto("/login");
  await fill("email", email);
  await fill("password", password);
  await clickSubmit();
  await until(
    async () => (await evaluate("location.pathname")) === "/mypage",
    "마이페이지",
  );
  await until(
    async () => (await textOf()).includes("테스트 답변입니다"),
    "문의 답변",
  );
  const mypage = await textOf();
  assert.match(mypage, /로그인 회원 문의/);
  assert.match(mypage, /I-20261125-0001/);
  assert.equal(mypage.includes("다른회원비밀문의"), false);
  assert.equal(mypage.includes("다른회원비밀답변"), false);
  assert.equal(mypage.includes("I-20261125-0002"), false);
  assert.equal(mypage.includes(password), false);
  await emulate(360, false);
  assert.equal(await appWidth(), 360);
  assert.ok((await overflow()) <= 1, "360 가로 넘침");
  await shot("mypage-360.png");
  await emulate(1280, true);
  assert.equal(await appWidth(), 560);
  assert.ok((await overflow()) <= 1, "PC 가로 넘침");
  await shot("mypage-1280.png");

  await emulate(390, false);
  await fill("name", "바꾼이름");
  await clickSubmit();
  await until(
    async () => (await textOf()).includes("회원정보를 저장했어요."),
    "저장",
  );
  const saved = await (await fetch(`${mock.url}/__test/account`)).json();
  assert.equal(
    saved.users.find((user) => user.email === email).name,
    "바꾼이름",
  );
  assert.equal(
    saved.users.find((user) => user.email === email).phone,
    "010-1111-2222",
  );

  await goto("/mypage/withdraw");
  await until(
    async () => (await textOf()).includes("이용약관 제5조"),
    "탈퇴 안내",
  );
  const withdraw = await textOf();
  assert.match(withdraw, /개인정보 수집·이용 동의 3항/);
  assert.match(withdraw, /예약 기록: 5년/);
  assert.match(withdraw, /주문 기록: 5년/);
  await emulate(360, false);
  assert.equal(await appWidth(), 360);
  assert.ok((await overflow()) <= 1, "탈퇴 360 가로 넘침");
  await shot("withdraw-360.png");
  await emulate(1280, true);
  assert.equal(await appWidth(), 560);
  assert.ok((await overflow()) <= 1, "탈퇴 PC 가로 넘침");
  await shot("withdraw-1280.png");

  await emulate(390, false);
  await clickSubmit();
  await until(
    async () => (await textOf()).includes("탈퇴가 완료되었어요."),
    "탈퇴 완료",
  );
  assert.match(await evaluate("location.pathname"), /^\/login$/);
  await emulate(360, false);
  await shot("login-withdrawn-360.png");
  const after = await (await fetch(`${mock.url}/__test/account`)).json();
  assert.equal(
    after.users.some((user) => user.email === email),
    false,
  );
  assert.deepEqual(
    after.preserved.find((record) => record.email === email),
    { email, reservation_no: "R-20261125-0001", user_id: null },
  );

  await fill("email", email);
  await fill("password", password);
  await clickSubmit();
  await until(
    async () =>
      (await textOf()).includes("이메일 또는 비밀번호가 맞지 않아요."),
    "재로그인 차단",
  );
  assert.equal(browserErrors.length, 0, browserErrors.join("\n"));
  console.log("mypage account browser checks passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stop(chrome);
  stop(app);
  mock.server.close();
  rmSync(profile, { recursive: true, force: true });
}
