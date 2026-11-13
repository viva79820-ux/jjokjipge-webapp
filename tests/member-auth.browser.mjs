// 실제 Supabase와 분리한 회원 인증 브라우저 검사. 포트 4333.
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
import { setTimeout as delay } from "node:timers/promises";
import { startAuthMock } from "./member-auth-mock.mjs";

const port = 4333;
const password = "Test-Pass-88";
const nextPassword = "Test-Pass-99";
const nameA = "테스트긴이름".repeat(5);
const nameB = "다른회원";
const emailA = "member-long.address@example.invalid";
const emailB = "member-b@example.invalid";
const shotDir = resolve("tmp/member-auth");
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
if (!chromePath) throw new Error("Chromium 실행 파일을 찾지 못했습니다.");
mkdirSync(shotDir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "member-auth-"));
const mock = await startAuthMock();
const base = `http://127.0.0.1:${port}`;
let logs = "";
let chrome;
let ws;
const env = { ...process.env };
delete env.VERCEL;
delete env.VERCEL_URL;
delete env.VERCEL_BRANCH_URL;
delete env.VERCEL_PROJECT_PRODUCTION_URL;
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
      ...env,
      NEXT_PUBLIC_SUPABASE_URL: mock.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: mock.publicKey,
      SUPABASE_SECRET_KEY: mock.secretKey,
      NEXT_TELEMETRY_DISABLED: "1",
      CI: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
app.stdout.on("data", (data) => {
  logs = redact(logs + data).slice(-12000);
});
app.stderr.on("data", (data) => {
  logs = redact(logs + data).slice(-12000);
});

function redact(value) {
  return String(value)
    .split(password)
    .join("[redacted]")
    .split(nextPassword)
    .join("[redacted]");
}
function stop(child) {
  if (!child?.pid) return;
  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
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
  throw new Error(`시간 초과: ${label}${last ? ` (${last})` : ""}`);
}

