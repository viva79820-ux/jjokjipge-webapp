// 격리된 HTTP 모형과 실제 Chromium만 사용한다. 실제 Supabase에는 접속하지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  browser,
  delay,
  server,
  stop,
  until,
} from "./notices-browser-tools.mjs";

const longTitle = `${"가".repeat(90)}긴제목끝`;
const longUrl = `https://example.com/${"a".repeat(180)}`;
const rows = [
  {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    title: "SECRET_PRIVATE_TITLE",
    description: "SECRET_PRIVATE_BODY",
    channel: "youtube",
    external_url: "https://secret.example/hidden",
    is_published: false,
    sort_order: 0,
    created_at: "2026-11-18T00:00:00.000001+00:00",
    updated_at: "2026-11-18T00:00:00.000001+00:00",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    title: longTitle,
    description: "긴 설명",
    channel: "blog",
    external_url: longUrl,
    is_published: true,
    sort_order: 1,
    created_at: "2026-11-18T00:00:05.000000+00:00",
    updated_at: "2026-11-18T00:00:05.000000+00:00",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    title: "인스타 공개글",
    description: "첫 줄\n둘째 줄",
    channel: "instagram",
    external_url: "https://example.com/instagram/post",
    is_published: true,
    sort_order: 1,
    created_at: "2026-11-18T00:00:01.000000+00:00",
    updated_at: "2026-11-18T00:00:01.000000+00:00",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
    title: "가운데 블로그",
    description: null,
    channel: "blog",
    external_url: "https://example.com/blog/mid",
    is_published: true,
    sort_order: 2,
    created_at: "2026-11-18T00:00:02.000000+00:00",
    updated_at: "2026-11-18T00:00:02.000000+00:00",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
    title: "잘못된주소글",
    description: null,
    channel: "blog",
    external_url: "javascript:alert(1)",
    is_published: true,
    sort_order: 4,
    created_at: "2026-11-18T00:00:02.000000+00:00",
    updated_at: "2026-11-18T00:00:02.000000+00:00",
  },
];
for (let index = 0; index < 16; index += 1)
  rows.push({
    id: `eeeeeeee-eeee-4eee-8eee-${String(index + 1).padStart(12, "0")}`,
    title: `채움 ${index + 1}`,
    description: null,
    channel: "blog",
    external_url: `https://example.com/fill/${index + 1}`,
    is_published: true,
    sort_order: 10 + index,
    created_at: "2026-11-18T00:00:03.000000+00:00",
    updated_at: "2026-11-18T00:00:03.000000+00:00",
  });
rows.push(
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5",
    title: "공개 유튜브",
    description: null,
    channel: "youtube",
    external_url: "https://example.com/youtube/watch",
    is_published: true,
    sort_order: 50,
    created_at: "2026-11-18T00:00:04.000000+00:00",
    updated_at: "2026-11-18T00:00:04.000000+00:00",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6",
    title: "둘째쪽 콘텐츠",
    description: null,
    channel: "blog",
    external_url: "https://example.com/blog/page-two",
    is_published: true,
    sort_order: 60,
    created_at: "2026-11-18T00:00:04.000000+00:00",
    updated_at: "2026-11-18T00:00:04.000000+00:00",
  },
);
let admin = true;
let listFail = false;
let forceEmpty = false;
let hideYoutube = false;
let loseResponse = false;
let delayList = 0;
let seq = 0;
const contentsRequests = [];
const stamp = () =>
  `2026-11-18T03:00:00.${String(++seq).padStart(6, "0")}+00:00`;
const uid = "99999999-9999-4999-8999-999999999999";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  sub: uid,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only").update(`${jwtHead}.${jwtBody}`).digest("base64url")}`;

