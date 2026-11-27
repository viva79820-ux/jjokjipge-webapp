// 목 Supabase만 쓴다. 운영 DB와 비밀값은 읽지 않는다.
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
const memberEmail = "Member@Example.Invalid";
const adminEmail = "Admin@Example.Invalid";
const signupName = "테스트회원";
const signupEmail = "duplicate-keep@example.invalid";
const memberNext = "/mypage/reviews/new";
const adminNext = "/admin/reservations";
const screenshotDir = resolve("screenshots/login-keep-email");
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

const mock = await startAuthMock();
const base = `http://127.0.0.1:${port}`;
const profile = mkdtempSync(join(tmpdir(), "login-keep-email-"));
mkdirSync(screenshotDir, { recursive: true });
const env = { ...process.env };
for (const key of [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
]) {
  delete env[key];
}
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
let logs = "";
app.stdout.on("data", (chunk) => {
  logs = `${logs}${chunk}`.slice(-4000);
});
app.stderr.on("data", (chunk) => {
  logs = `${logs}${chunk}`.slice(-4000);
});

function stop(child) {
  if (!child?.pid) return;
  try {
    execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    // 이미 끝난 프로세스다.
  }
}

function redact(value) {
  return String(value).split(password).join("[redacted]");
}

async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  let last = "";
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
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
  const chrome = spawn(
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
  try {
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
    await new Promise((done, reject) => {
      ws.addEventListener("open", done, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(message.error.message));
      else waiter?.resolve(message.result);
    });
    const cdp = (method, params = {}) => {
      const id = ++sequence;
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };
    const evaluate = async (expression) => {
      const response = await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.text || "브라우저 실행 실패");
      }
      return response.result.value;
    };
    const textOf = () =>
      evaluate("document.body ? document.body.innerText : ''");
    const goto = async (path) => {
      const navigated = await cdp("Page.navigate", { url: `${base}${path}` });
      if (navigated.errorText) throw new Error(navigated.errorText);
      await until(async () => {
        const page = JSON.parse(
          await evaluate(
            "JSON.stringify({ state: document.readyState, href: location.href })",
          ),
        );
        return page.state === "complete" && String(page.href).startsWith(base);
      }, path);
      await delay(400);
    };
    const fill = async (fieldName, value) => {
      const selector = JSON.stringify(`[name="${fieldName}"]`);
      await until(
        async () => evaluate(`Boolean(document.querySelector(${selector}))`),
        fieldName,
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
      if (applied !== true)
        throw new Error(`입력하지 못했습니다: ${fieldName}`);
    };
    const emulate = async (width, fine) => {
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
      await delay(300);
    };
    const metrics = () =>
      evaluate(`(() => {
        const shell = document.querySelector("[data-app-shell]");
        return {
          shell: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
          overflow:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        };
      })()`);
    const shot = async (fileName) => {
      await evaluate(
        "document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())",
      );
      const { data } = await cdp("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(join(screenshotDir, fileName), Buffer.from(data, "base64"));
    };
    const fields = () =>
      evaluate(`JSON.stringify({
        email: document.querySelector('[name="email"]')?.value ?? null,
        password: document.querySelector('[name="password"]')?.value ?? null,
        passwordConfirm: document.querySelector('[name="passwordConfirm"]')?.value ?? null,
        name: document.querySelector('[name="name"]')?.value ?? null,
        next: document.querySelector('[name="next"]')?.value ?? null,
        focus: document.activeElement?.getAttribute("name") ?? "",
        age: document.querySelector('[name="ageConfirmed"]')?.checked ?? null,
        terms: document.querySelector('[name="termsAgreed"]')?.checked ?? null,
        privacy: document.querySelector('[name="privacyAgreed"]')?.checked ?? null,
        all: document.querySelector('section input[type="checkbox"]:not([name])')?.checked ?? null,
      })`).then((value) => JSON.parse(value));

    await cdp("Page.enable");
    await cdp("Runtime.enable");

    await goto(
      `/login?next=${encodeURIComponent(memberNext)}&notice=withdrawn`,
    );
    await until(
      async () => (await textOf()).includes("탈퇴가 완료되었어요"),
      "탈퇴 안내",
    );
    assert.match(
      await textOf(),
      /탈퇴가 완료되었어요\. 이 계정으로는 다시 로그인할 수 없어요\./,
    );
    await fill("email", memberEmail);
    await fill("password", password);
    await evaluate("document.querySelector('button[type=submit]').click()");
    await until(
      async () =>
        (await textOf()).includes("이메일 또는 비밀번호가 맞지 않아요."),
      "회원 로그인 실패",
      20000,
    );
    const member = await fields();
    assert.equal(member.email, memberEmail);
    assert.equal(member.password, "");
    assert.equal(member.focus, "password");
    assert.equal(member.next, memberNext);
    assert.match(await textOf(), /탈퇴가 완료되었어요/);
    assert.equal(await evaluate("location.pathname"), "/login");

    await evaluate(
      "document.querySelector('[name=email]').scrollIntoView({ block: 'start' })",
    );
    await delay(200);
    await emulate(360, false);
    const mobile = await metrics();
    assert.equal(mobile.shell, 360);
    assert.equal(mobile.fine, false);
    assert.equal(mobile.overflow, false);
    await shot("login-failed-360.png");
    await emulate(1280, true);
    const desktop = await metrics();
    assert.equal(desktop.shell, 560);
    assert.equal(desktop.fine, true);
    assert.equal(desktop.overflow, false);
    await shot("login-failed-pc560.png");
    const afterResize = await fields();
    assert.equal(afterResize.email, memberEmail);
    assert.equal(afterResize.password, "");
    assert.equal(afterResize.next, memberNext);

    await goto(`/admin/login?next=${encodeURIComponent(adminNext)}`);
    await until(
      async () => (await textOf()).includes("관리자"),
      "관리자 로그인",
    );
    await fill("email", adminEmail);
    await fill("password", password);
    await evaluate("document.querySelector('button[type=submit]').click()");
    await until(
      async () =>
        (await textOf()).includes("이메일 또는 비밀번호가 맞지 않아요."),
      "관리자 로그인 실패",
      20000,
    );
    const admin = await fields();
    assert.equal(admin.email, adminEmail);
    assert.equal(admin.password, "");
    assert.equal(admin.focus, "password");
    assert.equal(admin.next, adminNext);
    assert.equal(await evaluate("location.pathname"), "/admin/login");

    async function submitSignup() {
      await goto("/signup");
      await until(
        async () => (await textOf()).includes("가입하고 인증 메일 받기"),
        "가입 화면",
      );
      await evaluate("document.querySelector('input[type=checkbox]').click()");
      await fill("name", signupName);
      await fill("email", signupEmail);
      await fill("password", password);
      await fill("passwordConfirm", password);
      await evaluate("document.querySelector('button[type=submit]').click()");
    }
    await submitSignup();
    await until(
      async () => (await textOf()).includes("이메일 인증 안내"),
      "첫 가입",
      20000,
    );
    await submitSignup();
    await until(
      async () => (await textOf()).includes("이미 가입된 이메일이에요"),
      "중복 가입",
      20000,
    );
    const signup = await fields();
    assert.equal(signup.name, signupName);
    assert.equal(signup.email, signupEmail);
    assert.equal(signup.password, "");
    assert.equal(signup.passwordConfirm, "");
    assert.equal(signup.age, true);
    assert.equal(signup.terms, true);
    assert.equal(signup.privacy, true);
    assert.equal(signup.all, true);
    console.log(screenshotDir);
  } finally {
    stop(chrome);
  }
} catch (error) {
  console.error(redact(logs));
  throw error;
} finally {
  stop(app);
  mock.server.close();
  try {
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch {
    // 브라우저 프로필이 잠시 잠겨 있을 수 있다.
  }
}