try {
  await until(
    async () => {
      try {
        return (await fetch(`${base}/login`)).ok;
      } catch {
        return false;
      }
    },
    "개발 서버",
    120000,
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
    "브라우저",
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
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "브라우저 실행 실패");
    }
    return response.result.value;
  }
  async function textOf() {
    return evaluate("document.body ? document.body.innerText : ''");
  }
  async function goto(path) {
    const navigated = await cdp("Page.navigate", { url: `${base}${path}` });
    if (navigated.errorText) throw new Error(navigated.errorText);
    let detail = "none";
    let last = "";
    let stable = 0;
    try {
      await until(
        async () => {
          const snapshot = await evaluate(
            "JSON.stringify({ state: document.readyState, href: location.href })",
          );
          detail = String(snapshot);
          const page = JSON.parse(detail);
          if (
            page.state !== "complete" ||
            !String(page.href).startsWith(base)
          ) {
            stable = 0;
            return false;
          }
          if (page.href === last) stable += 1;
          else {
            last = page.href;
            stable = 0;
          }
          return stable >= 2;
        },
        path,
        45000,
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : error} [${detail}]`,
      );
    }
    await delay(200);
  }
  async function waitText(text) {
    await until(async () => (await textOf()).includes(text), text);
  }
  async function click(selector, text) {
    const query = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((element) => element.checkVisibility() && element.textContent.trim() === ${JSON.stringify(text)})`;
    await until(async () => evaluate(`Boolean(${query})`), text);
    await evaluate(`${query}.click()`);
    await delay(200);
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
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(field),
        "value",
      )?.set;
      field._valueTracker?.setValue("");
      setter?.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await cdp("Input.insertText", { text: value });
    const applied = await evaluate(
      `document.querySelector(${selector}).value === ${JSON.stringify(value)}`,
    );
    if (applied !== true) throw new Error(`입력하지 못했습니다: ${name}`);
  }
  async function shot(name) {
    const image = await cdp("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shotDir, name), Buffer.from(image.data, "base64"));
  }
  async function viewport(width) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await delay(200);
  }
  async function noOverflow() {
    const overflow = await evaluate(
      "document.documentElement.scrollWidth - document.documentElement.clientWidth",
    );
    assert.ok(overflow <= 1, `가로 넘침 ${overflow}`);
  }
  async function confirm(email, name, next = "/mypage") {
    const latest = await (await fetch(`${mock.url}/__test/latest`)).json();
    assert.equal(latest.email, email);
    assert.ok(latest.code);
    assert.equal(
      latest.redirectTo?.startsWith("http://127.0.0.1:4333/auth/callback"),
      true,
    );
    await goto(
      `/auth/callback?code=${encodeURIComponent(latest.code)}&next=${encodeURIComponent(next)}`,
    );
    await waitText(name);
    const href = await evaluate("location.href");
    assert.equal(href.includes("code="), false);
    assert.equal(href.includes(latest.code), false);
    assert.equal(href.startsWith("http://evil.example"), false);
  }

  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await viewport(390);

  await goto("/booking/lookup");
  await waitText("예약 조회");
  await fill("reservationNo", "R-20261113-0001");
  await fill("email", "guest-test@example.invalid");
  await click("button", "조회");
  await waitText("테스트상담사");

  await goto("/admin");
  await waitText("관리자");
  assert.match(await textOf(), /이메일/);

  await goto("/login");
  await waitText("로그인");
  const buttonHeight = await evaluate(
    "document.querySelector('button[type=submit]').getBoundingClientRect().height",
  );
  assert.ok(buttonHeight >= 44);
  await click("button", "로그인");
  await until(
    async () =>
      (await evaluate("document.activeElement?.getAttribute('name')")) ===
      "email",
    "이메일 포커스",
  );
  await fill("password", password);
  await click("button", "표시");
  assert.equal(
    await evaluate("document.querySelector('[name=password]').type"),
    "text",
  );
  await click("button", "숨김");
  await click("a", "회원가입");
  await waitText("가입하기");
  await evaluate("history.back()");
  await waitText("비밀번호 재설정");
  assert.equal(
    await evaluate("document.querySelector('[name=password]').value"),
    "",
  );

  await fetch(`${mock.url}/__test/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delay: 1200 }),
  });
  await goto("/signup");
  await fill("name", nameA);
  await fill("email", emailA);
  await fill("password", password);
  await fill("passwordConfirm", password);
  await click("button", "가입하기");
  await waitText("가입 요청 중");
  assert.equal(
    await evaluate("document.querySelector('button[type=submit]').disabled"),
    true,
  );
  await waitText("이메일 인증 안내");
  const verifyText = await textOf();
  assert.match(
    verifyText,
    /인증 링크를 누르기 전에는 가입이 끝난 것이 아니에요/,
  );
  assert.equal(verifyText.includes("인증이 완료"), false);
  assert.equal(verifyText.includes(password), false);
  await fetch(`${mock.url}/__test/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delay: 0 }),
  });
  await confirm(emailA, nameA, "https://evil.example/phish");
  assert.match(await evaluate("location.pathname"), /^\/mypage$/);
  assert.match(await textOf(), /MY/);
  assert.equal((await textOf()).includes(password), false);

  for (const width of [360, 768, 1024]) {
    await viewport(width);
    await noOverflow();
    await shot(`mypage-${width}.png`);
  }
  await viewport(390);

  const used = await (await fetch(`${mock.url}/__test/latest`)).json();
  await goto(
    `/auth/callback?code=${encodeURIComponent(used.code)}&next=/mypage`,
  );
  await waitText("인증을 마치지 못했어요");
  assert.equal((await evaluate("location.href")).includes(used.code), false);

  await goto("/mypage");
  await waitText(nameA);
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  assert.match(await textOf(), /로그인/);
  assert.equal((await textOf()).includes(nameA), false);
  await evaluate("history.back()");
  await delay(1200);
  await until(
    async () => !(await textOf()).includes(nameA),
    "뒤로가기 후 이전 회원 정보",
    8000,
  );

  await goto("/login");
  await fill("email", emailA);
  await fill("password", password);
  await click("button", "로그인");
  await waitText(nameA);
  await goto("/forgot-password");
  await fill("email", emailA);
  await click("button", "재설정 메일 요청");
  await waitText("가입된 주소라면");
  await fetch(`${mock.url}/__test/expire`, { method: "POST" });
  const expired = await (await fetch(`${mock.url}/__test/latest`)).json();
  await goto(`/auth/callback?code=${encodeURIComponent(expired.code)}`);
  await waitText("만료됐거나 이미 사용");
  await goto("/forgot-password");
  await fill("email", emailA);
  await click("button", "재설정 메일 요청");
  await waitText("가입된 주소라면");
  await confirm(emailA, "새 비밀번호", "/admin");
  assert.equal(await evaluate("location.pathname"), "/auth/update-password");
  await fill("password", nextPassword);
  await fill("passwordConfirm", nextPassword);
  await click("button", "비밀번호 변경");
  await waitText("비밀번호를 변경했어요");
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  await fill("email", emailA);
  await fill("password", password);
  await click("button", "로그인");
  await waitText("이메일 또는 비밀번호가 맞지 않아요");
  await fill("email", emailA);
  await fill("password", nextPassword);
  await click("button", "로그인");
  await waitText(nameA);

  await click("button", "로그아웃");
  await waitText("회원가입");
  await goto("/signup");
  await fill("name", nameB);
  await fill("email", emailB);
  await fill("password", password);
  await fill("passwordConfirm", password);
  await click("button", "가입하기");
  await waitText("이메일 인증 안내");
  await confirm(emailB, nameB);
  const switched = await textOf();
  assert.match(switched, new RegExp(nameB));
  assert.equal(switched.includes(nameA), false);

  await goto("/admin");
  await waitText("관리자 권한이 없어요.");
  await fetch(`${mock.url}/__test/revoke`, { method: "POST" });
  await goto("/mypage");
  await waitText("비밀번호 재설정");
  assert.equal((await textOf()).includes(nameB), false);

  const bad = await fetch(`${mock.url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      apikey: mock.publicKey,
      authorization: `Bearer ${mock.publicKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      auth_code: "not-a-real-code",
      code_verifier: "not-the-verifier",
    }),
  });
  assert.equal(bad.status, 400);
  const report = await (await fetch(`${mock.url}/__test/requests`)).json();
  assert.equal(report.writes, 0);
  assert.ok(
    report.requests.some((item) => item.kind === "pkce" && item.matched),
  );
  assert.ok(
    report.requests
      .filter((item) => item.kind === "signup")
      .every(
        (item) =>
          item.data && Object.keys(item.data).every((key) => key === "name"),
      ),
  );
  assert.equal(logs.includes(password), false);
  assert.equal(logs.includes(nextPassword), false);
  assert.deepEqual(browserErrors, []);
  console.log("member auth browser checks passed");
} catch (error) {
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  try {
    console.error(await evaluate("location.href"));
    console.error(redact(await textOf()).slice(0, 800));
  } catch {}
  console.error(redact(logs));
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  stop(chrome);
  stop(app);
  mock.server.close();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await delay(300);
    }
  }
}
