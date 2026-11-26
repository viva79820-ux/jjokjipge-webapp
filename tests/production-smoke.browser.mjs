// angelsaju.com 공개 화면을 읽기만 하며 점검한다.
// 주문, 예약, 가입, 문의처럼 데이터가 생기는 동작은 하지 않는다.
// 실행: node tests/production-smoke.browser.mjs
// 결과: tmp/production-smoke/report.md 와 화면별 스크린샷.
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const startUrl = "https://angelsaju.com";
const outDir = resolve("tmp/production-smoke");
const viewports = [
  { id: "touch", label: "터치 360×800", width: 360, height: 800, fine: false },
  { id: "pc", label: "PC 1280", width: 1280, height: 800, fine: true },
];
const homeProbe = await fetch(startUrl, { redirect: "follow" });
const site = new URL(homeProbe.url).origin;
const screens = [
  { id: "home", label: "홈", path: "/" },
  {
    id: "consult",
    label: "전화상담",
    path: "/consult",
    collect: {
      label: "상담사 상세",
      prefix: "consult-detail",
      count: 2,
      test: consultPath,
    },
  },
  {
    id: "class",
    label: "클래스",
    path: "/class",
    collect: {
      label: "클래스 상세",
      prefix: "class-detail",
      count: 2,
      test: classPath,
    },
  },
  { id: "stores", label: "매장상담", path: "/stores" },
  {
    id: "shop",
    label: "타로샵",
    path: "/shop",
    collect: {
      label: "상품 상세",
      prefix: "shop-detail",
      count: 3,
      test: shopPath,
    },
  },
  { id: "cart-alias", label: "장바구니 경로 /cart", path: "/cart" },
  { id: "cart", label: "장바구니", path: "/shop/cart" },
  { id: "contents", label: "콘텐츠", path: "/contents" },
  { id: "reviews", label: "후기", path: "/reviews" },
  {
    id: "notices",
    label: "공지",
    path: "/notices",
    collect: {
      label: "공지 상세",
      prefix: "notice-detail",
      count: 1,
      test: noticePath,
    },
  },
  { id: "booking-lookup", label: "예약 조회", path: "/booking/lookup" },
  { id: "login", label: "로그인", path: "/login" },
  { id: "signup", label: "회원가입", path: "/signup" },
  { id: "forgot-password", label: "비밀번호 찾기", path: "/forgot-password" },
  { id: "terms", label: "이용약관", path: "/terms" },
  { id: "privacy-consent", label: "개인정보 동의", path: "/privacy-consent" },
  { id: "ai-saju", label: "AI 사주", path: "/ai-saju" },
];

mkdirSync(outDir, { recursive: true });
for (const name of ["report.md"]) {
  rmSync(join(outDir, name), { force: true });
}

const issues = [];
const results = [];
const notes = [
  `시작 주소 ${startUrl} 의 최종 출처는 ${site} 이다.`,
  "장바구니 화면 링크는 /shop/cart 이다. /cart 도 따로 연다.",
  "이용약관 /terms, 개인정보 동의 /privacy-consent, AI 사주 /ai-saju 는 코드의 경로를 그대로 연다.",
];
const browser = await launchBrowser();

try {
  await browser.prepare();
  for (let index = 0; index < screens.length; index += 1) {
    const screen = screens[index];
    console.log(`CHECK ${screen.path}`);
    const checked = await checkScreen(browser, screen);
    results.push(checked);
    if (screen.id === "home") notePaths("홈", checked.links, "/ai-saju");
    if (screen.id === "shop") notePaths("타로샵", checked.links, "/shop/cart");
    if (!screen.collect) continue;
    const found = uniquePaths(checked.links, screen.collect.test).slice(
      0,
      screen.collect.count,
    );
    if (found.length < screen.collect.count) {
      issues.push({
        severity: "high",
        screen: screen.label,
        path: screen.path,
        viewport: "공통",
        detail: `${screen.collect.label} 링크가 ${found.length}개뿐이다. ${screen.collect.count}개를 기대했다.`,
      });
    }
    const details = found.map((path, detailIndex) => ({
      id: `${screen.collect.prefix}-${detailIndex + 1}`,
      label: `${screen.collect.label} ${detailIndex + 1}`,
      path,
    }));
    screens.splice(index + 1, 0, ...details);
  }
} finally {
  try {
    await browser.close();
  } catch (error) {
    console.log(`CLEANUP ${error.message}`);
  }
}