function roleOf(req) {
  const header = req.headers.authorization || "";
  if (header === `Bearer ${token}`) return admin ? "admin" : "user";
  if (
    header === "Bearer fixture-secret" ||
    req.headers.apikey === "fixture-secret"
  )
    return "service";
  return "anon";
}
function matches(row, params) {
  for (const [key, value] of params) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    if (!value.startsWith("eq.")) continue;
    const expected = value.slice(3);
    const actual = row[key];
    if (typeof actual === "boolean") {
      if (String(actual) !== expected) return false;
    } else if (String(actual) !== expected) return false;
  }
  return true;
}
function sortRows(list, order) {
  if (!order) return list;
  return [...list].sort((left, right) => {
    for (const part of order.split(",")) {
      const [column, direction] = part.split(".");
      if (left[column] === right[column]) continue;
      const compared = left[column] > right[column] ? 1 : -1;
      return direction === "desc" ? -compared : compared;
    }
    return 0;
  });
}
function visible(row, role) {
  if (forceEmpty && role !== "admin" && role !== "service") return false;
  if (hideYoutube && row.channel === "youtube" && row.is_published)
    return false;
  if (role === "admin" || role === "service") return true;
  return row.is_published === true;
}
function send(res, list, params, head = false) {
  let selected = sortRows(list, params.get("order"));
  const count = selected.length;
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  if (limit != null) selected = selected.slice(offset, offset + Number(limit));
  res.setHeader(
    "Content-Range",
    head
      ? `*/${count}`
      : `${offset}-${Math.max(offset, offset + selected.length - 1)}/${count}`,
  );
  res.end(head ? "" : JSON.stringify(selected));
}
const fixture = createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const url = new URL(req.url, "http://fixture.invalid");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "invalid" }));
      return;
    }
    res.end(JSON.stringify(user));
    return;
  }
  const chunks = [];
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || ""))
    for await (const chunk of req) chunks.push(chunk);
  else req.resume();
  const role = roleOf(req);
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify([{ role: role === "admin" ? "admin" : "user" }]));
    return;
  }
  if (table !== "contents") {
    res.setHeader("Content-Range", "*/0");
    res.end(req.method === "HEAD" ? "" : "[]");
    return;
  }
  contentsRequests.push({
    method: req.method,
    role,
    search: url.search,
    auth: req.headers.authorization || "",
  });
  if (delayList && (req.method === "GET" || req.method === "HEAD"))
    await delay(delayList);
  if (listFail && (req.method === "GET" || req.method === "HEAD")) {
    res.writeHead(500);
    res.end(JSON.stringify({ code: "XX000", message: "fixture" }));
    return;
  }
  if (["POST", "PATCH", "DELETE"].includes(req.method || "")) {
    if (role !== "admin") {
      res.writeHead(403);
      res.end(JSON.stringify({ code: "42501", message: "permission" }));
      return;
    }
    const body =
      req.method === "DELETE"
        ? {}
        : JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (req.method === "POST") {
      assert.equal(
        rows.some((row) => row.id === body.id),
        false,
      );
      const created = {
        description: null,
        external_url: null,
        ...body,
        created_at: stamp(),
        updated_at: stamp(),
      };
      created.updated_at = created.created_at;
      rows.push(created);
      if (loseResponse) {
        loseResponse = false;
        req.socket.destroy();
        return;
      }
      send(res, [created], url.searchParams);
      return;
    }
    let selected = rows.filter((row) => matches(row, url.searchParams));
    if (req.method === "DELETE") {
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
    } else {
      for (const row of selected)
        Object.assign(row, body, { updated_at: stamp() });
    }
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
    send(res, selected, url.searchParams);
    return;
  }
  const selected = rows.filter(
    (row) => visible(row, role) && matches(row, url.searchParams),
  );
  send(res, selected, url.searchParams, req.method === "HEAD");
}

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = 4333;
const base = `http://127.0.0.1:${port}`;
const shotDir = join(process.cwd(), "tmp", "contents-ui");
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
};
let app;
let page;
let documents;
try {
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(build.status, 0, build.stdout + build.stderr);
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(`${base}/contents`)).ok;
    } catch {
      return false;
    }
  }, "app");
  page = await browser();
  const text = (value) =>
    until(async () => {
      try {
        return await page.evaluate(
          `Boolean(document.body && document.body.innerText.includes(${JSON.stringify(value)}))`,
        );
      } catch {
        return false;
      }
    }, value);
  const absent = async (value) => {
    assert.equal(
      await page.evaluate(
        `document.body.innerText.includes(${JSON.stringify(value)})`,
      ),
      false,
      value,
    );
  };
  const go = async (path) => {
    console.log("CONTENTS_OPEN", path);
    const url = `${base}${path}`;
    try {
      await page.go(url);
    } catch {
      console.log("CONTENTS_NAV_RETRY", path);
      await page.go(url);
    }
  };
  const screenshot = async (name) => {
    mkdirSync(shotDir, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const clickLink = async (label) => {
    await until(
      () =>
        page.evaluate(
          `Array.from(document.querySelectorAll("a")).some((item) => item.checkVisibility() && item.textContent.trim() === ${JSON.stringify(label)})`,
        ),
      label,
    );
    await page.evaluate(
      `Array.from(document.querySelectorAll("a")).find((item) => item.checkVisibility() && item.textContent.trim() === ${JSON.stringify(label)}).click()`,
    );
  };
  const confirm = async () => {
    await until(
      () =>
        page.evaluate(
          "Array.from(document.querySelectorAll('dialog')).some((item) => item.open && item.checkVisibility())",
        ),
      "modal",
    );
    await page.button("확인 후 처리");
    await until(
      () =>
        page.evaluate(
          "!Array.from(document.querySelectorAll('dialog')).some((item) => item.open && item.checkVisibility())",
        ),
      "modal closed",
    );
  };
  const setField = async (name, value) => {
    await until(
      () =>
        page.evaluate(
          `Array.from(document.querySelectorAll(${JSON.stringify(`[name="${name}"]`)})).some((item) => item.checkVisibility() && !item.disabled)`,
        ),
      name,
    );
    await page.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll(${JSON.stringify(`[name="${name}"]`)})).find((item) => item.checkVisibility());
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const previous = el.value;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      if (el._valueTracker) el._valueTracker.setValue(previous);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  };
  const fieldValue = (name) =>
    page.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll(${JSON.stringify(`[name="${name}"]`)})).find((item) => item.checkVisibility());
      return el ? el.value : null;
    })()`);
  const statusText = () =>
    page.evaluate(`(() => {
      const el = Array.from(document.querySelectorAll('[role="status"]')).find((item) => item.checkVisibility() && item.id.endsWith("-status"));
      return el ? el.textContent.trim() : "";
    })()`);
  const waitStatus = () =>
    until(async () => {
      const value = await statusText();
      return value.length > 0 && !value.includes("처리 중");
    }, "status");
  const emulate = async (width, fine) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: width >= 768 ? 900 : 844,
      deviceScaleFactor: 1,
      mobile: !fine,
    });
    await page.call("Emulation.setTouchEmulationEnabled", {
      enabled: !fine,
      maxTouchPoints: fine ? 1 : 5,
    });
    await page.call("Emulation.setEmulatedMedia", {
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
    await delay(250);
  };
  const layout = () =>
    page.evaluate(`(() => {
      const pageBox = document.querySelector("[data-contents-page]");
      const main = document.querySelector("main");
      const shell = document.querySelector("[data-app-shell]");
      const nav = document.querySelector('[aria-label="하단 메뉴"]');
      const scope = pageBox || main;
      const nodes = Array.from(scope.querySelectorAll("a, button, textarea, select, label, input")).filter((node) => {
        if (!node.checkVisibility()) return false;
        if (node.matches("input[type=radio], input[type=checkbox]")) return false;
        return true;
      });
      window.scrollTo(0, document.documentElement.scrollHeight);
      const small = nodes.filter((node) => node.getBoundingClientRect().height < 44).map((node) => (node.innerText || node.getAttribute("name") || node.tagName).trim().slice(0, 40));
      let covered = false;
      if (nav && nav.checkVisibility()) {
        const last = Array.from(scope.querySelectorAll("h1, h2, p, a, button")).filter((node) => node.checkVisibility()).at(-1);
        if (last && last.getBoundingClientRect().bottom > nav.getBoundingClientRect().top + 1) covered = true;
      }
      return {
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        small,
        covered,
        padding: getComputedStyle(pageBox || main).paddingLeft,
        shell: Math.round(shell.getBoundingClientRect().width),
      };
    })()`);
  const session = {
    access_token: token,
    refresh_token: "mock-only",
    user,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  };
  await page.call("Network.setCookie", {
    name: "sb-127-auth-token",
    value: `base64-${encode(session)}`,
    url: base,
    path: "/",
  });
  const mark = contentsRequests.length;
  await emulate(360, false);
  await go("/contents");
  await text("총 22건");
  await text(longTitle);
  await text("인스타 공개글");
  await text("첫 줄");
  await text("둘째 줄");
  await text("잘못된주소글");
  await text("주소를 확인할 수 없어 링크를 표시하지 않습니다.");
  await absent("SECRET_PRIVATE_TITLE");
  await absent("SECRET_PRIVATE_BODY");
  await absent("둘째쪽 콘텐츠");
  const html = await page.evaluate("document.documentElement.innerHTML");
  assert.equal(html.includes("SECRET_PRIVATE_TITLE"), false);
  assert.equal(html.includes("secret.example"), false);
  assert.equal(html.includes("javascript:alert"), false);
  assert.equal(
    await page.evaluate("document.querySelectorAll('iframe').length"),
    0,
  );
  const link = await page.evaluate(`(() => {
    const article = Array.from(document.querySelectorAll("article")).find((item) => item.checkVisibility() && item.textContent.includes("인스타 공개글"));
    const el = article.querySelector("a");
    return { href: el.href, target: el.target, rel: el.rel, text: el.textContent };
  })()`);
  assert.equal(link.href, "https://example.com/instagram/post");
  assert.equal(link.target, "_blank");
  assert.match(link.rel, /noopener/);
  assert.match(link.rel, /noreferrer/);
  assert.match(link.text, /새 창/);
  const seen = contentsRequests.slice(mark);
  assert.ok(
    seen.some(
      (item) =>
        item.role === "anon" && item.search.includes("is_published=eq.true"),
    ),
  );
  assert.ok(seen.every((item) => item.role === "anon"));
  assert.ok(seen.every((item) => item.auth !== `Bearer ${token}`));
  const first = await page.evaluate("document.body.innerText");
  assert.ok(first.indexOf(longTitle) < first.indexOf("인스타 공개글"));
  await clickLink("다음");
  await text("둘째쪽 콘텐츠");
  await text("공개 유튜브");
  await text("2 / 2");
  await absent(longTitle);
  await page.evaluate("history.back()");
  await until(
    () =>
      page.evaluate("location.pathname === '/contents' && !location.search"),
    "page back",
  );
  await text(longTitle);
  await clickLink("블로그");
  await until(
    () => page.evaluate("location.search === '?channel=blog'"),
    "blog filter",
  );
  await text(longTitle);
  await absent("인스타 공개글");
  await page.evaluate("history.back()");
  await until(
    () =>
      page.evaluate("location.pathname === '/contents' && !location.search"),
    "filter back",
  );
  await text("인스타 공개글");
  await page.evaluate("history.forward()");
  await until(
    () => page.evaluate("location.search === '?channel=blog'"),
    "filter forward",
  );
  await absent("인스타 공개글");
  await go("/contents?channel=instagram");
  await text("인스타 공개글");
  await absent(longTitle);
  await go("/contents?channel=youtube");
  await text("공개 유튜브");
  await absent("SECRET_PRIVATE_TITLE");
  for (const [width, fine] of [
    [360, false],
    [390, false],
    [430, false],
    [768, false],
    [1024, false],
    [1280, true],
  ]) {
    await emulate(width, fine);
    await go("/contents");
    await text("총 22건");
    const measured = await layout();
    assert.equal(measured.overflow, true, `overflow ${width}`);
    assert.equal(measured.covered, false, `covered ${width}`);
    assert.deepEqual(measured.small, [], `touch ${width} ${measured.small}`);
    const wideTouch = !fine && width >= 768;
    assert.equal(measured.padding, wideTouch ? "24px" : "16px", width);
    if (fine) assert.ok(measured.shell <= 560, measured.shell);
    await screenshot(`customer-${width}.png`);
  }
  await go("/contents?channel=blog&channel=instagram");
  await text("목록 조건이 올바르지 않습니다.");
  await go("/contents?page=0");
  await text("목록 조건이 올바르지 않습니다.");
  await go("/contents?channel=tiktok");
  await text("목록 조건이 올바르지 않습니다.");
  listFail = true;
  await go("/contents");
  await text("콘텐츠 목록을 불러오지 못했습니다.");
  await absent("아직 올라온 소식이 없어요.");
  await screenshot("customer-error.png");
  listFail = false;
  await page.button("다시 시도");
  await text("총 22건");
  forceEmpty = true;
  const expectedChannels = [
    ["유튜브", "https://www.youtube.com/channel/UCQW1dFMrN1ndpsT77BK-9KA"],
    ["인스타그램", "https://www.instagram.com/kjm_chnam/"],
    ["블로그", "https://blog.naver.com/taro93"],
  ];
  for (const [width, fine] of [
    [360, false],
    [1280, true],
  ]) {
    await emulate(width, fine);
    await go("/contents");
    await text("총 0건");
    await text("아직 올라온 소식이 없어요.");
    await absent("선택한 채널의 콘텐츠가 없습니다.");
    const official = await page.evaluate(`(() => {
      const section = document.querySelector('[aria-label="공식 채널"]');
      const links = Array.from(section.querySelectorAll("a"));
      const shell = document.querySelector("[data-app-shell]");
      return {
        shell: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
        cards: links.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            href: node.href,
            target: node.target,
            rel: node.rel,
            text: node.innerText.replace(/\\s+/g, " ").trim(),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }),
      };
    })()`);
    assert.equal(official.overflow, true, `channel overflow ${width}`);
    assert.equal(official.cards.length, 3, `channel count ${width}`);
    if (fine) assert.ok(official.shell <= 560, official.shell);
    expectedChannels.forEach(([label, href], index) => {
      const card = official.cards[index];
      assert.equal(card.href, href, `${label} ${width}`);
      assert.equal(card.target, "_blank", label);
      assert.match(card.rel, /noopener/);
      assert.match(card.rel, /noreferrer/);
      assert.match(card.text, new RegExp(label));
      assert.match(card.text, /새 창으로 열기/);
      assert.ok(card.height >= 44, `${label} touch ${card.height}`);
    });
    const stacked =
      official.cards[1].top > official.cards[0].top + 8 &&
      official.cards[2].top > official.cards[1].top + 8;
    const row =
      Math.abs(official.cards[0].top - official.cards[1].top) <= 2 &&
      Math.abs(official.cards[1].top - official.cards[2].top) <= 2;
    assert.equal(stacked || row, true, `channel layout ${width}`);
    if (width === 360) assert.equal(stacked, true, "360 stack");
    await screenshot(
      width === 360 ? "customer-empty.png" : "customer-channels-pc.png",
    );
  }
  forceEmpty = false;
  hideYoutube = true;
  await go("/contents?channel=youtube");
  await text("선택한 채널의 콘텐츠가 없습니다.");
  await absent("SECRET_PRIVATE_TITLE");
  await absent("아직 올라온 소식이 없어요.");
  await screenshot("customer-filter-empty.png");
  hideYoutube = false;

  await emulate(360, false);
  await go("/admin/contents");
  await text("SECRET_PRIVATE_TITLE");
  await text("비공개");
  await text("순서 0");
  await go("/admin/contents?status=nope");
  await text("목록 조건이 올바르지 않습니다.");
  await go("/admin/contents");
  documents = await documentCounter(page.debugPort);
  await page.evaluate(`(() => {
    window.__contentsFilterMark = "keep";
    const push = history.pushState.bind(history);
    history.pushState = function(...args) {
      window.__contentsPushCount = (window.__contentsPushCount || 0) + 1;
      return push(...args);
    };
  })()`);
  const beforePage = documents.docs.length;
  await clickLink("다음");
  await until(
    () => page.evaluate("location.search === '?page=2'"),
    "admin page 2",
  );
  await text("2 / 2");
  assert.equal(await markerValue(), "keep");
  assert.equal(documents.docs.length, beforePage, documents.docs.join("\n"));
  delayList = 1200;
  const beforeFilter = documents.docs.length;
  await page.evaluate(`(() => {
    window.__contentsPushCount = 0;
    const select = document.querySelector('select[name="status"]');
    select.value = "private";
    select.form.requestSubmit();
    select.form.requestSubmit();
  })()`);
  await delay(120);
  assert.equal(await markerValue(), "keep");
  assert.equal(documents.docs.length, beforeFilter, documents.docs.join("\n"));
  const pendingBody = await page.evaluate(
    "document.body ? document.body.innerText.length : 0",
  );
  assert.ok(pendingBody > 20, String(pendingBody));
  await text("필터를 적용하는 중…");
  delayList = 0;
  await until(
    () =>
      page.evaluate(
        "location.search.includes('status=private') && !location.search.includes('page=')",
      ),
    "private filter",
  );
  assert.equal(await markerValue(), "keep");
  assert.equal(documents.docs.length, beforeFilter, documents.docs.join("\n"));
  assert.equal(await page.evaluate("window.__contentsPushCount"), 1);
  await text("SECRET_PRIVATE_TITLE");
  await absent("인스타 공개글");
  await text("1 / 1");
  assert.equal(await statusValue(), "private");
  await chooseStatus("public");
  await until(
    () => page.evaluate("location.search === '?status=public'"),
    "public filter",
  );
  await text("인스타 공개글");
  await absent("SECRET_PRIVATE_TITLE");
  await text("1 / 2");
  assert.equal(await statusValue(), "public");
  assert.equal(await markerValue(), "keep");
  await clickLink("다음");
  await until(
    () => page.evaluate("location.search === '?page=2&status=public'"),
    "public page 2",
  );
  await text("2 / 2");
  await clickLink("이전");
  await until(
    () => page.evaluate("location.search === '?status=public'"),
    "public page 1",
  );
  await chooseStatus("");
  await until(
    () =>
      page.evaluate(
        "location.pathname === '/admin/contents' && !location.search",
      ),
    "all filter",
  );
  await text("SECRET_PRIVATE_TITLE");
  await text("인스타 공개글");
  await text("총 23건");
  assert.equal(await statusValue(), "");
  await chooseStatus("private");
  await until(
    () => page.evaluate("location.search === '?status=private'"),
    "private again",
  );
  await page.evaluate("history.back()");
  await until(
    () =>
      page.evaluate(
        "location.pathname === '/admin/contents' && !location.search",
      ),
    "filter back",
  );
  await text("인스타 공개글");
  assert.equal(await statusValue(), "");
  assert.equal(await markerValue(), "keep");
  await page.evaluate("history.forward()");
  await until(
    () => page.evaluate("location.search === '?status=private'"),
    "filter forward",
  );
  await text("SECRET_PRIVATE_TITLE");
  await absent("인스타 공개글");
  assert.equal(await statusValue(), "private");
  await clickLink("초기화");
  await until(
    () =>
      page.evaluate(
        "location.pathname === '/admin/contents' && !location.search",
      ),
    "filter reset",
  );
  await text("총 23건");
  await go("/admin/contents?status=public");
  await text("인스타 공개글");
  await absent("SECRET_PRIVATE_TITLE");
  assert.equal(await statusValue(), "public");
  await go("/admin/contents/new?returnTo=%2Fadmin%2Fcontents");
  await setField("title", "연속 저장 제목");
  await page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('input[name="channel"][value="blog"]')).find((item) => item.checkVisibility());
    el.click();
  })()`);
  await page.button("저장 전 확인");
  await confirm();
  await until(
    () =>
      page.evaluate(
        "location.pathname.startsWith('/admin/contents/') && !location.pathname.endsWith('/new')",
      ),
    "created",
  );
  await text("콘텐츠를 저장했습니다.");
  const created = rows.find((row) => row.title === "연속 저장 제목");
  assert.ok(created);
  assert.equal(created.is_published, false);
  assert.equal(created.external_url, null);
  const editPath = await page.evaluate("location.pathname");
  await setField("external_url", "https://example.com/created");
  await page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('input[name="is_published"]')).find((item) => item.checkVisibility());
    if (!el.checked) el.click();
  })()`);
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.match(await statusText(), /저장했습니다/);
  assert.equal(await page.evaluate("location.pathname"), editPath);
  assert.equal(created.is_published, true);
  assert.equal(created.external_url, "https://example.com/created");
  await page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('input[name="is_published"]')).find((item) => item.checkVisibility());
    if (el.checked) el.click();
  })()`);
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.equal(created.is_published, false);
  assert.equal(await page.evaluate("location.pathname"), editPath);
  await page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('input[name="is_published"]')).find((item) => item.checkVisibility());
    if (!el.checked) el.click();
  })()`);
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.equal(created.is_published, true);
  assert.equal(created.updated_at !== "2026-11-18T00:00:00.000001+00:00", true);
  await setField("description", "설명 첫 줄\n설명 둘째 줄");
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.equal(created.description, "설명 첫 줄\n설명 둘째 줄");
  await setField("description", "");
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.equal(created.description, null);
  await setField("description", "다시 적은 설명");
  const beforeDouble = rows.filter((row) => row.id === created.id).length;
  await page.button("저장 전 확인");
  await until(
    () =>
      page.evaluate(
        "Array.from(document.querySelectorAll('dialog')).some((item) => item.open && item.checkVisibility())",
      ),
    "double modal",
  );
  await page.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll("button")).find((item) => item.checkVisibility() && item.textContent.trim() === "확인 후 처리");
    button.click();
    button.click();
  })()`);
  await waitStatus();
  assert.equal(
    rows.filter((row) => row.id === created.id).length,
    beforeDouble,
  );
  assert.equal(created.description, "다시 적은 설명");
  const previousVersion = created.updated_at;
  created.updated_at = stamp();
  created.title = "서버에서 바꾼 제목";
  await setField("title", "사용자가 유지할 제목");
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.match(await statusText(), /변경됐습니다/);
  assert.equal(await fieldValue("title"), "사용자가 유지할 제목");
  assert.equal(created.title, "서버에서 바꾼 제목");
  await page.button("최신 내용 다시 불러오기");
  await confirm();
  await waitStatus();
  assert.equal(await fieldValue("title"), "서버에서 바꾼 제목");
  assert.equal(created.updated_at !== previousVersion, true);

  await go("/admin/contents/new?returnTo=%2Fadmin%2Fcontents");
  await setField("title", "응답 유실 제목");
  await page.evaluate(`(() => {
    const el = Array.from(document.querySelectorAll('input[name="channel"][value="instagram"]')).find((item) => item.checkVisibility());
    el.click();
  })()`);
  loseResponse = true;
  await page.button("저장 전 확인");
  await confirm();
  await waitStatus();
  assert.match(await statusText(), /확인하지 못했습니다/);
  assert.equal(rows.filter((row) => row.title === "응답 유실 제목").length, 1);
  await page.button("저장 결과 다시 확인");
  await until(
    () =>
      page.evaluate(
        "location.pathname.startsWith('/admin/contents/') && !location.pathname.endsWith('/new')",
      ),
    "recovered",
  );
  await text("콘텐츠를 저장했습니다.");
  assert.equal(rows.filter((row) => row.title === "응답 유실 제목").length, 1);

  await go("/admin/contents/new?returnTo=%2Fadmin%2Fcontents");
  await setField("title", "복원초안");
  await clickLink("목록으로 돌아가기");
  await page.button("확인 후 처리");
  await until(
    () => page.evaluate("location.pathname === '/admin/contents'"),
    "left draft",
  );
  assert.equal(
    rows.some((row) => row.title === "복원초안"),
    false,
  );
  await page.evaluate("history.back()");
  await until(
    () => page.evaluate("location.pathname === '/admin/contents/new'"),
    "restore draft",
  );
  assert.equal(await fieldValue("title"), "복원초안");
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('dialog')).some((item) => item.open && item.checkVisibility())",
    ),
    false,
  );
  assert.equal(
    rows.some((row) => row.title === "복원초안"),
    false,
  );

  await go(`${editPath}?returnTo=%2Fadmin%2Fcontents`);
  await until(
    async () => (await fieldValue("title")) === "서버에서 바꾼 제목",
    "서버에서 바꾼 제목",
  );
  await page.button("삭제 전 확인");
  await page.button("돌아가기");
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('dialog')).some((item) => item.open && item.checkVisibility())",
    ),
    false,
  );
  assert.equal(
    rows.some((row) => row.id === created.id),
    true,
  );
  await page.button("삭제 전 확인");
  await confirm();
  await until(
    () => page.evaluate("location.pathname === '/admin/contents'"),
    "deleted list",
  );
  await text("콘텐츠를 삭제했습니다.");
  assert.equal(
    rows.some((row) => row.id === created.id),
    false,
  );
  await go(editPath);
  await text("콘텐츠가 없습니다.");

  admin = false;
  await go("/admin/contents");
  await text("관리자 권한이 없어요.");
  await absent("SECRET_PRIVATE_TITLE");
  admin = true;

  for (const [width, fine] of [
    [360, false],
    [390, false],
    [430, false],
    [768, false],
    [1024, false],
    [1280, true],
  ]) {
    await emulate(width, fine);
    await go("/admin/contents/new?returnTo=%2Fadmin%2Fcontents");
    await setField("title", longTitle);
    await setField("external_url", longUrl);
    const measured = await layout();
    assert.equal(measured.overflow, true, `admin overflow ${width}`);
    assert.deepEqual(
      measured.small,
      [],
      `admin touch ${width} ${measured.small}`,
    );
    const wideTouch = !fine && width >= 768;
    assert.equal(
      measured.padding,
      wideTouch ? "24px" : "16px",
      `admin pad ${width}`,
    );
    if (width === 360 || width === 768 || width === 1280)
      await screenshot(`admin-editor-${width}.png`);
  }
  console.log("CONTENTS_BROWSER_OK", {
    rows: rows.length,
    requests: contentsRequests.length,
  });
} finally {
  documents?.close();
  if (page) await page.close();
  stop(app);
  fixture.close();
}

async function documentCounter(debugPort) {
  const targets = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  const socket = new WebSocket(
    targets.find((item) => item.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const docs = [];
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
    if (
      message.method === "Network.requestWillBeSent" &&
      message.params.type === "Document"
    )
      docs.push(message.params.request.url);
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++sequence;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await call("Network.enable");
  return { docs, close: () => socket.close() };
}

async function markerValue() {
  try {
    return await page.evaluate("window.__contentsFilterMark || null");
  } catch {
    return null;
  }
}

async function statusValue() {
  return page.evaluate(`(() => {
    const select = Array.from(document.querySelectorAll('select[name="status"]')).find((item) => item.checkVisibility());
    return select ? select.value : null;
  })()`);
}

async function chooseStatus(value) {
  await page.evaluate(`(() => {
    const select = Array.from(document.querySelectorAll('select[name="status"]')).find((item) => item.checkVisibility());
    select.value = ${JSON.stringify(value)};
    select.form.requestSubmit();
  })()`);
}
