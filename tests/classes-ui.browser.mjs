// 격리된 HTTP 모형이다. 실제 Supabase 자격증명과 자료는 쓰지 않는다.
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

const secretId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const longId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const pageTwoId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000021";
const longTitle = `테스트긴제목${"가".repeat(90)}`;
const longUrl = `https://videos.example/${"v".repeat(80)}`;
const secretUrl = "https://secret.example/hidden-video";
const classes = [
  {
    id: secretId,
    title: "테스트 비공개비밀",
    description: "비밀본문토큰",
    field: "saju",
    video_url: secretUrl,
    is_published: false,
    sort_order: 0,
    created_at: "2026-11-18T03:00:00.000000+00:00",
    updated_at: "2026-11-18T03:00:00.000000+00:00",
  },
  {
    id: longId,
    title: longTitle,
    description: `줄바꿈첫줄\n줄바꿈둘째줄${"나".repeat(80)}`,
    field: "tarot",
    video_url: longUrl,
    is_published: true,
    sort_order: 1,
    created_at: "2026-11-18T02:59:00.000000+00:00",
    updated_at: "2026-11-18T02:59:00.000000+00:00",
  },
];
for (let index = 2; index <= 20; index += 1) {
  classes.push({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
    title: `테스트 공개 ${index}`,
    description: "테스트 설명",
    field: index % 2 === 0 ? "saju" : "tarot",
    video_url: `https://videos.example/lecture-${index}`,
    is_published: true,
    sort_order: index,
    created_at: `2026-11-18T02:${String(60 - index).padStart(2, "0")}:00.000000+00:00`,
    updated_at: "2026-11-18T02:00:00.000000+00:00",
  });
}
classes.push({
  id: pageTwoId,
  title: "테스트 둘째쪽",
  description: "둘째 쪽 설명",
  field: "saju",
  video_url: "https://videos.example/lecture-page-two",
  is_published: true,
  sort_order: 30,
  created_at: "2026-11-18T01:00:00.000000+00:00",
  updated_at: "2026-11-18T01:00:00.000000+00:00",
});
let admin = true;
let listFail = false;
let customerEmpty = false;
let loseResponse = false;
let writeDelay = 0;
let writes = 0;
let seq = 0;
const stamp = () =>
  `2026-11-18T04:00:00.${String(++seq).padStart(6, "0")}+00:00`;
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
  if (header === "Bearer fixture-secret") return "service";
  if (header === `Bearer ${token}`) return admin ? "admin" : "user";
  return "anon";
}
function matches(row, params) {
  for (const [key, value] of params) {
    if (
      key === "select" ||
      key === "order" ||
      key === "offset" ||
      key === "limit"
    )
      continue;
    if (typeof value === "string" && value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    }
  }
  return true;
}
function sortRows(rows, order) {
  if (!order) return rows;
  return [...rows].sort((left, right) => {
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
  return role === "admin" || row.is_published === true;
}
function send(res, status, body, count, offset = 0) {
  res.statusCode = status;
  if (count !== undefined)
    res.setHeader(
      "Content-Range",
      `${offset}-${Math.max(offset, offset + (Array.isArray(body) ? body.length : 1) - 1)}/${count}`,
    );
  res.end(JSON.stringify(body));
}
const fixture = createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const url = new URL(req.url || "/", "http://fixture.invalid");
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
    if (role === "anon" || role === "service") {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission" }));
      return;
    }
    res.end(JSON.stringify([{ role: role === "admin" ? "admin" : "user" }]));
    return;
  }
  if (table !== "classes") {
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
    return;
  }
  if (role === "service") {
    res.writeHead(401);
    res.end(JSON.stringify({ code: "42501", message: "permission" }));
    return;
  }
  if (listFail && (req.method === "GET" || req.method === "HEAD")) {
    res.writeHead(500);
    res.end(JSON.stringify({ code: "XX000", message: "fixture" }));
    return;
  }
  if (customerEmpty && role !== "admin" && req.method !== "POST") {
    res.setHeader("Content-Range", "*/0");
    res.end(req.method === "HEAD" ? "" : "[]");
    return;
  }
  if (["POST", "PATCH", "DELETE"].includes(req.method || "")) {
    if (role !== "admin") {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission" }));
      return;
    }
    if (writeDelay) await delay(writeDelay);
    writes += 1;
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (req.method === "POST") {
      if (classes.some((row) => row.id === body.id)) {
        res.writeHead(409);
        res.end(JSON.stringify({ code: "23505", message: "duplicate" }));
        return;
      }
      const created = {
        created_at: stamp(),
        ...body,
        updated_at: stamp(),
      };
      classes.push(created);
      if (loseResponse) {
        loseResponse = false;
        req.socket.destroy();
        return;
      }
      send(res, 201, [created], 1);
      return;
    }
    const selected = classes.filter((row) => matches(row, url.searchParams));
    if (req.method === "DELETE") {
      for (const row of selected) classes.splice(classes.indexOf(row), 1);
    } else {
      for (const row of selected)
        Object.assign(row, body, { updated_at: stamp() });
    }
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
    send(res, 200, selected, selected.length);
    return;
  }
  let selected = classes.filter(
    (row) => visible(row, role) && matches(row, url.searchParams),
  );
  selected = sortRows(selected, url.searchParams.get("order"));
  const count = selected.length;
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = url.searchParams.get("limit");
  if (limit != null) selected = selected.slice(offset, offset + Number(limit));
  if (req.method === "HEAD") {
    res.setHeader("Content-Range", `*/${count}`);
    res.end();
    return;
  }
  send(res, 200, selected, count, offset);
}
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = 4332;
const base = `http://127.0.0.1:${port}`;
const shotDir = join(process.cwd(), "tmp", "classes-ui");
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
try {
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(build.status, 0, build.stdout + build.stderr);
  app = server(port, env);
  await until(
    async () => {
      try {
        return (await fetch(`${base}/class`)).ok;
      } catch {
        return false;
      }
    },
    "app",
    90000,
  );
  page = await browser();
  const text = (value) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(value)})`,
        ),
      value,
    );
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
    console.log("CLASS_OPEN", path);
    await page.go(base + path);
  };
  const screenshot = async (name) => {
    mkdirSync(shotDir, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const confirm = async () => {
    await until(
      () =>
        page.evaluate(
          "!![...document.querySelectorAll('dialog')].find((node) => node.open && node.checkVisibility())",
        ),
      "modal",
    );
    await page.button("확인 후 처리");
    await until(
      () =>
        page.evaluate(
          "![...document.querySelectorAll('dialog')].some((node) => node.open && node.checkVisibility())",
        ),
      "modal closed",
    );
  };
  const clickLink = async (label) => {
    await until(
      () =>
        page.evaluate(
          `[...document.querySelectorAll('a')].some((item) => item.checkVisibility() && item.textContent.trim() === ${JSON.stringify(label)})`,
        ),
      label,
    );
    await page.evaluate(
      `[...document.querySelectorAll('a')].find((item) => item.checkVisibility() && item.textContent.trim() === ${JSON.stringify(label)}).click()`,
    );
  };
  const visibleValue = async (name) =>
    page.evaluate(
      `[...document.querySelectorAll('[name=${name}]')].find((node) => node.checkVisibility()).value`,
    );
  const choose = async (name, value) => {
    await page.evaluate(`(() => {
      const el = [...document.querySelectorAll('[name=${name}]')].find((node) => node.checkVisibility());
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
  };
  const setPublished = async (checked) => {
    await page.evaluate(`(() => {
      const el = [...document.querySelectorAll('[name=is_published]')].find((node) => node.checkVisibility());
      if (el.checked !== ${checked}) el.click();
    })()`);
  };
  const published = () =>
    page.evaluate(
      `[...document.querySelectorAll('[name=is_published]')].find((node) => node.checkVisibility()).checked`,
    );
  const updatedAt = () =>
    page.evaluate(
      `[...document.querySelectorAll('[data-updated-at]')].find((node) => node.checkVisibility()).dataset.updatedAt`,
    );
  const htmlHas = (value) =>
    page.evaluate(
      `document.documentElement.innerHTML.includes(${JSON.stringify(value)})`,
    );
  const emulate = async ({ width, fine }) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
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
  const measure = () =>
    page.evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      const classPage = document.querySelector("[data-class-page]");
      const pageBox = classPage && classPage.checkVisibility()
        ? classPage
        : [...document.querySelectorAll("main")].find((node) => node.checkVisibility());
      const controls = [...document.querySelectorAll("a, button, input, select, textarea")]
        .filter((node) => node.checkVisibility() && node.type !== "checkbox")
        .filter((node) => node.getBoundingClientRect().height < 44)
        .map((node) => node.tagName + " " + (node.getAttribute("name") || node.textContent || "").trim().slice(0, 24) + " " + Math.round(node.getBoundingClientRect().height));
      const nav = [...document.querySelectorAll('[aria-label="하단 메뉴"]')].find((node) => node.checkVisibility());
      window.scrollTo(0, document.documentElement.scrollHeight);
      const nodes = [...document.querySelectorAll("main h1, main p, main a, main button")].filter((node) => node.checkVisibility());
      const last = nodes.at(-1);
      return {
        width: Math.round(shell.getBoundingClientRect().width),
        pad: pageBox ? Number.parseFloat(getComputedStyle(pageBox).paddingLeft) : null,
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        controls,
        covered: Boolean(nav && last && last.getBoundingClientRect().bottom > nav.getBoundingClientRect().top + 1),
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
    value: "base64-" + encode(session),
    url: base,
    path: "/",
  });
  await emulate({ width: 390, fine: false });
  await go("/class");
  await text("총 21건");
  await text(longTitle);
  await text("타로");
  await absent("테스트 비공개비밀");
  await absent("테스트 둘째쪽");
  await absent("비밀본문토큰");
  assert.equal(await htmlHas(secretUrl), false);
  assert.equal(await htmlHas("videos.example"), false);
  await clickLink("다음");
  await text("테스트 둘째쪽");
  await text("2 / 2");
  await go(`/class/${longId}`);
  await text("줄바꿈첫줄");
  await text("줄바꿈둘째줄");
  await text("강의 영상 보기");
  await text("새 창으로 열립니다.");
  const link = await page.evaluate(`(() => {
    const el = [...document.querySelectorAll("a")].find((node) => node.checkVisibility() && node.textContent.includes("강의 영상 보기"));
    return { href: el.getAttribute("href"), target: el.target, rel: el.rel };
  })()`);
  assert.equal(link.href, longUrl);
  assert.equal(link.target, "_blank");
  assert.match(link.rel, /noopener/);
  assert.match(link.rel, /noreferrer/);
  assert.equal(
    await page.evaluate("document.querySelectorAll('iframe').length"),
    0,
  );
  assert.equal(await htmlHas(secretUrl), false);
  await go(`/class/${secretId}`);
  await text("강의를 찾을 수 없습니다.");
  await absent("비밀본문토큰");
  assert.equal(await htmlHas(secretUrl), false);
  await absent("클래스를 불러오지 못했습니다.");
  await go("/class/not-a-uuid");
  await text("강의를 찾을 수 없습니다.");
  await go("/class?page=0");
  await text("목록 조건이 올바르지 않습니다.");
  await absent("등록된 클래스가 없습니다.");
  customerEmpty = true;
  await go("/class");
  await text("등록된 클래스가 없습니다.");
  await absent("클래스를 불러오지 못했습니다.");
  customerEmpty = false;
  listFail = true;
  await go("/class");
  await text("클래스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  listFail = false;
  await go("/admin/classes");
  await text("총 22건");
  await text("테스트 비공개비밀");
  await text("비공개");
  await text("표시 순서 0");
  await text("사주");
  const contentHref = await page.evaluate(
    `[...document.querySelectorAll('a')].find((item) => item.checkVisibility() && item.textContent.trim() === '콘텐츠').getAttribute('href')`,
  );
  assert.equal(contentHref, "/admin/contents");
  await page.evaluate(`(() => {
    const select = [...document.querySelectorAll('[name=status]')].find((node) => node.checkVisibility());
    select.value = 'private';
    select.form.requestSubmit();
  })()`);
  await text("총 1건");
  await text("테스트 비공개비밀");
  await absent(longTitle);
  const beforeCreate = writes;
  await clickLink("클래스 등록");
  await text("클래스 등록");
  await page.fill("title", "테스트 연속저장");
  await page.fill("description", "연속 저장 설명");
  await choose("field", "tarot");
  await page.button("저장 전 확인");
  await confirm();
  await until(
    () =>
      page.evaluate(
        "location.pathname.startsWith('/admin/classes/') && !location.pathname.endsWith('/new')",
      ),
    "created editor",
  );
  await text("클래스를 저장했습니다.");
  await text("클래스 편집");
  assert.equal(await published(), false);
  const createdPath = await page.evaluate("location.pathname");
  const createdId = createdPath.split("/").at(-1);
  assert.equal(classes.filter((row) => row.id === createdId).length, 1);
  assert.equal(writes, beforeCreate + 1);
  const firstVersion = await updatedAt();
  await page.fill("video_url", "https://videos.example/live-edit");
  await setPublished(true);
  await page.button("저장 전 확인");
  await confirm();
  await text("클래스를 저장했습니다.");
  assert.equal(await page.evaluate("location.pathname"), createdPath);
  assert.equal(await published(), true);
  const secondVersion = await updatedAt();
  assert.notEqual(secondVersion, firstVersion);
  await setPublished(false);
  await page.button("저장 전 확인");
  await confirm();
  assert.equal(await published(), false);
  assert.equal(await page.evaluate("location.pathname"), createdPath);
  const thirdVersion = await updatedAt();
  assert.notEqual(thirdVersion, secondVersion);
  await setPublished(true);
  await page.button("저장 전 확인");
  await confirm();
  assert.equal(await published(), true);
  assert.notEqual(await updatedAt(), thirdVersion);
  assert.equal(
    classes.find((row) => row.id === createdId).video_url,
    "https://videos.example/live-edit",
  );
  const serverRow = classes.find((row) => row.id === createdId);
  serverRow.updated_at = stamp();
  serverRow.title = "테스트 서버제목";
  await page.fill("title", "테스트 충돌입력");
  await page.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 클래스가 변경됐습니다.");
  assert.equal(await visibleValue("title"), "테스트 충돌입력");
  assert.notEqual(await visibleValue("title"), "테스트 서버제목");
  await page.button("최신 내용 다시 불러오기");
  await confirm();
  await text("최신 내용을 불러왔습니다.");
  assert.equal(await visibleValue("title"), "테스트 서버제목");
  loseResponse = true;
  await go("/admin/classes/new");
  await page.fill("title", "테스트 응답유실");
  await page.fill("description", "응답 유실 설명");
  await choose("field", "saju");
  const beforeLost = writes;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(writes, beforeLost + 1);
  assert.equal(
    classes.filter((row) => row.title === "테스트 응답유실").length,
    1,
  );
  await page.button("저장 결과 다시 확인");
  await until(
    () =>
      page.evaluate(
        "location.pathname.startsWith('/admin/classes/') && !location.pathname.endsWith('/new') && document.body.innerText.includes('클래스를 저장했습니다.')",
      ),
    "recovered editor",
  );
  assert.equal(
    classes.filter((row) => row.title === "테스트 응답유실").length,
    1,
  );
  const recoveredPath = await page.evaluate("location.pathname");
  await page.fill("sort_order", "4");
  await page.button("저장 전 확인");
  await until(
    () =>
      page.evaluate(
        "!![...document.querySelectorAll('button')].find((node) => node.checkVisibility() && node.textContent.trim() === '확인 후 처리')",
      ),
    "double confirm",
  );
  const beforeDouble = writes;
  writeDelay = 400;
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.checkVisibility() && node.textContent.trim() === '확인 후 처리');
    button.click();
    button.click();
  })()`);
  await until(
    () =>
      page.evaluate(
        "document.body.innerText.includes('클래스를 저장했습니다.')",
      ),
    "double saved",
  );
  writeDelay = 0;
  assert.equal(writes, beforeDouble + 1);
  assert.equal(await page.evaluate("location.pathname"), recoveredPath);
  await page.button("삭제 전 확인");
  await page.button("돌아가기");
  await until(
    () =>
      page.evaluate(
        "![...document.querySelectorAll('dialog')].some((node) => node.open && node.checkVisibility())",
      ),
    "delete cancelled",
  );
  assert.equal(
    classes.some((row) => row.title === "테스트 응답유실"),
    true,
  );
  await page.button("삭제 전 확인");
  await confirm();
  await until(
    () => page.evaluate("location.pathname === '/admin/classes'"),
    "deleted list",
  );
  await text("클래스를 삭제했습니다.");
  const removedId = recoveredPath.split("/").at(-1);
  await go(`/admin/classes/${removedId}`);
  await text("강의를 찾을 수 없습니다.");
  await go(`/class/${removedId}`);
  await text("강의를 찾을 수 없습니다.");
  await absent("응답 유실 설명");
  await go("/admin/classes");
  const beforeDraft = writes;
  await clickLink("클래스 등록");
  await page.fill("title", "테스트 임시보관");
  await page.button("저장 전 확인");
  await page.evaluate("history.back()");
  await until(
    () => page.evaluate("location.pathname === '/admin/classes'"),
    "back to list",
  );
  await page.evaluate("history.forward()");
  await until(
    () => page.evaluate("location.pathname === '/admin/classes/new'"),
    "forward to draft",
  );
  await text("클래스 등록");
  assert.equal(await visibleValue("title"), "테스트 임시보관");
  assert.equal(
    await page.evaluate(
      "[...document.querySelectorAll('dialog')].some((node) => node.open && node.checkVisibility())",
    ),
    false,
  );
  assert.equal(writes, beforeDraft);
  const widths = [
    [360, false, 16],
    [390, false, 16],
    [430, false, 16],
    [768, false, 24],
    [1024, false, 24],
    [1280, true, 16],
  ];
  for (const [width, fine, pad] of widths) {
    await emulate({ width, fine });
    await go("/class");
    await text(longTitle);
    let box = await measure();
    assert.equal(box.overflow, false, `list overflow ${width}`);
    assert.equal(box.covered, false, `list covered ${width}`);
    assert.equal(box.controls.length, 0, `list touch ${width} ${box.controls}`);
    assert.equal(box.pad, pad, `list pad ${width}`);
    if (fine) assert.equal(box.width, 560);
    else if (width >= 1024) assert.equal(box.width, 1024);
    else assert.equal(box.width, width);
    await screenshot(`customer-list-${width}.png`);
    await go(`/class/${longId}`);
    await text("강의 영상 보기");
    box = await measure();
    assert.equal(box.overflow, false, `detail overflow ${width}`);
    assert.equal(box.covered, false, `detail covered ${width}`);
    assert.equal(
      box.controls.length,
      0,
      `detail touch ${width} ${box.controls}`,
    );
    await screenshot(`customer-detail-${width}.png`);
    await go(`/admin/classes/${longId}`);
    await text("클래스 편집");
    box = await measure();
    assert.equal(box.overflow, false, `editor overflow ${width}`);
    assert.equal(
      box.controls.length,
      0,
      `editor touch ${width} ${box.controls}`,
    );
    assert.equal(box.pad, pad, `editor pad ${width}`);
    await screenshot(`admin-editor-${width}.png`);
  }
  console.log("CLASS_BROWSER_OK");
} catch (error) {
  if (page) {
    try {
      console.error("CLASS_FAIL_URL", await page.evaluate("location.href"));
      console.error(
        "CLASS_FAIL_TEXT",
        await page.evaluate("document.body?.innerText?.slice(0, 1500)"),
      );
    } catch {
      /* The page may already be closed. */
    }
  }
  throw error;
} finally {
  if (page) await page.close();
  stop(app);
  fixture.close();
}