const ranked = [...issues].sort(compareIssue);
writeFileSync(join(outDir, "report.md"), renderReport(ranked), "utf8");
console.log(`REPORT ${join(outDir, "report.md")}`);
console.log(`ISSUES ${ranked.length}`);

function consultPath(path) {
  return /^\/consult\/[^/]+$/.test(path);
}
function classPath(path) {
  return /^\/class\/[^/]+$/.test(path);
}
function shopPath(path) {
  return /^\/shop\/[^/]+$/.test(path) && path !== "/shop/cart";
}
function noticePath(path) {
  return /^\/notices\/[^/]+$/.test(path);
}

function uniquePaths(hrefs, test) {
  const seen = [];
  for (const href of hrefs) {
    const path = pathOf(href);
    if (!path || !test(path) || seen.includes(path)) continue;
    seen.push(path);
  }
  return seen;
}

function pathOf(href) {
  try {
    const url = new URL(href, site);
    if (url.origin !== site) return "";
    return url.pathname;
  } catch {
    return "";
  }
}

function notePaths(label, hrefs, expected) {
  const found = uniquePaths(
    hrefs,
    (path) => path === expected || path.startsWith(`${expected}/`),
  );
  notes.push(
    found.length
      ? `${label} 링크에서 ${found.join(", ")} 를 확인했다.`
      : `${label} 링크에는 ${expected} 가 없다. 주소로 직접 연다.`,
  );
}

async function checkScreen(page, screen) {
  const views = [];
  let links = [];
  for (const viewport of viewports) {
    const shot = `${screen.id}-${viewport.id}.png`;
    try {
      await page.emulate(viewport);
      const loaded = await page.open(`${site}${screen.path}`);
      const reading = await page.evaluate(readPage);
      if (viewport.id === "touch") links = reading.links || [];
      await page.screenshot(join(outDir, shot));
      const viewIssues = judge(screen, viewport, loaded, reading);
      for (const issue of viewIssues) issues.push(issue);
      views.push({
        viewport: viewport.label,
        status: loaded.status,
        finalPath: loaded.finalPath,
        shot,
        issues: viewIssues,
        title: reading.title,
        h1: reading.h1,
        appWidth: reading.appWidth,
        overflow: reading.overflow,
        popupClosed: reading.popupClosed,
      });
    } catch (error) {
      const failure = {
        severity: "severe",
        screen: screen.label,
        path: screen.path,
        viewport: viewport.label,
        detail: `점검을 끝내지 못했다: ${clip(error.message)}`,
      };
      issues.push(failure);
      views.push({
        viewport: viewport.label,
        status: 0,
        finalPath: screen.path,
        shot,
        issues: [failure],
        title: "",
        h1: [],
        appWidth: 0,
        overflow: 0,
        popupClosed: false,
      });
    }
  }
  return { screen, views, links };
}

function judge(screen, viewport, loaded, reading) {
  const found = [];
  const where = {
    screen: screen.label,
    path: screen.path,
    viewport: viewport.label,
  };
  if (loaded.status !== 200) {
    found.push({
      ...where,
      severity: "severe",
      detail: `HTTP ${loaded.status}. 최종 경로 ${loaded.finalPath}.`,
    });
  }
  if (reading.missingPage) {
    found.push({
      ...where,
      severity: "severe",
      detail: "화면에 페이지를 찾을 수 없다는 문구가 있다.",
    });
  }
  for (const message of reading.exceptions) {
    found.push({
      ...where,
      severity: "severe",
      detail: `처리되지 않은 예외: ${clip(message)}`,
    });
  }
  for (const message of reading.consoleErrors) {
    found.push({
      ...where,
      severity: "high",
      detail: `콘솔 오류: ${clip(message)}`,
    });
  }
  for (const image of reading.images) {
    found.push({
      ...where,
      severity: "high",
      detail: `깨진 이미지(naturalWidth 0): ${clip(image)}`,
    });
  }
  if (reading.overflow > 1) {
    found.push({
      ...where,
      severity: "high",
      detail: `가로 넘침 ${reading.overflow}px.`,
    });
  }
  if (reading.covered) {
    found.push({
      ...where,
      severity: "high",
      detail: `마지막 버튼이 ${reading.covered.bar}에 가려짐: ${clip(reading.covered.text)}`,
    });
  }
  const expectedWidth = viewport.fine ? 560 : viewport.width;
  if (reading.appWidth !== expectedWidth) {
    found.push({
      ...where,
      severity: "medium",
      detail: `앱 폭 ${reading.appWidth}px. 기대값 ${expectedWidth}px.`,
    });
  }
  if (!reading.h1.length || reading.h1.every((text) => text.length === 0)) {
    found.push({
      ...where,
      severity: "medium",
      detail: "제목(h1)이 비어 있다.",
    });
  }
  if (!reading.title.trim()) {
    found.push({
      ...where,
      severity: "medium",
      detail: "문서 제목이 비어 있다.",
    });
  }
  for (const hit of reading.placeholders) {
    found.push({
      ...where,
      severity: "medium",
      detail: `임시 문구 ${hit.name}: ${clip(hit.sample)}`,
    });
  }
  return found;
}

