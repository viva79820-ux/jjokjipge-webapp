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
const shotDir = resolve("tmp/member-auth-v2");
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
delete env.VERCEL_ENV;
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
    detached: process.platform !== "win32",
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
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
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
  async function replace(name, value, expected = value) {
    const selector = JSON.stringify(`[name="${name}"]`);
    await until(
      async () => evaluate(`Boolean(document.querySelector(${selector}))`),
      name,
    );
    await evaluate(`(() => {
      const field = document.querySelector(${selector});
      field.focus();
      field.select();
    })()`);
    await cdp("Input.insertText", { text: value });
    await until(
      async () =>
        (await evaluate(`document.querySelector(${selector}).value`)) ===
        expected,
      `${name} 수정`,
    );
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
  async function layoutMetrics() {
    return evaluate(`(() => {
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].filter((node) =>
          node.checkVisibility(),
        );
      const shell = document.querySelector("[data-app-shell]");
      const bar = visible("[data-app-bar]")[0] ?? null;
      const booking = visible("[data-booking-bar]")[0] ?? null;
      const main = document.querySelector("main");
      return {
        app: shell ? Math.round(shell.getBoundingClientRect().width) : null,
        bar: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        booking: booking
          ? Math.round(booking.getBoundingClientRect().width)
          : null,
        bars: visible("[data-app-bar]").length,
        bookings: visible("[data-booking-bar]").length,
        headers: visible("[data-site-header]").length,
        detailHeaders: visible("[data-counselor-header]").length,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        pad: main ? Number.parseFloat(getComputedStyle(main).paddingBottom) : 0,
        barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        phoneRise: (() => {
          const phone = bar?.querySelector("#bottom-phone-call span");
          if (!bar || !phone) return 0;
          return Math.max(
            0,
            Math.round(
              bar.getBoundingClientRect().top -
                phone.getBoundingClientRect().top,
            ),
          );
        })(),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        hover: matchMedia("(hover: hover)").matches,
        pointer: matchMedia("(pointer: fine)").matches,
        labels: bar
          ? [...bar.children].map(
              (node) => node.querySelectorAll("span")[1]?.textContent ?? "",
            )
          : [],
        account: bar?.lastElementChild?.getAttribute("href") ?? "",
      };
    })()`);
  }
  async function assertWidths(name, options) {
    const widths = [
      [360, false, 360],
      [390, false, 390],
      [430, false, 430],
      [768, false, 768],
      [1024, false, 1024],
      [1280, true, 560],
    ];
    for (const [width, fine, expected] of widths) {
      await emulate(width, fine);
      const metrics = await layoutMetrics();
      assert.equal(
        metrics.fine,
        fine,
        `${name} ${width} pointer hover=${metrics.hover} finePointer=${metrics.pointer}`,
      );
      assert.equal(
        metrics.app,
        expected,
        `${name} ${width} app ${metrics.app}`,
      );
      assert.ok(
        metrics.overflow <= 1,
        `${name} ${width} 가로 넘침 ${metrics.overflow}`,
      );
      if (options.tabs) {
        assert.equal(metrics.bars, 1, `${name} ${width} tabs`);
        assert.equal(metrics.bookings, 0, `${name} ${width} booking`);
        assert.equal(metrics.bar, expected, `${name} ${width} tab width`);
        assert.ok(
          metrics.pad + 1 >= metrics.barHeight + metrics.phoneRise,
          `${name} ${width} 하단 메뉴 가림`,
        );
        assert.deepEqual(metrics.labels, options.labels);
        assert.equal(metrics.account, options.account);
      } else {
        assert.equal(metrics.bars, 0, `${name} ${width} tabs`);
        assert.equal(metrics.bookings, 1, `${name} ${width} booking`);
        assert.equal(
          metrics.booking,
          expected,
          `${name} ${width} booking width`,
        );
        assert.equal(metrics.headers, 0, `${name} ${width} site header`);
        assert.equal(
          metrics.detailHeaders,
          1,
          `${name} ${width} detail header`,
        );
      }
      await shot(`${name}-${width}.png`);
    }
    await emulate(390, false);
  }
  const loggedOutLabels = ["홈", "카테고리", "전화하기", "예약조회", "로그인"];
  const loggedInLabels = ["홈", "카테고리", "전화하기", "예약조회", "MY"];
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
  await click("button", "예약 조회하기");
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

  await assertWidths("login", {
    tabs: true,
    labels: loggedOutLabels,
    account: "/login",
  });
  await goto("/category");
  await waitText("고객센터");
  await assertWidths("category", {
    tabs: true,
    labels: loggedOutLabels,
    account: "/login",
  });
  await goto("/");
  await waitText("타로");
  await assertWidths("home", {
    tabs: true,
    labels: loggedOutLabels,
    account: "/login",
  });
  await goto("/consult/a");
  await waitText("전화상담 예약하기");
  await waitText("선생님 소개");
  await assertWidths("consult", { tabs: false });

  await fetch(`${mock.url}/__test/mode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delay: 1200 }),
  });
  await goto("/signup");
  await shot("signup-390.png");
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
  await shot("verify-390.png");
  const verifyText = await textOf();
  assert.match(
    verifyText,
    /확인 버튼을 누르기 전에는 가입이 끝난 것이 아니에요/,
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

  await assertWidths("mypage", {
    tabs: true,
    labels: loggedInLabels,
    account: "/mypage",
  });
  await goto("/consult/a");
  await waitText("전화상담 예약하기");
  const memberDetail = await textOf();
  assert.equal(memberDetail.includes(nameA), false);
  await assertWidths("consult-member", { tabs: false });

  await goto("/consult/a/book?product=11111111-1111-4111-8111-111111111111");
  await waitText("전화상담 예약");
  assert.deepEqual(
    await evaluate(`(() => {
      const value = (name) =>
        document.querySelector(\`[name="\${name}"]\`)?.value ?? null;
      return {
        name: value("name"),
        phone: value("phone"),
        email: value("email"),
      };
    })()`),
    {
      name: nameA,
      phone: "010-1234-5678",
      email: emailA,
    },
  );
  await replace("name", nameB);
  await replace("phone", "01099998888", "010-9999-8888");
  await replace("email", emailB);
  assert.deepEqual(
    await evaluate(`(() => {
      const value = (name) =>
        document.querySelector(\`[name="\${name}"]\`)?.value ?? null;
      return {
        name: value("name"),
        phone: value("phone"),
        email: value("email"),
      };
    })()`),
    {
      name: nameB,
      phone: "010-9999-8888",
      email: emailB,
    },
  );
  await assertWidths("member-booking", {
    tabs: true,
    labels: loggedInLabels,
    account: "/mypage",
  });

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
  await click("button", "재설정 메일 보내기");
  await waitText("가입된 주소라면");
  await shot("forgot-password-390.png");
  await fetch(`${mock.url}/__test/expire`, { method: "POST" });
  const expired = await (await fetch(`${mock.url}/__test/latest`)).json();
  await goto(`/auth/callback?code=${encodeURIComponent(expired.code)}`);
  await waitText("만료됐거나 이미 사용");
  await goto("/forgot-password");
  await fill("email", emailA);
  await click("button", "재설정 메일 보내기");
  await waitText("가입된 주소라면");
  await confirm(emailA, "새 비밀번호", "/admin");
  assert.equal(await evaluate("location.pathname"), "/auth/update-password");
  await fill("password", nextPassword);
  await fill("passwordConfirm", nextPassword);
  await click("button", "비밀번호 변경");
  await waitText("비밀번호를 변경했어요");
  await shot("password-updated-390.png");
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

  async function logoutRequests() {
    const report = await (await fetch(`${mock.url}/__test/requests`)).json();
    return report.requests.filter((item) => item.kind === "logout").length;
  }
  async function loginAs(email, secret, expectedName) {
    await goto("/login");
    await fill("email", email);
    await fill("password", secret);
    await click("button", "로그인");
    await waitText(expectedName);
  }
  function storageBlock(method) {
    if (method === "access") {
      return `Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });`;
    }
    return `Object.defineProperty(window.sessionStorage, ${JSON.stringify(method)}, { configurable: true, value() { throw new DOMException("blocked", "SecurityError"); } });`;
  }
  function storageProbe(method) {
    if (method === "access") return "void window.sessionStorage;";
    if (method === "getItem") return `window.sessionStorage.getItem("x");`;
    if (method === "removeItem")
      return `window.sessionStorage.removeItem("x");`;
    return `window.sessionStorage.setItem("x", "1");`;
  }
  async function patchStorage(method) {
    const applied = await evaluate(`(() => {
      ${storageBlock(method)}
      try { ${storageProbe(method)} return false; }
      catch (error) { return error.name === "SecurityError"; }
    })()`);
    if (applied !== true)
      throw new Error(`저장소 ${method} 실패를 만들지 못했습니다.`);
  }
  let documentScript = null;
  async function failStorageOnNextPages(method) {
    const source = storageBlock(method);
    const added = await cdp("Page.addScriptToEvaluateOnNewDocument", {
      source,
    });
    documentScript = added.identifier;
  }
  async function clearDocumentScript() {
    if (!documentScript) return;
    await cdp("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: documentScript,
    });
    documentScript = null;
  }
  async function leaveProtectedPage() {
    await evaluate("history.back()");
    await delay(800);
    await until(
      async () =>
        !(await textOf()).includes(nameB) && !(await textOf()).includes(nameA),
      "저장소 실패 후 뒤로가기",
      8000,
    );
  }

  const beforeBlockedSet = await logoutRequests();
  await patchStorage("setItem");
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  assert.ok((await logoutRequests()) > beforeBlockedSet);
  assert.equal((await textOf()).includes(nameB), false);
  await leaveProtectedPage();
  await loginAs(emailA, nextPassword, nameA);
  assert.equal((await textOf()).includes(nameB), false);
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");

  await failStorageOnNextPages("getItem");
  await goto("/login");
  assert.equal(
    await evaluate(
      `(() => { try { ${storageProbe("getItem")} return false; } catch (error) { return error.name === "SecurityError"; } })()`,
    ),
    true,
  );
  await waitText("비밀번호 재설정");
  assert.equal(
    browserErrors.some((item) => String(item).includes("SecurityError")),
    false,
  );
  await clearDocumentScript();
  await goto("/login");

  await loginAs(emailB, password, nameB);
  await failStorageOnNextPages("removeItem");
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  assert.equal(
    await evaluate(
      `(() => { try { ${storageProbe("removeItem")} return false; } catch (error) { return error.name === "SecurityError"; } })()`,
    ),
    true,
  );
  await until(async () => {
    const href = await evaluate("location.href");
    await delay(400);
    const next = await evaluate("location.href");
    return href === next && String(href).includes("/login");
  }, "removeItem 실패 후 로그인 화면 유지");
  assert.equal(
    await evaluate("document.querySelector('button[type=submit]').disabled"),
    false,
  );
  await clearDocumentScript();

  await loginAs(emailB, password, nameB);
  const beforeAccess = await logoutRequests();
  await patchStorage("access");
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  assert.ok((await logoutRequests()) > beforeAccess);
  await leaveProtectedPage();

  await loginAs(emailB, password, nameB);
  const beforeNetwork = await logoutRequests();
  await evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      if (headers.has("next-action")) {
        window.fetch = original;
        return Promise.reject(new TypeError("network down"));
      }
      return original(input, init);
    };
  })()`);
  await click("button", "로그아웃");
  await waitText("로그아웃하지 못했어요");
  assert.equal(await logoutRequests(), beforeNetwork);
  assert.equal(
    await evaluate("document.querySelector('button[type=submit]').disabled"),
    false,
  );
  await until(
    async () =>
      (await evaluate("document.activeElement?.getAttribute('role')")) ===
      "alert",
    "로그아웃 오류 포커스",
  );
  const alertText = await evaluate(
    "document.querySelector('[role=alert]')?.textContent ?? ''",
  );
  assert.equal(alertText.includes("network down"), false);
  assert.equal(alertText.includes(emailB), false);
  assert.equal(alertText.includes(password), false);
  await click("button", "로그아웃");
  await waitText("비밀번호 재설정");
  assert.equal((await textOf()).includes(nameB), false);
  await loginAs(emailA, nextPassword, nameA);
  assert.equal((await textOf()).includes(nameB), false);
  assert.equal((await textOf()).includes("관리자 페이지"), false);

  await goto("/admin");
  await waitText("관리자 권한이 없어요.");
  const promoted = await fetch(`${mock.url}/__test/role`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: emailA, role: "admin" }),
  });
  assert.equal(promoted.ok, true);
  await goto("/mypage");
  await waitText("관리자 페이지");
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll("a")].find((node) => node.textContent.trim() === "관리자 페이지")?.getAttribute("href")`,
    ),
    "/admin",
  );
  await click("a", "관리자 페이지");
  await until(() => evaluate('location.pathname === "/admin"'), "admin page");
  await until(async () => {
    const text = await textOf();
    return (
      text.includes("쪽집게천사 운세통 관리자") &&
      !text.includes("관리자 권한이 없어요.")
    );
  }, "admin allowed");
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
