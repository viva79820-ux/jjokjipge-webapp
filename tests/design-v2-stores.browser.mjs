// 매장 화면 전용 격리 검사. 실제 Supabase와 전화 발신은 쓰지 않는다. 포트 4333.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  browser,
  delay,
  server,
  stop,
  until,
} from "./notices-browser-tools.mjs";

const outDir = join("tmp", "design-v2-stores");
mkdirSync(outDir, { recursive: true });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const dbPhoto = "stores/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";
const brokenPhoto = "stores/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";
const longName = `긴매장${"가".repeat(40)}`;
const longAddress = `대구광역시 중구 동성로 테스트길 ${"나".repeat(40)}`;
const stores = [
  {
    id: "00000000-0000-4000-8000-000000000007",
    slug: "store-hidden",
    name: "숨긴매장",
    description: "비공개",
    address: "숨김 주소",
    hours: "비공개 시간",
    phone: "053-000-9999",
    image_path: dbPhoto,
    sort_order: -1,
    is_active: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    slug: "store-ambiguous",
    name: "1·2호점",
    description: "",
    address: "",
    hours: "",
    phone: "",
    image_path: null,
    sort_order: 5,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    slug: "store-placeholder",
    name: "주소확인매장",
    description: "",
    address: "[상세 주소 확인 필요]",
    hours: "",
    phone: "",
    image_path: null,
    sort_order: 4,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    slug: "store-long",
    name: longName,
    description: "긴 소개",
    address: longAddress,
    hours: "오전 10시\n오후 8시",
    phone: "010-1111-2222",
    image_path: brokenPhoto,
    sort_order: 3,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "store-local",
    name: "동성로 2호점",
    description: "로컬 외관",
    address: "대구 중구 동성로 2길 20",
    hours: "매일 12:00~20:00",
    phone: "053-000-2222",
    image_path: null,
    sort_order: 2,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "store-photo",
    name: "사진우선 1호점",
    description: "관리자 사진",
    address: "대구 중구 동성로 1길 10",
    hours: "월~금 11:00~21:00",
    phone: "053-000-1111",
    image_path: dbPhoto,
    sort_order: 1,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "store-first",
    name: "먼저 나오는 매장",
    description: "첫째 줄\n둘째 줄",
    address: "",
    hours: "",
    phone: "",
    image_path: null,
    sort_order: 0,
    is_active: true,
  },
];
const counselor = (slug, name, storeSlug, extra = {}) => ({
  slug,
  name,
  field: "saju",
  fields: ["saju"],
  tags: ["사주"],
  careers: [],
  intro: "",
  description: "",
  image_path: null,
  is_recommended: false,
  is_new: false,
  is_active: true,
  approval_status: "approved",
  sort_order: 1,
  stores: { name: storeSlug, slug: storeSlug },
  consult_products: [],
  ...extra,
});
const counselors = [
  counselor("counselor-one", "상담사 하나", "store-photo"),
  counselor("counselor-two", "상담사 둘", "store-local", { sort_order: 2 }),
  counselor("counselor-hidden", "숨은상담사", "store-hidden"),
  counselor("counselor-pending", "대기상담사", "store-photo", {
    approval_status: "pending",
  }),
  counselor("counselor-inactive", "비활성상담사", "store-photo", {
    is_active: false,
  }),
];
const calls = [];
let mode = "ready";
const json = (res, body, status = 200) => {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
const sortRows = (rows, orderValue) => {
  if (!orderValue) return rows;
  const keys = orderValue.split(",").map((part) => {
    const [key, direction] = part.split(".");
    return { key, direction };
  });
  return [...rows].sort((a, b) => {
    for (const { key, direction } of keys) {
      if (a[key] === b[key]) continue;
      if (a[key] > b[key]) return direction === "desc" ? -1 : 1;
      return direction === "desc" ? 1 : -1;
    }
    return 0;
  });
};
const applyEq = (rows, params) =>
  rows.filter((row) => {
    for (const [key, value] of params.entries()) {
      if (!String(value).startsWith("eq.")) continue;
      if (String(row[key]) !== String(value).slice(3)) return false;
    }
    return true;
  });
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  calls.push(`${req.method} ${url.pathname}${url.search}`);
  if (req.method === "OPTIONS") {
    json(res, undefined, 204);
    return;
  }
  if (url.pathname === "/control") {
    mode = JSON.parse(await readBody(req)).mode;
    json(res, { mode });
    return;
  }
  req.resume();
  if (url.pathname.startsWith("/auth/")) {
    json(res, { message: "no session" }, 401);
    return;
  }
  if (url.pathname.includes("/storage/")) {
    if (url.pathname.endsWith(dbPhoto)) {
      res.writeHead(200, {
        "content-type": "image/png",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      });
      res.end(png);
      return;
    }
    json(res, { message: "missing" }, 404);
    return;
  }
  const table = url.pathname.split("/").at(-1);
  const object = req.headers.accept?.includes("object+json");
  if (table === "stores") {
    if (mode === "stores-error") {
      json(res, { message: "fixture failure", code: "XX000" }, 500);
      return;
    }
    if (mode === "empty") {
      json(res, []);
      return;
    }
    const selected = sortRows(
      applyEq(stores, url.searchParams),
      url.searchParams.get("order"),
    );
    json(res, selected);
    return;
  }
  if (table === "counselors") {
    if (mode === "counselors-error") {
      json(res, { message: "fixture failure", code: "XX000" }, 500);
      return;
    }
    const selected = sortRows(
      applyEq(counselors, url.searchParams),
      url.searchParams.get("order"),
    );
    json(res, object ? selected[0] || null : selected);
    return;
  }
  json(res, object ? null : []);
});
await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fakeUrl = `http://127.0.0.1:${fixture.address().port}`;
const port = 4333;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: fakeUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
  SUPABASE_SECRET_KEY: "fixture-server-key",
};
let app;
let chrome;
try {
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  if (build.status !== 0) {
    writeFileSync(
      join(outDir, "build.log"),
      `${build.stdout || ""}\n${build.stderr || ""}`,
    );
  }
  assert.equal(build.status, 0, "next build failed");
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(base)).ok;
    } catch {
      return false;
    }
  }, "production server");
  chrome = await browser();
  const evaluate = (expression) => chrome.evaluate(expression);
  const go = async (path) => {
    await chrome.go(`${base}${path}`);
  };
  const shot = async (name, full = false) => {
    const { data } = await chrome.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: full,
    });
    writeFileSync(join(outDir, name), Buffer.from(data, "base64"));
  };
  const emulate = async ({ width, height, fine }) => {
    await chrome.call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: !fine,
    });
    await chrome.call("Emulation.setTouchEmulationEnabled", {
      enabled: !fine,
      maxTouchPoints: fine ? 1 : 5,
    });
    await chrome.call("Emulation.setEmulatedMedia", {
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
  };
  const setMode = async (next) => {
    const response = await fetch(`${fakeUrl}/control`, {
      method: "POST",
      body: JSON.stringify({ mode: next }),
    });
    assert.equal(response.ok, true);
  };
  const slugs = () =>
    evaluate(
      `[...document.querySelectorAll("[data-store-slug]")].map((node) => node.getAttribute("data-store-slug"))`,
    );
  const card = (slug) =>
    `document.querySelector('[data-store-slug="${slug}"]')`;
  const inside = (slug, selector) =>
    `document.querySelector('[data-store-slug="${slug}"] ${selector}')`;

  await emulate({ width: 390, height: 844, fine: false });
  await go("/stores");
  await until(
    () => evaluate(`document.body.innerText.includes("먼저 나오는 매장")`),
    "stores",
  );
  assert.deepEqual(await slugs(), [
    "store-first",
    "store-photo",
    "store-local",
    "store-long",
    "store-placeholder",
    "store-ambiguous",
  ]);
  assert.equal(
    await evaluate(`document.body.innerText.includes("숨긴매장")`),
    false,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("대기상담사")`),
    false,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("비활성상담사")`),
    false,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("숨은상담사")`),
    false,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("새벽 2시")`),
    false,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("화요일 휴무")`),
    false,
  );
  assert.equal(
    calls.some(
      (item) => item.includes("/stores?") && item.includes("is_active=eq.true"),
    ),
    true,
  );
  assert.equal(
    calls.some(
      (item) =>
        item.includes("/counselors?") &&
        item.includes("approval_status=eq.approved") &&
        item.includes("is_active=eq.true"),
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `${card("store-first")}.innerText.includes("첫째 줄") && ${card("store-first")}.innerText.includes("둘째 줄")`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `${card("store-long")}.innerText.includes("오전 10시") && ${card("store-long")}.innerText.includes("오후 8시") && ${card("store-long")}.innerText.includes(${JSON.stringify(longName)}) && ${card("store-long")}.innerText.includes(${JSON.stringify(longAddress)})`,
    ),
    true,
  );
  assert.equal(
    await evaluate(`(() => {
      const photo = ${card("store-photo")};
      const local = ${card("store-local")};
      return photo.innerText.includes("상담사 하나") && !photo.innerText.includes("상담사 둘") && local.innerText.includes("상담사 둘") && !local.innerText.includes("상담사 하나");
    })()`),
    true,
  );
  assert.equal(
    await evaluate(
      `${inside("store-photo", 'a[href="/consult/counselor-one"]')} !== null`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `${inside("store-photo", 'a[href^="tel:"]')}.getAttribute("href")`,
    ),
    "tel:0530001111",
  );
  assert.equal(
    await evaluate(
      `${inside("store-local", 'a[href^="tel:"]')}.getAttribute("href")`,
    ),
    "tel:0530002222",
  );
  assert.equal(
    await evaluate(
      `${inside("store-first", 'a[href^="tel:"]')}.getAttribute("href")`,
    ),
    "tel:010-0000-0000",
  );
  const photoAddress = "대구 중구 동성로 1길 10";
  const localAddress = "대구 중구 동성로 2길 20";
  assert.equal(
    await evaluate(
      `${inside("store-photo", 'a[href*="map.naver.com"]')}.getAttribute("href")`,
    ),
    `https://map.naver.com/p/search/${encodeURIComponent(photoAddress)}`,
  );
  assert.equal(
    await evaluate(`(() => {
      const link = ${card("store-local")}.querySelector('a[href*="map.naver.com"]');
      return link.getAttribute("target") + "|" + link.getAttribute("rel") + "|" + link.getAttribute("href");
    })()`),
    `_blank|noopener noreferrer|https://map.naver.com/p/search/${encodeURIComponent(localAddress)}`,
  );
  assert.equal(
    await evaluate(
      `${inside("store-long", 'a[href*="map.naver.com"]')}.getAttribute("href")`,
    ),
    `https://map.naver.com/p/search/${encodeURIComponent(longAddress)}`,
  );
  assert.equal(
    await evaluate(
      `${inside("store-first", 'a[href*="map.naver.com"]')} === null && ${inside("store-placeholder", 'a[href*="map.naver.com"]')} === null && ${inside("store-ambiguous", 'a[href*="map.naver.com"]')} === null`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `${card("store-placeholder")}.innerText.includes("[상세 주소 확인 필요]")`,
    ),
    true,
  );
  assert.equal(
    await evaluate(`${card("store-first")}.getAttribute("data-photo-source")`),
    "empty",
  );
  assert.equal(
    await evaluate(
      `${card("store-ambiguous")}.getAttribute("data-photo-source")`,
    ),
    "empty",
  );
  assert.equal(
    await evaluate(`${card("store-photo")}.getAttribute("data-photo-source")`),
    "db",
  );
  assert.equal(
    await evaluate(`${card("store-local")}.getAttribute("data-photo-source")`),
    "local",
  );
  await until(
    () =>
      evaluate(
        `(() => { const img = ${inside("store-photo", "[data-store-photo]")}; return !!img && img.naturalWidth === 1 && !img.src.includes("store1.jpg"); })()`,
      ),
    "db photo",
  );
  await until(
    () =>
      evaluate(
        `(() => { const img = ${inside("store-local", "[data-store-photo]")}; return !!img && img.src.includes("store2.jpg") && !img.src.includes("store1.jpg") && img.naturalWidth > 1; })()`,
      ),
    "local exterior",
  );
  assert.equal(
    await evaluate(
      `${inside("store-first", '[aria-label="매장 사진 자리"]')} !== null`,
    ),
    true,
  );
  await until(
    () =>
      evaluate(
        `!!${inside("store-long", '[aria-label="매장 사진 자리"]')} && !${inside("store-long", "[data-store-photo]")}`,
      ),
    "broken photo",
  );
  assert.equal(
    await evaluate(
      `getComputedStyle(${inside("store-photo", "[data-store-photo-frame]")}).height`,
    ),
    "200px",
  );
  assert.equal(
    await evaluate(`(() => {
      const images = [...document.querySelectorAll("[data-store-gallery] img")];
      return images.map((img) => img.alt).join("|");
    })()`),
    "상담 부스|타로 매트|상담사 번호 간판",
  );
  assert.equal(
    await evaluate(`(() => {
      const images = [...document.querySelectorAll("[data-store-gallery] img")];
      return images.every((img) => !img.src.includes("store1") && !img.src.includes("store2")) && document.querySelectorAll("[data-store-gallery] a").length === 0;
    })()`),
    true,
  );
  const thumb = await evaluate(`(() => {
    const box = document.querySelector("[data-store-gallery] .relative").getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  })()`);
  assert.deepEqual(thumb, { width: 240, height: 150 });
  const prices = await evaluate(`(() => {
    const section = document.querySelector("#store-prices");
    const color = getComputedStyle(section.querySelector('[data-price-key="naming"] span:last-child')).color;
    return {
      text: section.innerText,
      links: section.querySelectorAll("a").length,
      naming: !!section.querySelector('[data-price-key="naming"]'),
      color,
    };
  })()`);
  assert.equal(prices.links, 0);
  assert.equal(prices.naming, true);
  assert.equal(prices.color, "rgb(194, 37, 92)");
  assert.equal(prices.text.includes("매장 가격 기준"), true);
  assert.equal(prices.text.includes("1호점 가격판 기준"), true);
  assert.equal(
    prices.text.includes(
      "확인 중인 참고 가격입니다. 방문 전 매장에 최종 요금을 문의해 주세요.",
    ),
    true,
  );
  assert.equal(
    prices.text.includes("제공된 동성로 1호점 가격판 판독 값"),
    true,
  );
  assert.equal(prices.text.includes("홈과 매장 화면에 보여줄 때는"), false);
  assert.equal(prices.text.includes("참고 가격임을 함께 표시한다"), false);
  assert.equal(prices.text.includes("consult_products"), false);
  assert.equal(prices.text.includes("결제 금액으로 쓰지 않는다"), false);
  assert.equal(prices.text.includes("일반 30,000원"), true);
  assert.equal(prices.text.includes("중고등 20,000원"), true);
  assert.equal(prices.text.includes("5,000원 (일반·중고등)"), true);
  assert.equal(prices.text.includes("1인 10,000원"), true);
  assert.equal(prices.text.includes("커플 15,000원"), true);
  assert.equal(prices.text.includes("작명"), true);
  assert.equal(prices.text.includes("300,000원"), true);
  assert.equal(
    await evaluate(
      `document.querySelector("[data-consult-cta]").getAttribute("href")`,
    ),
    "/consult",
  );
  assert.equal(
    await evaluate(`(() => {
      const cards = [...document.querySelectorAll("[data-store-slug]")];
      return cards.every((card) => card.scrollWidth <= card.clientWidth + 1);
    })()`),
    true,
  );

  const drag = async () => {
    await evaluate(
      `document.querySelector("[data-store-gallery]").scrollIntoView({ block: "center" })`,
    );
    await delay(100);
    const before = await evaluate(`(() => {
      const image = document.querySelectorAll("[data-store-gallery] .relative")[2];
      return Math.round(image.getBoundingClientRect().left);
    })()`);
    const point = await evaluate(`(() => {
      const box = document.querySelector("[data-store-gallery]").getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    })()`);
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (const step of [40, 80, 140, 200]) {
      await chrome.call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: point.x - step,
        y: point.y,
        button: "left",
        buttons: 1,
      });
    }
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x - 200,
      y: point.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await delay(300);
    const after = await evaluate(`(() => {
      const image = document.querySelectorAll("[data-store-gallery] .relative")[2];
      return {
        left: Math.round(image.getBoundingClientRect().left),
        path: location.pathname,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    })()`);
    assert.equal(after.path, "/stores");
    assert.equal(after.overflow, false);
    assert.ok(after.left < before - 20, JSON.stringify({ before, after }));
  };
  await drag();

  await go("/stores#store-prices");
  await until(
    () => evaluate(`location.hash === "#store-prices"`),
    "price anchor",
  );
  await delay(300);
  const anchor = await evaluate(`(() => {
    const section = document.querySelector("#store-prices");
    return {
      top: Math.round(section.getBoundingClientRect().top),
      naming: !!section.querySelector('[data-price-key="naming"]'),
    };
  })()`);
  assert.equal(anchor.naming, true);
  assert.ok(anchor.top < 120 && anchor.top > -40, JSON.stringify(anchor));

  await emulate({ width: 390, height: 844, fine: false });
  await go("/stores");
  await until(
    () => evaluate(`!!document.querySelector("[data-store-list]")`),
    "list",
  );
  let focused = null;
  for (let index = 0; index < 40; index += 1) {
    await chrome.call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await chrome.call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    focused = await evaluate(`(() => {
      const node = document.activeElement;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        text: (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 40),
        width: box.width,
        height: box.height,
        outline: style.outlineStyle,
      };
    })()`);
    if (
      focused.text.includes("길찾기") &&
      focused.height >= 44 &&
      focused.outline !== "none"
    )
      break;
  }
  assert.ok(focused?.text.includes("길찾기"), JSON.stringify(focused));
  assert.ok(
    focused.height >= 44 && focused.width >= 44,
    JSON.stringify(focused),
  );
  assert.notEqual(focused.outline, "none");

  const viewports = [
    ["phone-360.png", 360, 844, false],
    ["phone-390.png", 390, 844, false],
    ["phone-430.png", 430, 844, false],
    ["tablet-768.png", 768, 1024, false],
    ["tablet-1024.png", 1024, 1366, false],
    ["pc-1280.png", 1280, 900, true],
  ];
  const results = [];
  for (const [name, width, height, fine] of viewports) {
    await emulate({ width, height, fine });
    await go("/stores");
    await until(
      () => evaluate(`document.body.innerText.includes("가격표")`),
      name,
    );
    await evaluate("window.scrollTo(0, 0)");
    const measured = await evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      const bar = document.querySelector("[data-app-bar]");
      const page = document.querySelector("[data-store-page]");
      const pageStyle = getComputedStyle(page);
      const list = document.querySelector("[data-store-list]");
      const columns = getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length;
      const gallery = document.querySelector("[data-store-gallery]");
      const track = gallery.querySelector(".flex");
      const price = document.querySelector("#store-prices");
      const overflows = (node) => !!node && node.scrollWidth > node.clientWidth + 1;
      return {
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        app: Math.round(shell.getBoundingClientRect().width),
        bar: Math.round(bar.getBoundingClientRect().width),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        columns,
        title: getComputedStyle(document.querySelector("h1")).fontSize,
        body: getComputedStyle(document.body).fontSize,
        galleryWider: track.scrollWidth > gallery.clientWidth + 1,
        paddingLeft: Math.round(parseFloat(pageStyle.paddingLeft)),
        paddingRight: Math.round(parseFloat(pageStyle.paddingRight)),
        cardOverflow: [...document.querySelectorAll("[data-store-slug]")].some(overflows),
        photoOverflow: [...document.querySelectorAll("[data-store-photo-frame]")].some(overflows),
        priceOverflow: overflows(price),
        galleryFrameOverflow: gallery.getBoundingClientRect().right > shell.getBoundingClientRect().right + 1,
      };
    })()`);
    await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight)`);
    await delay(100);
    const covered = await evaluate(`(() => {
      const cta = document.querySelector("[data-consult-cta]");
      const bar = document.querySelector("[data-app-bar]");
      return cta.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top + 1;
    })()`);
    await evaluate("window.scrollTo(0, 0)");
    await shot(name, true);
    if (name === "phone-390.png") await shot("390-compare.png", true);
    results.push({ name, ...measured, covered });
    assert.equal(measured.fine, fine, name);
    assert.equal(measured.overflow, false, name);
    assert.equal(measured.title, "26px", name);
    assert.equal(measured.body, "15px", name);
    assert.equal(measured.app, measured.bar, name);
    assert.equal(covered, true, name);
    const expectedPadding = !fine && width >= 768 ? 24 : 16;
    assert.equal(measured.paddingLeft, expectedPadding, name);
    assert.equal(measured.paddingRight, expectedPadding, name);
    assert.equal(measured.cardOverflow, false, name);
    assert.equal(measured.photoOverflow, false, name);
    assert.equal(measured.priceOverflow, false, name);
    assert.equal(measured.galleryFrameOverflow, false, name);
    if (fine) {
      assert.equal(measured.app, 560, name);
      assert.equal(measured.columns, 1, name);
    } else if (width >= 768) {
      assert.equal(measured.app, width, name);
      assert.equal(measured.columns, 2, name);
    } else {
      assert.equal(measured.app, width, name);
      assert.equal(measured.columns, 1, name);
      assert.equal(measured.galleryWider, true, name);
    }
  }
  await emulate({ width: 1280, height: 900, fine: true });
  await go("/stores");
  await until(
    () => evaluate(`!!document.querySelector("[data-store-gallery]")`),
    "pc gallery",
  );
  await drag();

  await evaluate(`document.querySelector("[data-consult-cta]").click()`);
  await until(
    () => evaluate(`location.pathname === "/consult"`),
    "consult link",
  );
  await go("/stores");
  await until(
    () =>
      evaluate(`!!document.querySelector('a[href="/consult/counselor-one"]')`),
    "back",
  );
  await evaluate(
    `document.querySelector('a[href="/consult/counselor-one"]').click()`,
  );
  await until(
    () => evaluate(`location.pathname === "/consult/counselor-one"`),
    "counselor detail",
  );

  await setMode("empty");
  await go("/stores");
  await until(
    () =>
      evaluate(`document.body.innerText.includes("공개된 매장이 없습니다.")`),
    "empty",
  );
  assert.equal(
    await evaluate(`document.querySelector("[data-store-slug]") === null`),
    true,
  );
  assert.equal(
    await evaluate(`!!document.querySelector("#store-prices")`),
    true,
  );
  await shot("empty-390.png", true);

  await setMode("stores-error");
  await go("/stores");
  await until(
    () =>
      evaluate(
        `document.body.innerText.includes("매장 정보를 불러오지 못했습니다.")`,
      ),
    "store error",
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("먼저 나오는 매장")`),
    false,
  );
  assert.equal(
    await evaluate(`!!document.querySelector('a[href="/stores"]')`),
    true,
  );
  await shot("error-390.png", true);

  await setMode("counselors-error");
  await go("/stores");
  await until(
    () =>
      evaluate(
        `document.body.innerText.includes("상담사 연결을 불러오지 못했습니다.")`,
      ),
    "counselor error",
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("먼저 나오는 매장")`),
    true,
  );
  assert.equal(
    await evaluate(`document.body.innerText.includes("상담사 하나")`),
    false,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-store-slug="store-photo"] a[href^="tel:"]').getAttribute("href")`,
    ),
    "tel:0530001111",
  );

  writeFileSync(
    join(outDir, "measurements.json"),
    JSON.stringify(results, null, 2),
  );
  console.log("PASS design v2 stores browser");
} finally {
  if (chrome) await chrome.close();
  stop(app);
  await new Promise((done) => fixture.close(done));
}