function compareIssue(left, right) {
  const rank = { severe: 0, high: 1, medium: 2 };
  return (
    rank[left.severity] - rank[right.severity] ||
    left.path.localeCompare(right.path)
  );
}

function renderReport(ranked) {
  const when = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());
  const lines = [
    "# 운영 공개 화면 점검",
    "",
    `- 시각: ${when}`,
    `- 사이트: ${site}`,
    "- 읽기 전용이다. 주문, 예약, 가입, 문의를 제출하지 않았다.",
    "- 뷰포트: 터치 360×800, PC 1280×800(앱 폭 560).",
    "",
    "## 확인 메모",
    "",
    ...notes.map((note) => `- ${note}`),
    "",
    "## 문제",
    "",
  ];
  if (!ranked.length) {
    lines.push("발견한 문제가 없다.");
  } else {
    for (const severity of ["severe", "high", "medium"]) {
      const group = ranked.filter((issue) => issue.severity === severity);
      if (!group.length) continue;
      lines.push(`### ${severityLabel(severity)}`, "");
      for (const issue of group) {
        lines.push(
          `- ${issue.screen} \`${issue.path}\` / ${issue.viewport}: ${issue.detail}`,
        );
      }
      lines.push("");
    }
  }
  lines.push("## 화면별 결과", "");
  for (const result of results) {
    lines.push(`### ${result.screen.label} \`${result.screen.path}\``, "");
    for (const view of result.views) {
      const outcome = view.issues.length
        ? view.issues.map((issue) => issue.detail).join(" ")
        : "문제 없음";
      lines.push(
        `- ${view.viewport}: HTTP ${view.status}, 앱 폭 ${view.appWidth}px, 가로 넘침 ${view.overflow}px. ${outcome}`,
      );
      lines.push(`  - 스크린샷: \`tmp/production-smoke/${view.shot}\``);
      if (view.popupClosed)
        lines.push("  - 공지 팝업의 닫기만 눌렀다. 서버에는 쓰지 않는다.");
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function severityLabel(severity) {
  if (severity === "severe") return "심각";
  if (severity === "high") return "높음";
  return "보통";
}

function clip(text) {
  return String(text).replace(/\s+/g, " ").trim().slice(0, 180);
}

async function readPage() {
  const shell = document.querySelector("[data-app-shell]");
  const main = document.querySelector("main") || document.body;
  const links = [...document.querySelectorAll("a[href]")].map((node) =>
    node.getAttribute("href"),
  );
  const visibleText = [
    document.body ? document.body.innerText : "",
    ...[...document.querySelectorAll("[placeholder]")].map((node) =>
      node.getAttribute("placeholder"),
    ),
  ].join("\n");
  await loadImages();
  const images = [...document.images]
    .filter((image) => image.getAttribute("src") && image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.getAttribute("src") || "")
    .filter((src) => src && !src.startsWith("data:"));
  const popupClosed = closeNoticePopup();
  if (popupClosed) await wait(400);
  window.scrollTo(0, document.documentElement.scrollHeight);
  await wait(100);
  return {
    title: document.title || "",
    h1: [...document.querySelectorAll("h1")].map((node) =>
      node.textContent.trim(),
    ),
    appWidth: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    images: [...new Set(images)],
    covered: coveredControl(main),
    placeholders: placeholderHits(visibleText),
    popupClosed,
    missingPage:
      /페이지를 찾을 수 없|This page could not be found|Application error/i.test(
        document.body ? document.body.innerText : "",
      ),
    links,
  };

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function closeNoticePopup() {
    const dialog = [...document.querySelectorAll("[role='dialog']")].find(
      (node) => {
        const title = node.getAttribute("aria-label") || node.textContent || "";
        const close = [...node.querySelectorAll("button")].some(
          (button) => button.textContent.trim() === "닫기",
        );
        return title.includes("공지사항") && close;
      },
    );
    if (!dialog) return false;
    const button = [...dialog.querySelectorAll("button")].find(
      (node) => node.textContent.trim() === "닫기",
    );
    button.click();
    return true;
  }

  async function loadImages() {
    for (const image of document.images) {
      if (image.loading === "lazy") image.loading = "eager";
    }
    const step = window.innerHeight || 800;
    const max = document.documentElement.scrollHeight;
    for (let top = 0; top <= max; top += step) {
      window.scrollTo(0, top);
      await wait(80);
    }
    const pending = [...document.images].filter(
      (image) => image.src && !image.complete,
    );
    await Promise.race([
      Promise.all(
        pending.map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
        ),
      ),
      wait(4000),
    ]);
  }

  function coveredControl(root) {
    const bars = [
      ...document.querySelectorAll(
        "[data-app-bar], [data-booking-bar], #bottom-phone-call",
      ),
    ].filter((node) => node.getClientRects().length);
    const controls = [
      ...root.querySelectorAll("button, a[href], input[type='submit']"),
    ].filter((node) => {
      if (!node.getClientRects().length) return false;
      if (node.closest("[data-app-bar], [data-booking-bar], [role='dialog']"))
        return false;
      return node.textContent.trim().length > 0;
    });
    let last = null;
    let lastBottom = -1;
    for (const control of controls) {
      const bottom = control.getBoundingClientRect().bottom + window.scrollY;
      if (bottom < lastBottom) continue;
      last = control;
      lastBottom = bottom;
    }
    if (!last) return null;
    const rect = last.getBoundingClientRect();
    for (const bar of bars) {
      const box = bar.getBoundingClientRect();
      const across =
        Math.min(rect.right, box.right) - Math.max(rect.left, box.left);
      const down =
        Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top);
      if (across <= 1 || down <= 1) continue;
      const name =
        bar.id === "bottom-phone-call" ? "하단 전화 버튼" : "하단 고정 바";
      return { text: last.textContent.trim(), bar: name };
    }
    return null;
  }

  function placeholderHits(text) {
    const rules = [
      { name: "TODO", pattern: /\bTODO\b/i },
      { name: "lorem", pattern: /lorem/i },
      { name: "asdf", pattern: /\basdf\b/i },
      { name: "010-0000-0000", pattern: /010-0000-0000/ },
      { name: "확인 필요", pattern: /확인 필요/ },
    ];
    const hits = [];
    for (const rule of rules) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      const at = match.index || 0;
      hits.push({
        name: rule.name,
        sample: text.slice(Math.max(0, at - 24), at + match[0].length + 24),
      });
    }
    return hits;
  }
}

