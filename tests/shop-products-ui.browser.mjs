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
const soldId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const plainId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000002";
const pageTwoId = "bbbbbbbb-bbbb-4bbb-8bbb-000000000021";
const brokenPhoto = "products/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";
const longName = `테스트긴상품${"가".repeat(80)}`;
const longDescription = `줄바꿈첫줄\n줄바꿈둘째줄${"나".repeat(40)}https://cards.example/${"v".repeat(60)}`;
const products = [
  {
    id: secretId,
    name: "테스트 비공개비밀",
    description: "비밀설명토큰",
    price: 9000,
    image_path: null,
    image_alt: null,
    is_published: false,
    is_sold_out: false,
    sort_order: 0,
    created_at: "2026-11-20T03:00:00.000000+00:00",
    updated_at: "2026-11-20T03:00:00.000000+00:00",
  },
  {
    id: soldId,
    name: longName,
    description: longDescription,
    price: "18000.00",
    image_path: brokenPhoto,
    image_alt: "긴 상품 사진",
    is_published: true,
    is_sold_out: true,
    sort_order: 1,
    created_at: "2026-11-20T02:59:00.000000+00:00",
    updated_at: "2026-11-20T02:59:00.000000+00:00",
  },
  {
    id: plainId,
    name: "테스트 사진없음",
    description: "사진 없는 공개 상품",
    price: 3000,
    image_path: null,
    image_alt: null,
    is_published: true,
    is_sold_out: false,
    sort_order: 2,
    created_at: "2026-11-20T02:58:00.000000+00:00",
    updated_at: "2026-11-20T02:58:00.000000+00:00",
  },
];
for (let index = 3; index <= 20; index += 1) {
  products.push({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, "0")}`,
    name: `테스트 공개 ${index}`,
    description: "테스트 설명",
    price: 4000 + index,
    image_path: null,
    image_alt: null,
    is_published: true,
    is_sold_out: false,
    sort_order: index,
    created_at: `2026-11-20T02:${String(60 - index).padStart(2, "0")}:00.000000+00:00`,
    updated_at: "2026-11-20T02:00:00.000000+00:00",
  });
}
products.push({
  id: pageTwoId,
  name: "테스트 둘째쪽",
  description: "둘째 쪽 설명",
  price: 7000,
  image_path: null,
  image_alt: null,
  is_published: true,
  is_sold_out: false,
  sort_order: 40,
  created_at: "2026-11-20T01:00:00.000000+00:00",
  updated_at: "2026-11-20T01:00:00.000000+00:00",
});
const charmLoveId = "cccccccc-cccc-4ccc-8ccc-000000000001";
for (const [id, name, order] of [
  [charmLoveId, "천사부적 사랑·인연", 101],
  ["cccccccc-cccc-4ccc-8ccc-000000000002", "천사부적 소원성취", 102],
  ["cccccccc-cccc-4ccc-8ccc-000000000003", "천사부적 재물", 103],
]) {
  products.push({
    id,
    name,
    description: `${name} 설명`,
    price: 5000,
    image_path: null,
    image_alt: null,
    is_published: true,
    is_sold_out: false,
    sort_order: order,
    created_at: "2026-11-20T00:30:00.000000+00:00",
    updated_at: "2026-11-20T00:30:00.000000+00:00",
  });
}
let admin = true;
let listFail = false;
let customerEmpty = false;
let loseResponse = false;
let dropWrite = false;
let storageRemoves = 0;
let productDeletes = 0;
let cleanupFail = false;
let storageGate = null;
let storageInfoMode = "";
let writeDelay = 0;
let writes = 0;
let writeGate = null;
let seq = 0;
const files = new Map();
const stamp = () =>
  `2026-11-20T04:00:00.${String(++seq).padStart(6, "0")}+00:00`;
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
  return "anon";
}
function like(field, pattern) {
  const needle = String(pattern).replaceAll(/[*%]/g, "").toLowerCase();
  return String(field ?? "")
    .toLowerCase()
    .includes(needle);
}
function matches(row, params) {
  for (const [key, value] of params) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    if (typeof value !== "string") continue;
    if (value.startsWith("eq.")) {
      if (String(row[key]) !== value.slice(3)) return false;
    } else if (value.startsWith("ilike.")) {
      if (!like(row[key], value.slice("ilike.".length))) return false;
    } else if (value.startsWith("not.ilike.")) {
      if (like(row[key], value.slice("not.ilike.".length))) return false;
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
function armStorageGate() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  storageGate = {
    count: 0,
    promise,
    release() {
      storageGate = null;
      resolve();
    },
  };
  return storageGate;
}
function armGate() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  writeGate = {
    count: 0,
    promise,
    release() {
      writeGate = null;
      resolve();
    },
  };
  return writeGate;
}
async function deliver(res, status, body, count) {
  if (writeGate) {
    const gate = writeGate;
    gate.count += 1;
    await gate.promise;
  }
  send(res, status, body, count);
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
  const raw = Buffer.concat(chunks);
  const role = roleOf(req);
  if (url.pathname.startsWith("/storage/v1/")) {
    const path = decodeURIComponent(
      url.pathname.split("/public-images/")[1] || "",
    );
    const bucketDelete =
      req.method === "DELETE" &&
      url.pathname.replace(/\/$/, "").endsWith("/object/public-images");
    if (!bucketDelete && !path.startsWith("products/")) {
      res.writeHead(400);
      res.end(JSON.stringify({ message: "path" }));
      return;
    }
    if (url.pathname.includes("/object/info/")) {
      if (storageInfoMode) {
        const mode = storageInfoMode;
        storageInfoMode = "";
        if (mode === "close") {
          req.socket.destroy();
          return;
        }
        res.writeHead(Number(mode));
        res.end(JSON.stringify({ message: mode, statusCode: mode }));
        return;
      }
      if (role !== "admin" || !files.has(path)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          size: files.get(path).length,
          content_type: "image/png",
        }),
      );
      return;
    }
    if (req.method === "POST") {
      if (role !== "admin" || req.headers["x-upsert"] !== "false") {
        res.writeHead(401);
        res.end(JSON.stringify({ message: "upload denied" }));
        return;
      }
      if (files.has(path)) {
        res.writeHead(409);
        res.end(JSON.stringify({ message: "exists" }));
        return;
      }
      const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const imageStart = raw.indexOf(png);
      const image = imageStart >= 0 ? raw.subarray(imageStart) : raw;
      const imageEnd = image.indexOf("\r\n--");
      files.set(path, imageEnd >= 0 ? image.subarray(0, imageEnd) : image);
      res.end(JSON.stringify({ Key: path }));
      return;
    }
    if (req.method === "DELETE") {
      storageRemoves += 1;
      if (role !== "admin") {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      if (cleanupFail) {
        res.writeHead(503);
        res.end(JSON.stringify({ message: "cleanup", statusCode: "503" }));
        return;
      }
      if (storageGate) {
        const gate = storageGate;
        gate.count += 1;
        await gate.promise;
      }
      const paths = JSON.parse(raw.toString() || "{}").prefixes || [];
      for (const item of paths) {
        if (!String(item).startsWith("products/")) continue;
        const used = products.some((row) => row.image_path === item);
        if (!used) files.delete(item);
      }
      res.end("[]");
      return;
    }
    if (files.has(path)) res.setHeader("Content-Type", "image/png");
    res.writeHead(files.has(path) ? 200 : 404);
    res.end(files.get(path) || "");
    return;
  }
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    if (role === "anon") {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission" }));
      return;
    }
    res.end(JSON.stringify([{ role: role === "admin" ? "admin" : "user" }]));
    return;
  }
  if (table !== "products") {
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
    return;
  }
  if (
    role !== "admin" &&
    ["POST", "PATCH", "DELETE"].includes(req.method || "")
  ) {
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
    if (dropWrite) {
      dropWrite = false;
      req.socket.destroy();
      return;
    }
    if (writeDelay) await delay(writeDelay);
    writes += 1;
    const body = JSON.parse(raw.toString() || "{}");
    if (req.method === "POST") {
      if (products.some((row) => row.id === body.id)) {
        res.writeHead(409);
        res.end(JSON.stringify({ code: "23505", message: "duplicate" }));
        return;
      }
      const created = { created_at: stamp(), ...body, updated_at: stamp() };
      products.push(created);
      if (loseResponse) {
        loseResponse = false;
        req.socket.destroy();
        return;
      }
      await deliver(res, 201, [created], 1);
      return;
    }
    const selected = products.filter((row) => matches(row, url.searchParams));
    if (req.method === "DELETE") {
      productDeletes += 1;
      for (const row of selected) products.splice(products.indexOf(row), 1);
    } else {
      for (const row of selected)
        Object.assign(row, body, { updated_at: stamp() });
    }
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
    await deliver(res, 200, selected, selected.length);
    return;
  }
  let selected = products.filter(
    (row) =>
      (role === "admin" || row.is_published === true) &&
      matches(row, url.searchParams),
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
const shotDir = join(process.cwd(), "tmp", "shop-products-ui");
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
        return (await fetch(`${base}/shop`)).ok;
      } catch {
        return false;
      }
    },
    "app",
    90000,
  );
  const sockets = [];
  const NativeSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends NativeSocket {
    constructor(url, protocols) {
      if (protocols === undefined) super(url);
      else super(url, protocols);
      sockets.push(this);
    }
  };
  page = await browser();
  const documentRequests = [];
  const networkRequests = new Map();
  let postCount = 0;
  await page.call("Network.enable");
  for (const socket of sockets)
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Network.requestWillBeSent") {
        networkRequests.set(message.params.requestId, message.params.request);
        if (message.params.type === "Document")
          documentRequests.push(message.params.request.url);
      }
      if (
        message.method === "Network.loadingFinished" ||
        message.method === "Network.loadingFailed"
      ) {
        const request = networkRequests.get(message.params.requestId);
        if (request?.method === "POST") postCount += 1;
      }
    });
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
    console.log("SHOP_OPEN", path);
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
  const setChecked = async (name, checked) => {
    await page.evaluate(`(() => {
      const el = [...document.querySelectorAll('[name=${name}]')].find((node) => node.checkVisibility());
      if (el.checked !== ${checked}) el.click();
    })()`);
  };
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
      const shopPage = document.querySelector("[data-shop-page]");
      const pageBox = shopPage && shopPage.checkVisibility()
        ? shopPage
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
  await go("/shop");
  await text("상품 24개");
  await text("천사부적 3종");
  await text("사랑·인연 / 소원성취 / 재물");
  await text("[배송·교환·환불 안내 준비 중]");
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll("a")].find((node) => node.checkVisibility() && node.textContent.includes("천사부적 3종")).getAttribute("href")`,
    ),
    "/shop?category=charm",
  );
  await clickLink("타로카드");
  await text("상품 0개");
  await text("등록된 상품이 없습니다.");
  await absent(longName);
  await clickLink("천사부적");
  await text("상품 3개");
  await text("천사부적 사랑·인연");
  await text("천사부적 재물");
  await absent(longName);
  await absent("종류 선택");
  await clickLink("전체");
  await text("상품 24개");
  await text(longName);
  await text("품절");
  await text("18,000원");
  await text("상품 사진을 불러오지 못했습니다.");
  await text("상품 사진 없음");
  await absent("테스트 비공개비밀");
  await absent("비밀설명토큰");
  await absent("테스트 둘째쪽");
  assert.equal(await htmlHas("18000.00"), false);
  assert.equal(await htmlHas(secretId), false);
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll("a,button")].some((node) => /구매하기|결제하기/.test(node.textContent))`,
    ),
    false,
  );
  assert.equal(
    await page.evaluate(
      `[...document.querySelectorAll("a")].find((node) => node.checkVisibility() && (node.getAttribute("aria-label") || "").startsWith("장바구니")).getAttribute("href")`,
    ),
    "/shop/cart",
  );
  await clickLink("다음");
  await text("테스트 둘째쪽");
  await text("2 / 2");
  await go(`/shop/${soldId}`);
  await text("줄바꿈첫줄");
  await text("줄바꿈둘째줄");
  await text("[배송·교환·환불 안내 준비 중]");
  await text("주문과 결제는 준비 중입니다.");
  await absent("종류 선택");
  await absent("바로 구매");
  await text("품절");
  await text("18,000원");
  await text("상품 사진을 불러오지 못했습니다.");
  const backHref = await page.evaluate(
    `[...document.querySelectorAll("a")].find((node) => node.checkVisibility() && node.textContent.trim() === "상품 목록").getAttribute("href")`,
  );
  assert.equal(backHref, "/shop");
  assert.equal(await htmlHas("비밀설명토큰"), false);
  await go(`/shop/${plainId}`);
  await text("상품 사진 없음");
  await text("판매 가능");
  await absent("상품 사진을 불러오지 못했습니다.");
  await go(`/shop/${secretId}`);
  await text("상품을 찾을 수 없습니다.");
  await absent("비밀설명토큰");
  await absent("테스트 비공개비밀");
  await go("/shop/not-a-uuid");
  await text("상품을 찾을 수 없습니다.");
  await go("/shop?page=0");
  await text("목록 조건이 올바르지 않습니다.");
  await absent("등록된 상품이 없습니다.");
  customerEmpty = true;
  await go("/shop");
  await text("등록된 상품이 없습니다.");
  await absent("상품을 불러오지 못했습니다.");
  customerEmpty = false;
  listFail = true;
  await go("/shop");
  await text("상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  listFail = false;
  await go(`/shop/${charmLoveId}`);
  await text("천사부적");
  await text("5,000원");
  await text("[배송·교환·환불 안내 준비 중]");
  await absent("종류 선택");
  await absent("바로 구매");
  await go("/admin/shop-products");
  await text("총 25건");
  await text("테스트 비공개비밀");
  await text("비공개");
  const menuHref = await page.evaluate(
    `[...document.querySelectorAll('a')].find((item) => item.checkVisibility() && item.textContent.trim() === '타로샵 상품').getAttribute('href')`,
  );
  assert.equal(menuHref, "/admin/shop-products");
  const counselorHref = await page.evaluate(
    `[...document.querySelectorAll('a')].find((item) => item.checkVisibility() && item.textContent.trim() === '상담사상품').getAttribute('href')`,
  );
  assert.equal(counselorHref, "/admin/counselors");
  const here = () => page.evaluate("location.pathname + location.search");
  const applyStatus = async (status) => {
    await page.evaluate(`(() => {
      const select = [...document.querySelectorAll('[name=status]')].find((node) => node.checkVisibility());
      select.value = ${JSON.stringify(status)};
      select.form.requestSubmit();
    })()`);
  };
  await page.evaluate(`(() => {
    window.__shopFilterMarker = "keep";
    sessionStorage.setItem("shop-doc-nav", "0");
    window.addEventListener("beforeunload", () => {
      const next = Number(sessionStorage.getItem("shop-doc-nav") || "0") + 1;
      sessionStorage.setItem("shop-doc-nav", String(next));
    }, { capture: true });
  })()`);
  const docsBeforeFilter = documentRequests.length;
  await applyStatus("private");
  await text("총 1건");
  await text("테스트 비공개비밀");
  await absent(longName);
  assert.equal(await page.evaluate("window.__shopFilterMarker"), "keep");
  assert.equal(
    await page.evaluate("sessionStorage.getItem('shop-doc-nav')"),
    "0",
  );
  assert.equal(documentRequests.length, docsBeforeFilter);
  assert.equal(await here(), "/admin/shop-products?status=private");
  await applyStatus("public");
  await text("총 24건");
  await text(longName);
  await absent("테스트 비공개비밀");
  assert.equal(await here(), "/admin/shop-products?status=public");
  assert.equal(documentRequests.length, docsBeforeFilter);
  await page.evaluate("history.back()");
  await text("총 1건");
  assert.equal(await here(), "/admin/shop-products?status=private");
  await page.evaluate("history.forward()");
  await text("총 24건");
  assert.equal(await here(), "/admin/shop-products?status=public");
  await clickLink("상품 등록");
  await text("상품 등록");
  await page.button("저장 전 확인");
  await until(
    () =>
      page.evaluate(`document.activeElement?.id?.endsWith("-name") === true`),
    "name focus",
  );
  await page.fill("name", "테스트 연속저장");
  await page.fill("description", "연속 저장 설명");
  await page.fill("price", "5000");
  const beforeCreate = writes;
  await page.button("저장 전 확인");
  await confirm();
  await until(
    () =>
      page.evaluate(
        "location.pathname.startsWith('/admin/shop-products/') && !location.pathname.endsWith('/new')",
      ),
    "created editor",
  );
  await text("상품을 저장했습니다.");
  assert.equal(writes, beforeCreate + 1);
  await absent("사진 정리 다시 시도");
  const createdPath = await page.evaluate("location.pathname");
  const createdId = createdPath.split("/").at(-1);
  const updatedAt = () =>
    page.evaluate(
      `[...document.querySelectorAll('[data-updated-at]')].find((node) => node.checkVisibility()).dataset.updatedAt`,
    );
  const firstVersion = await updatedAt();
  await setChecked("is_published", true);
  await page.button("저장 전 확인");
  await confirm();
  await text("상품을 저장했습니다.");
  assert.equal(await page.evaluate("location.pathname"), createdPath);
  const secondVersion = await updatedAt();
  assert.notEqual(secondVersion, firstVersion);
  assert.equal(products.find((row) => row.id === createdId).is_published, true);
  await setChecked("is_sold_out", true);
  await page.button("저장 전 확인");
  await confirm();
  assert.equal(products.find((row) => row.id === createdId).is_sold_out, true);
  assert.equal(products.find((row) => row.id === createdId).is_published, true);
  const thirdVersion = await updatedAt();
  assert.notEqual(thirdVersion, secondVersion);
  await setChecked("is_sold_out", false);
  await page.button("저장 전 확인");
  await confirm();
  assert.equal(products.find((row) => row.id === createdId).is_sold_out, false);
  assert.notEqual(await updatedAt(), thirdVersion);
  const serverRow = products.find((row) => row.id === createdId);
  serverRow.updated_at = stamp();
  serverRow.name = "테스트 서버제목";
  await page.fill("name", "테스트 충돌입력");
  await page.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 상품이 변경됐습니다.");
  assert.equal(await visibleValue("name"), "테스트 충돌입력");
  await page.button("최신 내용 다시 불러오기");
  await confirm();
  await text("최신 내용을 불러왔습니다.");
  assert.equal(await visibleValue("name"), "테스트 서버제목");
  loseResponse = true;
  await page.fill("description", "응답 유실 설명");
  const beforeLost = writes;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(writes, beforeLost + 1);
  await page.button("저장 결과 다시 확인");
  await text("저장 결과를 확인했습니다.");
  assert.equal(writes, beforeLost + 1);
  assert.equal(
    products.find((row) => row.id === createdId).description,
    "응답 유실 설명",
  );
  await page.button("삭제 전 확인");
  await text("테스트 서버제목 상품을 삭제하면");
  await page.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await until(
    () =>
      page.evaluate(
        "![...document.querySelectorAll('dialog')].some((node) => node.open && node.checkVisibility())",
      ),
    "escape closed",
  );
  assert.equal(
    products.some((row) => row.id === createdId),
    true,
  );
  loseResponse = true;
  await page.button("삭제 전 확인");
  await confirm();
  await text("삭제 결과를 확인하지 못했습니다.");
  const deletes = writes;
  await page.button("삭제 결과 다시 확인");
  await until(
    () => page.evaluate("location.pathname === '/admin/shop-products'"),
    "deleted list",
  );
  await text("상품을 삭제했습니다.");
  assert.equal(writes, deletes);
  assert.equal(
    products.some((row) => row.id === createdId),
    false,
  );
  await go(`/shop/${createdId}`);
  await text("상품을 찾을 수 없습니다.");
  await absent("응답 유실 설명");
  const selectImage = async (name, color, width, height) => {
    await page.evaluate(
      `(async()=>{const c=document.createElement('canvas');c.width=${width};c.height=${height};const x=c.getContext('2d');x.fillStyle=${JSON.stringify(color)};x.fillRect(0,0,c.width,c.height);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));const el=Array.from(document.querySelectorAll('input[type=file]')).find(e=>e.checkVisibility()&&!e.disabled);el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await until(
      () =>
        page.evaluate(
          `(()=>{const input=Array.from(document.querySelectorAll('input[type=file]')).find(e=>e.checkVisibility());const image=document.querySelector('[data-product-photo] img');return input?.files?.[0]?.name===${JSON.stringify(name)}&&image?.src.startsWith('blob:')&&image.naturalWidth===${width}&&image.naturalHeight===${height}})()`,
        ),
      `preview ${name}`,
    );
  };
  await go(`/admin/shop-products/${plainId}`);
  await text("상품 편집");
  await selectImage("a.png", "#224466", 24, 24);
  await page.fill("image_alt", "사진 가");
  const pathsBeforeA = new Set(files.keys());
  const writesBeforeA = writes;
  const removesBeforeA = storageRemoves;
  await page.button("저장 전 확인");
  dropWrite = true;
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const pathA = [...files.keys()].find((key) => !pathsBeforeA.has(key));
  assert.ok(pathA);
  assert.equal(products.find((row) => row.id === plainId).image_path, null);
  assert.equal(writes, writesBeforeA);
  assert.equal(storageRemoves, removesBeforeA);
  storageInfoMode = "403";
  await page.button("저장 결과 다시 확인");
  await text("수정 전 버전 그대로");
  await text("사진 조회 권한이 없습니다");
  assert.equal(writes, writesBeforeA);
  assert.equal(storageRemoves, removesBeforeA);
  assert.equal(files.has(pathA), true);
  assert.equal(products.find((row) => row.id === plainId).image_path, null);
  await selectImage("b.png", "#884422", 30, 18);
  const pathsBeforeB = new Set(files.keys());
  await page.button("저장 전 확인");
  await confirm();
  await text("상품을 저장했습니다.");
  const pathB = [...files.keys()].find((key) => !pathsBeforeB.has(key));
  assert.ok(pathB);
  assert.notEqual(pathB, pathA);
  assert.equal(products.find((row) => row.id === plainId).image_path, pathB);
  assert.equal(
    files.get(pathB)?.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
  );
  await until(
    () =>
      page.evaluate(
        `(()=>{const image=document.querySelector('[data-product-photo] img');return image?.src.includes(${JSON.stringify(pathB)})&&image.naturalWidth===30&&image.naturalHeight===18})()`,
      ),
    "saved preview B",
  );
  assert.equal(files.has(pathA), true);
  assert.equal(files.has(pathB), true);
  const writesAfterB = writes;
  await page.button("사진 정리 다시 시도");
  await text("사진 정리를 마쳤습니다.");
  assert.equal(files.has(pathA), false);
  assert.equal(files.has(pathB), true);
  assert.equal(writes, writesAfterB);
  assert.equal(storageRemoves, removesBeforeA + 1);
  const photoId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const oldPath = "products/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png";
  products.push({
    id: photoId,
    name: "테스트 사진정리",
    description: "사진 정리 설명",
    price: 6000,
    image_path: oldPath,
    image_alt: "기존 사진",
    is_published: false,
    is_sold_out: false,
    sort_order: 0,
    created_at: stamp(),
    updated_at: stamp(),
  });
  files.set(oldPath, Buffer.from("old-photo"));
  await go(`/admin/shop-products/${photoId}`);
  await text("상품 편집");
  await selectImage("c.png", "#336633", 28, 20);
  const pathsBeforeC = new Set(files.keys());
  const removesBeforeReplace = storageRemoves;
  loseResponse = true;
  const writesBeforeReplace = writes;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const pathC = [...files.keys()].find((key) => !pathsBeforeC.has(key));
  assert.ok(pathC);
  assert.equal(products.find((row) => row.id === photoId).image_path, pathC);
  assert.equal(writes, writesBeforeReplace + 1);
  assert.equal(storageRemoves, removesBeforeReplace);
  assert.equal(files.has(oldPath), true);
  assert.equal(files.has(pathC), true);
  await page.button("저장 결과 다시 확인");
  await text("사진 정리 버튼으로만 지웁니다");
  assert.equal(writes, writesBeforeReplace + 1);
  assert.equal(storageRemoves, removesBeforeReplace);
  assert.equal(files.has(oldPath), true);
  await page.button("사진 정리 다시 시도");
  await text("사진 정리를 마쳤습니다.");
  assert.equal(files.has(oldPath), false);
  assert.equal(files.has(pathC), true);
  assert.equal(writes, writesBeforeReplace + 1);
  assert.equal(storageRemoves, removesBeforeReplace + 1);
  loseResponse = true;
  await page.button("삭제 전 확인");
  await confirm();
  await text("삭제 결과를 확인하지 못했습니다.");
  const writesAfterDelete = writes;
  const removesAfterDelete = storageRemoves;
  assert.equal(
    products.some((row) => row.id === photoId),
    false,
  );
  assert.equal(files.has(pathC), true);
  await page.button("삭제 결과 다시 확인");
  await text("사진 정리 버튼으로만 지웁니다");
  assert.equal(
    await page.evaluate("location.pathname"),
    `/admin/shop-products/${photoId}`,
  );
  assert.equal(writes, writesAfterDelete);
  assert.equal(storageRemoves, removesAfterDelete);
  assert.equal(files.has(pathC), true);
  await page.button("사진 정리 다시 시도");
  await until(
    () => page.evaluate("location.pathname === '/admin/shop-products'"),
    "photo delete list",
  );
  await text("상품을 삭제했습니다.");
  assert.equal(files.has(pathC), false);
  assert.equal(writes, writesAfterDelete);
  assert.equal(storageRemoves, removesAfterDelete + 1);
  await go("/admin/shop-products/new");
  await page.fill("name", "테스트 늦은신규");
  await page.fill("description", "늦은 응답 설명");
  await page.fill("price", "8000");
  const gate = armGate();
  const beforeLate = writes;
  await page.button("저장 전 확인");
  await page.button("확인 후 처리");
  await until(() => gate.count === 1, "held create");
  assert.equal(writes, beforeLate + 1);
  const createdLate = products.find((row) => row.name === "테스트 늦은신규");
  assert.ok(createdLate);
  await clickLink("사이트 보기");
  await until(
    () => page.evaluate("location.pathname === '/'"),
    "left during create",
  );
  const postsAtCreate = postCount;
  gate.release();
  await until(() => postCount > postsAtCreate, "create action finished");
  const watch = Date.now();
  while (Date.now() - watch < 1000) {
    assert.equal(await page.evaluate("location.pathname"), "/");
    await delay(100);
  }
  assert.equal(writes, beforeLate + 1);
  await page.evaluate("history.back()");
  await until(
    () =>
      page.evaluate(
        `location.pathname === ${JSON.stringify(`/admin/shop-products/${createdLate.id}`)} && location.search.includes('result=saved')`,
      ),
    "restored create navigation",
  );
  await text("상품을 저장했습니다.");
  assert.equal(writes, beforeLate + 1);
  await go("/admin/shop-products/new");
  await text("상품 등록");
  await page.fill("name", "테스트 없는업로드");
  await page.fill("description", "없는 업로드 설명");
  await page.fill("price", "4100");
  await page.fill("image_alt", "다시 올릴 사진");
  await selectImage("retry.png", "#112233", 20, 16);
  const pathsBeforeRetry = new Set(files.keys());
  const writesBeforeRetry = writes;
  const removesBeforeRetry = storageRemoves;
  dropWrite = true;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const pathRetry = [...files.keys()].find((key) => !pathsBeforeRetry.has(key));
  assert.ok(pathRetry);
  assert.equal(
    products.some((row) => row.name === "테스트 없는업로드"),
    false,
  );
  assert.equal(writes, writesBeforeRetry);
  assert.equal(storageRemoves, removesBeforeRetry);
  files.delete(pathRetry);
  await page.button("저장 결과 다시 확인");
  await text(
    "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다.",
  );
  assert.equal(writes, writesBeforeRetry);
  assert.equal(storageRemoves, removesBeforeRetry);
  assert.equal(files.has(pathRetry), false);
  assert.equal(await visibleValue("name"), "테스트 없는업로드");
  assert.equal(await visibleValue("description"), "없는 업로드 설명");
  assert.equal(await visibleValue("price"), "4100");
  assert.equal(await visibleValue("image_alt"), "다시 올릴 사진");
  assert.equal(
    await page.evaluate(
      `(() => {
        const input = [...document.querySelectorAll('input[type=file]')].find((node) => node.checkVisibility());
        return input?.files?.[0]?.name === "retry.png";
      })()`,
    ),
    true,
  );
  const pathsBeforeSecond = new Set(files.keys());
  await page.button("저장 전 확인");
  await confirm();
  await text("상품을 저장했습니다.");
  const pathSecond = [...files.keys()].find(
    (key) => !pathsBeforeSecond.has(key),
  );
  const createdRetry = products.find((row) => row.name === "테스트 없는업로드");
  assert.ok(pathSecond);
  assert.notEqual(pathSecond, pathRetry);
  assert.ok(createdRetry);
  assert.equal(createdRetry.image_path, pathSecond);
  assert.equal(files.has(pathSecond), true);
  assert.equal(writes, writesBeforeRetry + 1);
  assert.equal(storageRemoves, removesBeforeRetry);
  assert.equal(
    await page.evaluate("location.pathname"),
    `/admin/shop-products/${createdRetry.id}`,
  );
  await absent("사진 정리 다시 시도");
  await go("/admin/shop-products/new");
  await text("상품 등록");
  await page.fill("name", "테스트 정리유지");
  await page.fill("description", "정리 유지 설명");
  await page.fill("price", "4200");
  await page.fill("image_alt", "사진 비");
  await selectImage("a-orphan.png", "#441122", 22, 14);
  const pathsBeforeOrphan = new Set(files.keys());
  const writesBeforeOrphan = writes;
  const removesBeforeOrphan = storageRemoves;
  dropWrite = true;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const pathOrphan = [...files.keys()].find(
    (key) => !pathsBeforeOrphan.has(key),
  );
  assert.ok(pathOrphan);
  assert.equal(files.has(pathOrphan), true);
  assert.equal(writes, writesBeforeOrphan);
  assert.equal(storageRemoves, removesBeforeOrphan);
  await page.button("저장 결과 다시 확인");
  await text("입력은 유지됩니다");
  assert.equal(writes, writesBeforeOrphan);
  assert.equal(storageRemoves, removesBeforeOrphan);
  assert.equal(files.has(pathOrphan), true);
  await selectImage("b-kept.png", "#226644", 26, 18);
  const pathsBeforeKept = new Set(files.keys());
  await page.button("저장 전 확인");
  await confirm();
  const pathKept = [...files.keys()].find((key) => !pathsBeforeKept.has(key));
  const createdKeep = products.find((row) => row.name === "테스트 정리유지");
  assert.ok(pathKept);
  assert.notEqual(pathKept, pathOrphan);
  assert.ok(createdKeep);
  assert.equal(createdKeep.image_path, pathKept);
  assert.equal(files.has(pathOrphan), true);
  assert.equal(files.has(pathKept), true);
  assert.equal(writes, writesBeforeOrphan + 1);
  assert.equal(storageRemoves, removesBeforeOrphan);
  await until(
    () =>
      page.evaluate(
        `location.pathname === ${JSON.stringify(`/admin/shop-products/${createdKeep.id}`)}`,
      ),
    "cleanup handoff editor",
  );
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  await page.button("사진 정리 다시 시도");
  await text("사진 정리를 마쳤습니다.");
  assert.equal(
    await page.evaluate("location.pathname"),
    `/admin/shop-products/${createdKeep.id}`,
  );
  assert.equal(files.has(pathOrphan), false);
  assert.equal(files.has(pathKept), true);
  assert.equal(
    products.find((row) => row.id === createdKeep.id)?.image_path,
    pathKept,
  );
  assert.equal(
    products.some((row) => row.id === createdKeep.id),
    true,
  );
  assert.equal(writes, writesBeforeOrphan + 1);
  assert.equal(storageRemoves, removesBeforeOrphan + 1);
  await absent("사진 정리 다시 시도");
  const editorStatus = () =>
    page.evaluate(
      `document.querySelector('[role=status][tabindex="-1"]')?.textContent?.trim() ?? ""`,
    );
  const openAdminPath = async (href) => {
    await until(
      () =>
        page.evaluate(
          `[...document.querySelectorAll("a")].some((item) => item.checkVisibility() && item.getAttribute("href") === ${JSON.stringify(href)})`,
        ),
      href,
    );
    await page.evaluate(
      `[...document.querySelectorAll("a")].find((item) => item.checkVisibility() && item.getAttribute("href") === ${JSON.stringify(href)}).click()`,
    );
  };
  const waitPath = async (path, label) => {
    await until(
      () => page.evaluate(`location.pathname === ${JSON.stringify(path)}`),
      label,
    );
  };
  const waitValue = async (name, value) => {
    await until(
      () =>
        page.evaluate(
          `[...document.querySelectorAll('[name=${name}]')].some((node) => node.checkVisibility() && node.value === ${JSON.stringify(value)})`,
        ),
      `${name}=${value}`,
    );
  };
  const registerOrphanProduct = async ({
    name,
    description,
    price,
    alt,
    orphanName,
    orphanColor,
    keptName,
    keptColor,
  }) => {
    await text("새 상품은 비공개로 시작합니다.");
    await page.fill("name", name);
    await page.fill("description", description);
    await page.fill("price", price);
    await page.fill("image_alt", alt);
    await selectImage(orphanName, orphanColor, 22, 14);
    const pathsBefore = new Set(files.keys());
    const writesBefore = writes;
    const removesBefore = storageRemoves;
    dropWrite = true;
    await page.button("저장 전 확인");
    await confirm();
    await text("결과를 확인하지 못했습니다.");
    const orphan = [...files.keys()].find((key) => !pathsBefore.has(key));
    assert.ok(orphan);
    assert.equal(files.has(orphan), true);
    assert.equal(writes, writesBefore);
    assert.equal(storageRemoves, removesBefore);
    await page.button("저장 결과 다시 확인");
    await text("입력은 유지됩니다");
    assert.equal(files.has(orphan), true);
    await selectImage(keptName, keptColor, 26, 18);
    const pathsBeforeKept = new Set(files.keys());
    await page.button("저장 전 확인");
    await confirm();
    const kept = [...files.keys()].find((key) => !pathsBeforeKept.has(key));
    const created = products.find((row) => row.name === name);
    assert.ok(kept);
    assert.notEqual(kept, orphan);
    assert.ok(created);
    assert.equal(created.image_path, kept);
    assert.equal(files.has(orphan), true);
    assert.equal(files.has(kept), true);
    await waitPath(`/admin/shop-products/${created.id}`, `${name} editor`);
    await text("상품을 저장했습니다.");
    assert.equal(await editorStatus(), "상품을 저장했습니다.");
    await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
    return { id: created.id, orphan, kept };
  };
  await go("/admin/shop-products/new");
  const firstCleanup = await registerOrphanProduct({
    name: "테스트 정리하나",
    description: "첫째 정리 설명",
    price: "4300",
    alt: "첫째 사진",
    orphanName: "first-orphan.png",
    orphanColor: "#551133",
    keptName: "first-kept.png",
    keptColor: "#225577",
  });
  await clickLink("상품 목록으로");
  await waitPath("/admin/shop-products", "list after first");
  await openAdminPath("/admin/shop-products/new");
  await waitPath("/admin/shop-products/new", "second new");
  const secondCleanup = await registerOrphanProduct({
    name: "테스트 정리둘",
    description: "둘째 정리 설명",
    price: "4400",
    alt: "둘째 사진",
    orphanName: "second-orphan.png",
    orphanColor: "#334411",
    keptName: "second-kept.png",
    keptColor: "#663322",
  });
  assert.notEqual(secondCleanup.id, firstCleanup.id);
  assert.equal(files.has(firstCleanup.orphan), true);
  assert.equal(files.has(secondCleanup.orphan), true);
  await clickLink("상품 목록으로");
  await waitPath("/admin/shop-products", "list after second");
  await openAdminPath(`/admin/shop-products/${firstCleanup.id}`);
  await waitPath(
    `/admin/shop-products/${firstCleanup.id}`,
    "return first editor",
  );
  await waitValue("name", "테스트 정리하나");
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  assert.equal(await editorStatus(), "");
  await selectImage("follow-orphan.png", "#772244", 21, 15);
  const pathsBeforeFollow = new Set(files.keys());
  const writesBeforeFollow = writes;
  dropWrite = true;
  await page.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const followOrphan = [...files.keys()].find(
    (key) => !pathsBeforeFollow.has(key),
  );
  assert.ok(followOrphan);
  assert.equal(files.has(followOrphan), true);
  assert.equal(files.has(firstCleanup.orphan), true);
  assert.equal(writes, writesBeforeFollow);
  await page.button("저장 결과 다시 확인");
  await text("수정 전 버전 그대로");
  assert.match(await editorStatus(), /수정 전 버전 그대로/);
  assert.equal(
    (await editorStatus()).includes(
      "이전 사진은 사진 정리 버튼으로만 지웁니다",
    ),
    false,
  );
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  assert.equal(files.has(followOrphan), true);
  assert.equal(files.has(firstCleanup.orphan), true);
  await selectImage("follow-kept.png", "#117755", 29, 17);
  const pathsBeforeFollowKept = new Set(files.keys());
  await page.button("저장 전 확인");
  await confirm();
  await text("상품을 저장했습니다.");
  const followKept = [...files.keys()].find(
    (key) => !pathsBeforeFollowKept.has(key),
  );
  assert.ok(followKept);
  assert.equal(
    products.find((row) => row.id === firstCleanup.id)?.image_path,
    followKept,
  );
  assert.equal(files.has(followOrphan), true);
  assert.equal(files.has(firstCleanup.orphan), true);
  assert.equal(files.has(secondCleanup.orphan), true);
  assert.equal(files.has(followKept), true);
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  const conflictRow = products.find((row) => row.id === firstCleanup.id);
  conflictRow.updated_at = stamp();
  const writesBeforeConflict = writes;
  const removesBeforeConflict = storageRemoves;
  await page.fill("name", "테스트 정리충돌");
  await page.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 상품이 변경됐습니다. 최신 내용을 확인해 주세요.");
  assert.equal(
    await editorStatus(),
    "다른 작업으로 상품이 변경됐습니다. 최신 내용을 확인해 주세요.",
  );
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  assert.equal(await visibleValue("name"), "테스트 정리충돌");
  assert.equal(writes, writesBeforeConflict);
  assert.equal(storageRemoves, removesBeforeConflict);
  assert.equal(files.has(followOrphan), true);
  assert.equal(files.has(firstCleanup.orphan), true);
  assert.equal(files.has(secondCleanup.orphan), true);
  assert.equal(files.has(followKept), true);
  await page.button("사진 정리 다시 시도");
  await until(() => files.has(followOrphan) === false, "follow-up cleaned");
  await text("사진 정리를 마쳤습니다.");
  assert.equal(files.has(firstCleanup.orphan), true);
  assert.equal(files.has(secondCleanup.orphan), true);
  assert.equal(files.has(followKept), true);
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  await text("사진 정리 다시 시도");
  await page.button("사진 정리 다시 시도");
  await until(
    () => files.has(firstCleanup.orphan) === false,
    "first orphan cleaned",
  );
  await text("사진 정리를 마쳤습니다.");
  await absent("사진 정리 다시 시도");
  await absent("이전 사진은 사진 정리 버튼으로만 지웁니다");
  assert.equal(files.has(secondCleanup.orphan), true);
  assert.equal(files.has(followKept), true);
  assert.equal(files.has(secondCleanup.kept), true);
  assert.equal(
    products.find((row) => row.id === firstCleanup.id)?.image_path,
    followKept,
  );
  await clickLink("상품 목록으로");
  await text("저장하지 않은 입력");
  await page.button("목록으로 이동");
  await waitPath("/admin/shop-products", "list after conflict");
  await openAdminPath(`/admin/shop-products/${secondCleanup.id}`);
  await waitPath(
    `/admin/shop-products/${secondCleanup.id}`,
    "return second editor",
  );
  await waitValue("name", "테스트 정리둘");
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  const writesBeforeSecondCleanup = writes;
  await page.button("사진 정리 다시 시도");
  await until(
    () => files.has(secondCleanup.orphan) === false,
    "second orphan cleaned",
  );
  await text("사진 정리를 마쳤습니다.");
  await absent("사진 정리 다시 시도");
  assert.equal(files.has(secondCleanup.kept), true);
  assert.equal(files.has(followKept), true);
  assert.equal(
    products.find((row) => row.id === secondCleanup.id)?.image_path,
    secondCleanup.kept,
  );
  assert.equal(
    products.some((row) => row.id === secondCleanup.id),
    true,
  );
  assert.equal(writes, writesBeforeSecondCleanup);
  await go("/admin/shop-products/new");
  const pendingDelete = await registerOrphanProduct({
    name: "테스트 삭제정리",
    description: "삭제 뒤 정리 설명",
    price: "4500",
    alt: "삭제 전 사진",
    orphanName: "delete-orphan.png",
    orphanColor: "#442255",
    keptName: "delete-kept.png",
    keptColor: "#225544",
  });
  cleanupFail = true;
  await page.button("사진 빼기");
  const writesBeforeRemoval = writes;
  const removesBeforeRemoval = storageRemoves;
  await page.button("저장 전 확인");
  await confirm();
  await text("이전 사진은 사진 정리 버튼으로만 지웁니다");
  await text("사진 정리 다시 시도");
  assert.equal(
    products.find((row) => row.id === pendingDelete.id)?.image_path,
    null,
  );
  assert.equal(files.has(pendingDelete.kept), true);
  assert.equal(files.has(pendingDelete.orphan), true);
  assert.equal(writes, writesBeforeRemoval + 1);
  assert.equal(storageRemoves, removesBeforeRemoval + 1);
  cleanupFail = false;
  const writesBeforePendingDelete = writes;
  const removesBeforePendingDelete = storageRemoves;
  const deletesBeforePending = productDeletes;
  await page.button("삭제 전 확인");
  await confirm();
  await until(
    () =>
      page.evaluate(
        `document.querySelector('[data-product-editor="removed"]')?.checkVisibility() === true`,
      ),
    "removed editor stays",
  );
  await text("상품 삭제를 확인했습니다.");
  await text("사진은 사진 정리 버튼으로만 지웁니다");
  await text("사진 정리 다시 시도");
  assert.equal(
    await page.evaluate("location.pathname"),
    `/admin/shop-products/${pendingDelete.id}`,
  );
  assert.equal(
    products.some((row) => row.id === pendingDelete.id),
    false,
  );
  assert.equal(files.has(pendingDelete.kept), true);
  assert.equal(files.has(pendingDelete.orphan), true);
  assert.equal(writes, writesBeforePendingDelete + 1);
  assert.equal(productDeletes, deletesBeforePending + 1);
  assert.equal(storageRemoves, removesBeforePendingDelete);
  const pendingPhotos = [pendingDelete.kept, pendingDelete.orphan];
  await page.button("사진 정리 다시 시도");
  await until(
    () => pendingPhotos.filter((item) => files.has(item)).length === 1,
    "one photo cleaned",
  );
  await text("사진 정리를 마쳤습니다.");
  await text("사진은 사진 정리 버튼으로만 지웁니다");
  await text("사진 정리 다시 시도");
  assert.equal(
    await page.evaluate("location.pathname"),
    `/admin/shop-products/${pendingDelete.id}`,
  );
  assert.equal(pendingPhotos.filter((item) => files.has(item)).length, 1);
  assert.equal(writes, writesBeforePendingDelete + 1);
  assert.equal(productDeletes, deletesBeforePending + 1);
  assert.equal(storageRemoves, removesBeforePendingDelete + 1);
  await page.button("사진 정리 다시 시도");
  await until(
    () => page.evaluate("location.pathname === '/admin/shop-products'"),
    "last cleanup list",
  );
  await text("상품을 삭제했습니다.");
  assert.equal(files.has(pendingDelete.orphan), false);
  assert.equal(files.has(pendingDelete.kept), false);
  assert.equal(writes, writesBeforePendingDelete + 1);
  assert.equal(productDeletes, deletesBeforePending + 1);
  assert.equal(storageRemoves, removesBeforePendingDelete + 2);
  await go("/admin/shop-products/new");
  const lateCleanup = await registerOrphanProduct({
    name: "테스트 늦은정리",
    description: "늦은 정리 설명",
    price: "4600",
    alt: "늦은 정리 사진",
    orphanName: "late-orphan.png",
    orphanColor: "#553311",
    keptName: "late-kept.png",
    keptColor: "#113355",
  });
  const deletesBeforeLate = productDeletes;
  await page.button("삭제 전 확인");
  await confirm();
  await until(
    () =>
      page.evaluate(
        `document.querySelector('[data-product-editor="removed"]')?.checkVisibility() === true`,
      ),
    "late cleanup screen",
  );
  await text("사진은 사진 정리 버튼으로만 지웁니다");
  assert.equal(productDeletes, deletesBeforeLate + 1);
  assert.equal(files.has(lateCleanup.orphan), true);
  assert.equal(files.has(lateCleanup.kept), false);
  const lateGate = armStorageGate();
  const postsBeforeLate = postCount;
  await page.button("사진 정리 다시 시도");
  await until(() => lateGate.count === 1, "held last cleanup");
  await clickLink("예약 관리");
  await until(
    () => page.evaluate("location.pathname === '/admin/reservations'"),
    "left during cleanup",
  );
  lateGate.release();
  await until(() => postCount > postsBeforeLate, "cleanup action finished");
  await until(
    () => files.has(lateCleanup.orphan) === false,
    "late orphan cleaned",
  );
  const lateWatch = Date.now();
  while (Date.now() - lateWatch < 1000) {
    assert.equal(
      await page.evaluate("location.pathname"),
      "/admin/reservations",
    );
    await delay(100);
  }
  assert.equal(productDeletes, deletesBeforeLate + 1);
  assert.equal(files.has(lateCleanup.kept), false);
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
    await go("/shop");
    await text(longName);
    let box = await measure();
    assert.equal(box.overflow, false, `list overflow ${width}`);
    assert.equal(box.covered, false, `list covered ${width}`);
    assert.equal(box.controls.length, 0, `list touch ${width} ${box.controls}`);
    assert.equal(box.pad, pad, `list pad ${width}`);
    assert.equal(box.fine, fine, `list pointer ${width}`);
    if (fine) assert.equal(box.width, 560);
    else if (width >= 1024) assert.equal(box.width, 1024);
    else assert.equal(box.width, width);
    await screenshot(`customer-list-${width}.png`);
    await go(`/shop/${soldId}`);
    await text("주문과 결제는 준비 중입니다.");
    box = await measure();
    assert.equal(box.overflow, false, `detail overflow ${width}`);
    assert.equal(box.covered, false, `detail covered ${width}`);
    assert.equal(
      box.controls.length,
      0,
      `detail touch ${width} ${box.controls}`,
    );
    assert.equal(box.fine, fine, `detail pointer ${width}`);
    await screenshot(`customer-detail-${width}.png`);
    await go(`/admin/shop-products/${soldId}`);
    await text("상품 편집");
    box = await measure();
    assert.equal(box.overflow, false, `editor overflow ${width}`);
    assert.equal(
      box.controls.length,
      0,
      `editor touch ${width} ${box.controls}`,
    );
    assert.equal(box.pad, pad, `editor pad ${width}`);
    assert.equal(box.fine, fine, `editor pointer ${width}`);
    if (fine) {
      assert.equal(box.width, 560);
      console.log(
        "SHOP_PC",
        JSON.stringify({ fine: box.fine, width: box.width, pad: box.pad }),
      );
    }
    await screenshot(`admin-editor-${width}.png`);
  }
  console.log("SHOP_BROWSER_OK");
} catch (error) {
  if (page) {
    try {
      console.error("SHOP_FAIL_URL", await page.evaluate("location.href"));
      console.error(
        "SHOP_FAIL_TEXT",
        await page.evaluate("document.body?.innerText?.slice(0, 1800)"),
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