async function launchBrowser() {
  const candidates = [
    process.env.SUPPORT_CHROME,
    process.env.NOTICES_CHROME,
    process.env.LOCALAPPDATA &&
      join(
        process.env.LOCALAPPDATA,
        "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
      ),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ];
  const exe = candidates.find((path) => path && existsSync(path));
  if (!exe) throw new Error("Chromium 실행 파일을 찾지 못했습니다.");
  const profile = join(tmpdir(), `production-smoke-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const child = spawn(
    exe,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const port = await readDebugPort(profile);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find((item) => item.type === "page");
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const rpc = createRpc(socket);
  const state = { consoleErrors: [], exceptions: [], documents: [] };
  rpc.on("Runtime.consoleAPICalled", (params) => {
    if (params.type !== "error") return;
    const text = (params.args || [])
      .map(
        (arg) => arg.value || arg.description || arg.unserializableValue || "",
      )
      .join(" ");
    if (/React DevTools|favicon\.ico/i.test(text)) return;
    state.consoleErrors.push(text);
  });
  rpc.on("Runtime.exceptionThrown", (params) => {
    state.exceptions.push(
      params.exceptionDetails?.exception?.description ||
        params.exceptionDetails?.text ||
        "exception",
    );
  });
  rpc.on("Network.responseReceived", (params) => {
    if (params.type === "Document") {
      state.documents.push({
        url: params.response.url,
        status: params.response.status,
      });
    }
  });
  return {
    async prepare() {
      await rpc.call("Page.enable");
      await rpc.call("Runtime.enable");
      await rpc.call("Network.enable");
      await rpc.call("Network.setCacheDisabled", { cacheDisabled: true });
      await rpc.call("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
          const block = /가입|주문|결제|예약 신청|문의하기|문의 등록|장바구니 담기/;
          addEventListener("submit", (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
          }, true);
          addEventListener("click", (event) => {
            const control = event.target.closest && event.target.closest("button, input, a");
            if (!control) return;
            const text = (control.innerText || control.value || "").trim();
            const submit = control.matches("button[type='submit'], input[type='submit']");
            if (submit || block.test(text)) {
              event.preventDefault();
              event.stopImmediatePropagation();
            }
          }, true);
        })();`,
      });
    },
    async emulate(viewport) {
      await rpc.call("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: !viewport.fine,
      });
      await rpc.call("Emulation.setTouchEmulationEnabled", {
        enabled: !viewport.fine,
        maxTouchPoints: viewport.fine ? 1 : 5,
      });
      await rpc.call("Emulation.setEmulatedMedia", {
        media: "screen",
        features: viewport.fine
          ? [
              { name: "hover", value: "hover" },
              { name: "pointer", value: "fine" },
            ]
          : [
              { name: "hover", value: "none" },
              { name: "pointer", value: "coarse" },
            ],
      });
    },
    async open(url) {
      state.consoleErrors = [];
      state.exceptions = [];
      state.documents = [];
      await rpc.call("Page.navigate", { url: "about:blank" });
      await delay(100);
      state.consoleErrors = [];
      state.exceptions = [];
      state.documents = [];
      const navigation = await rpc.call("Page.navigate", { url });
      if (navigation.errorText) throw new Error(navigation.errorText);
      await until(async () => {
        const ready = await this.evaluate("document.readyState");
        return ready === "complete";
      }, url);
      await delay(800);
      const documentResponse = [...state.documents]
        .reverse()
        .find((item) => item.url !== "about:blank");
      let finalPath = url;
      try {
        finalPath = new URL(await this.evaluate("location.href")).pathname;
      } catch {
        finalPath = url;
      }
      return {
        status: documentResponse ? documentResponse.status : 0,
        finalPath,
      };
    },
    async evaluate(expression) {
      const source =
        typeof expression === "function"
          ? `(${expression})()`
          : String(expression);
      const result = await rpc.call("Runtime.evaluate", {
        expression: source,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        const detail = result.exceptionDetails.exception?.description;
        throw new Error(
          detail || result.exceptionDetails.text || "브라우저 평가 실패",
        );
      }
      const value = result.result.value;
      if (value && typeof value === "object") {
        value.consoleErrors = [...state.consoleErrors];
        value.exceptions = [...state.exceptions];
      }
      return value;
    },
    async screenshot(file) {
      const image = await rpc.call(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: true },
        60000,
      );
      writeFileSync(file, Buffer.from(image.data, "base64"));
    },
    async close() {
      try {
        socket.close();
      } catch {
        /* 이미 닫힌 소켓이다. */
      }
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            windowsHide: true,
            stdio: "ignore",
          });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        /* 브라우저가 이미 종료됐다. */
      }
      await delay(500);
      try {
        rmSync(profile, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
      } catch {
        // 브라우저가 프로필을 잠시 붙잡고 있어도 점검 결과는 남긴다.
      }
    },
  };
}

function createRpc(socket) {
  let serial = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
      return;
    }
    for (const listener of listeners.get(message.method) || [])
      listener(message.params || {});
  });
  return {
    call(method, params = {}, timeout = 30000) {
      return new Promise((resolve, reject) => {
        const id = (serial += 1);
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP 시간 초과: ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, listener) {
      const list = listeners.get(method) || [];
      list.push(listener);
      listeners.set(method, list);
    },
  };
}

async function readDebugPort(profile) {
  const file = join(profile, "DevToolsActivePort");
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (existsSync(file)) {
      const port = readFileSync(file, "utf8").split(/\r?\n/)[0];
      if (port) return port;
    }
    await delay(100);
  }
  throw new Error("Chromium 디버그 포트가 열리지 않았습니다.");
}

async function until(fn, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await fn()) return;
    await delay(100);
  }
  throw new Error(`시간 초과: ${label}`);
}
