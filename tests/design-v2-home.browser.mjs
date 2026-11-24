// Isolated fixture only. No real Supabase credentials or reservation writes.
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

const outDir = join("tmp", "design-v2-home");
mkdirSync(outDir, { recursive: true });
const longId = "11111111-1111-4111-8111-111111111111";
const plainId = "22222222-2222-4222-8222-222222222222";
const freshId = "33333333-3333-4333-8333-333333333333";
const failId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hiddenId = "44444444-4444-4444-8444-444444444444";
const pendingId = "55555555-5555-4555-8555-555555555555";
const cheapProduct = "66666666-6666-4666-8666-666666666666";
const costlyProduct = "77777777-7777-4777-8777-777777777777";
const hiddenProduct = "88888888-8888-4888-8888-888888888888";
const pinnedId = "99999999-9999-4999-8999-999999999991";
const laterId = "99999999-9999-4999-8999-999999999992";
const privateId = "99999999-9999-4999-8999-999999999993";
const longName = `긴이름${"가".repeat(27)}`;
const longCareer = `경력원문${"가".repeat(196)}`;
const longTopic = "가나다라마바사아자차카타파하가나다라마바";
const longNotice = `공지제목${"나".repeat(40)}`;
const privateTitle = "비공개공지노출금지";
const popupBody = "팝업본문확인용문장";
const storeAddress = "대구 테스트 상세주소";
const storePhone = "010-9999-0000";
assert.equal([...longName].length, 30);
assert.equal([...longCareer].length, 200);
assert.equal([...longTopic].length, 20);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const counselors = [
  {
    id: longId,
    slug: "long-name",
    name: longName,
    field: "saju",
    fields: ["saju", "tarot"],
    tags: [longTopic],
    careers: [`  ${longCareer}  `],
    intro: "긴 이름 소개",
    description: "긴 이름 설명",
    image_path: `counselors/${longId}.jpg`,
    is_recommended: true,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 1,
    stores: { name: "동성로 테스트 매장", slug: "store-one" },
    consult_products: [
      {
        id: costlyProduct,
        name: "비싼 상담",
        minutes: 40,
        price: 30000,
        is_active: true,
      },
      {
        id: cheapProduct,
        name: "짧은 상담",
        minutes: 15,
        price: 5000,
        is_active: true,
      },
      {
        id: hiddenProduct,
        name: "비공개상품이름",
        minutes: 10,
        price: 1000,
        is_active: false,
      },
    ],
  },
  {
    id: plainId,
    slug: "no-photo",
    name: "사진없음",
    field: "tarot",
    fields: ["tarot"],
    tags: ["연애"],
    careers: ["   "],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: true,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 2,
    stores: null,
    consult_products: [],
  },
  {
    id: freshId,
    slug: "new-one",
    name: "신규상담",
    field: "saju",
    fields: ["saju"],
    tags: ["작명주제"],
    careers: [],
    intro: "신규 소개",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: true,
    is_active: true,
    approval_status: "approved",
    sort_order: 3,
    stores: { name: "동성로 테스트 매장", slug: "store-one" },
    consult_products: [
      {
        id: "12121212-1212-4212-8212-121212121212",
        name: "사주 30분",
        minutes: 30,
        price: 20000,
        is_active: true,
      },
    ],
  },
  {
    id: failId,
    slug: "photo-fail",
    name: "사진실패",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: ["타로 상담 5년"],
    intro: "",
    description: "",
    image_path: `counselors/${failId}.jpg`,
    is_recommended: true,
    is_new: true,
    is_active: true,
    approval_status: "approved",
    sort_order: 4,
    stores: { name: "동성로 테스트 매장", slug: "store-one" },
    consult_products: [
      {
        id: "13131313-1313-4313-8313-131313131313",
        name: "사진 상담",
        minutes: 20,
        price: 12000,
        is_active: true,
      },
    ],
  },
  {
    id: hiddenId,
    slug: "hidden",
    name: "숨은상담사",
    field: "saju",
    fields: ["saju"],
    tags: [],
    careers: ["숨은 경력"],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: true,
    is_new: true,
    is_active: false,
    approval_status: "approved",
    sort_order: 5,
    stores: null,
    consult_products: [],
  },
  {
    id: pendingId,
    slug: "pending",
    name: "미승인상담사",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: ["미승인 경력"],
    intro: "",
    description: "",
    image_path: `counselors/${pendingId}.jpg`,
    is_recommended: true,
    is_new: true,
    is_active: true,
    approval_status: "pending",
    sort_order: 6,
    stores: null,
    consult_products: [],
  },
];
const notices = [
  {
    id: pinnedId,
    title: longNotice,
    body: popupBody,
    image_path: null,
    image_alt: null,
    is_pinned: true,
    is_published: true,
    is_popup: true,
    published_at: "2026-11-01T00:00:00+09:00",
  },
  {
    id: laterId,
    title: "나중 일반 공지",
    body: "나중 공지 본문",
    image_path: null,
    image_alt: null,
    is_pinned: false,
    is_published: true,
    is_popup: false,
    published_at: "2026-11-16T00:00:00+09:00",
  },
  {
    id: privateId,
    title: privateTitle,
    body: "비공개 본문",
    image_path: null,
    image_alt: null,
    is_pinned: true,
    is_published: false,
    is_popup: true,
    published_at: "2026-11-17T00:00:00+09:00",
  },
];
let mode = "normal";
const json = (res, body, status = 200) => {
  const list = Array.isArray(body) ? body : body ? [body] : [];
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
    "content-type": "application/json",
    "content-range": list.length
      ? `0-${list.length - 1}/${list.length}`
      : "*/0",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const eq = (url, key) => url.searchParams.get(key)?.replace(/^eq\./, "");
const publicProducts = (products) =>
  products.flatMap((item) =>
    item.is_active
      ? [
          {
            id: item.id,
            name: item.name,
            minutes: item.minutes,
            price: item.price,
          },
        ]
      : [],
  );
const counselorRows = (url) => {
  if (mode === "empty") return [];
  return counselors
    .filter((item) => {
      const active = eq(url, "is_active");
      const approval = eq(url, "approval_status");
      const slug = eq(url, "slug");
      if (active && String(item.is_active) !== active) return false;
      if (approval && item.approval_status !== approval) return false;
      if (slug && item.slug !== slug) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      image_path: mode === "nophoto" ? null : item.image_path,
      consult_products: publicProducts(item.consult_products),
    }));
};
const noticeRows = (url) => {
  if (mode === "notice-empty") return [];
  let rows = notices.filter((item) => {
    const published = eq(url, "is_published");
    const popup = eq(url, "is_popup");
    const id = eq(url, "id");
    if (published && String(item.is_published) !== published) return false;
    if (popup && String(item.is_popup) !== popup) return false;
    if (id && item.id !== id) return false;
    return true;
  });
  const order = url.searchParams.get("order") || "";
  const keys = order
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [key, direction] = part.split(".");
      return { key, desc: direction !== "asc" };
    });
  if (keys.length) {
    rows = [...rows].sort((left, right) => {
      for (const key of keys) {
        const av = left[key.key];
        const bv = right[key.key];
        if (av === bv) continue;
        const diff =
          typeof av === "boolean"
            ? Number(av) - Number(bv)
            : String(av).localeCompare(String(bv));
        return key.desc ? -diff : diff;
      }
      return 0;
    });
  }
  return rows;
};
const fixture = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  if (url.pathname === "/fixture-control") {
    mode = url.searchParams.get("mode") || "normal";
    json(res, { mode });
    return;
  }
  if (req.method === "OPTIONS") {
    json(res, undefined, 204);
    return;
  }
  req.resume();
  if (url.pathname.startsWith("/auth/")) {
    json(res, { message: "no session" }, 401);
    return;
  }
  if (url.pathname.includes("/storage/")) {
    if (url.pathname.includes(longId)) {
      res.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "image/png",
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
  if (table === "notices" && mode === "notice-fail") {
    json(res, { message: "notice failed" }, 500);
    return;
  }
  if (table === "counselors") {
    const rows = counselorRows(url);
    json(res, object ? rows[0] || null : rows);
    return;
  }
  if (table === "notices") {
    const rows = noticeRows(url);
    json(res, object ? rows[0] || null : rows);
    return;
  }
  if (table === "stores") {
    json(res, [
      {
        slug: "store-one",
        name: "동성로 테스트 매장",
        address: storeAddress,
        hours: "테스트 영업시간",
        description: "테스트 매장 설명",
        phone: storePhone,
        image_path: null,
        is_active: true,
        sort_order: 1,
      },
    ]);
    return;
  }
  json(res, object ? null : []);
});

await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fakeUrl = `http://127.0.0.1:${fixture.address().port}`;
const port = 4332;
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
  const runBuild = () =>
    spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
      env,
      encoding: "utf8",
      windowsHide: true,
    });
  let build = runBuild();
  if (
    build.status !== 0 &&
    `${build.stdout || ""}\n${build.stderr || ""}`.includes(
      "SecurityFatalError",
    )
  ) {
    build = runBuild();
  }
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
  const shot = async (name) => {
    const clip = await evaluate(`(() => ({
      width: Math.ceil(document.documentElement.clientWidth),
      height: Math.ceil(Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      )),
    }))()`);
    const { data } = await chrome.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, ...clip, scale: 1 },
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
  const waitText = async (text) => {
    await until(
      () =>
        evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`),
      text,
    );
  };
  const setMode = async (next) => {
    const response = await fetch(`${fakeUrl}/fixture-control?mode=${next}`);
    assert.equal(response.ok, true);
  };
  const closePopup = async () => {
    const open = await evaluate(`!!document.querySelector("dialog[open]")`);
    if (!open) return;
    await chrome.button("닫기");
    await until(
      () =>
        evaluate(
          `!document.querySelector("dialog[open]") && document.activeElement.id === "home-start"`,
        ),
      "popup closed",
    );
  };
  const drag = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" })`,
    );
    await delay(150);
    const before = await evaluate(`(() => {
      const row = document.querySelector(${JSON.stringify(selector)});
      const box = row.getBoundingClientRect();
      const card = row.querySelector("[data-home-recommend-card], [data-home-banner-slide]");
      return {
        x: box.left + box.width / 2,
        y: box.top + Math.min(box.height / 2, 80),
        left: Math.round(card.getBoundingClientRect().left),
      };
    })()`);
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: before.x,
      y: before.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (const step of [30, 80, 140, 220]) {
      await chrome.call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: before.x - step,
        y: before.y,
        button: "left",
        buttons: 1,
      });
      await delay(30);
    }
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: before.x - 220,
      y: before.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await delay(400);
    return before;
  };
  const clickAt = async (selector) => {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center" })`,
    );
    await delay(150);
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      const box = node.getBoundingClientRect();
      return {
        x: Math.round(box.left + box.width / 2),
        y: Math.round(box.top + box.height / 2),
      };
    })()`);
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await chrome.call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    return point;
  };

  await emulate({ width: 390, height: 844, fine: false });
  await go("/");
  await until(
    () =>
      evaluate(
        `!!document.querySelector("dialog[open]") && document.body.innerText.includes(${JSON.stringify(longNotice)}) && document.body.innerText.includes(${JSON.stringify(popupBody)})`,
      ),
    "home popup",
  );
  assert.equal(
    await evaluate(
      `document.activeElement.closest("dialog") === document.querySelector("dialog[open]")`,
    ),
    true,
  );
  await closePopup();
  assert.equal(
    await evaluate(
      `document.body.innerText.includes(${JSON.stringify(popupBody)})`,
    ),
    false,
  );
  await waitText("추천 선생님");
  await waitText("매장 상담 메뉴");
  await waitText(longName);
  await until(
    () =>
      evaluate(
        `document.querySelector("[data-home-banner-career]")?.textContent.includes(${JSON.stringify(longCareer.trim())})`,
      ),
    "banner career text",
  );
  await waitText("1호점 가격판을 바탕으로 한 확인 중인 매장 참고 가격입니다.");
  const home = await evaluate(`(() => {
    const text = document.body.innerText;
    const banner = document.querySelector("[data-home-banner]");
    const copy = banner.querySelector("[data-home-banner-copy]").getBoundingClientRect();
    const photo = banner.querySelector("[data-home-banner-photo]").getBoundingClientRect();
    const overlaps = copy.right > photo.left + 1 && copy.bottom > photo.top && copy.top < photo.bottom;
    return {
      text,
      index: banner.querySelector("[data-home-banner-index]").textContent,
      slides: banner.querySelectorAll("[data-home-banner-slide]").length,
      fallback: !!document.querySelector("[data-home-banner-fallback]"),
      noPhotoInBanner: !!banner.querySelector('[data-home-banner-slide="no-photo"]'),
      categories: [...document.querySelectorAll("[data-home-category]")].map((node) => [node.getAttribute("data-home-category"), node.getAttribute("href")]),
      band: document.querySelector("[data-home-store-band]")?.getAttribute("href"),
      bandImage: document.querySelector("[data-home-store-band] img")?.getAttribute("src") || "",
      menu: [...document.querySelectorAll("[data-home-menu-key]")].map((node) => node.getAttribute("data-home-menu-key")),
      recommend: [...document.querySelectorAll("[data-home-recommend-card]")].map((node) => node.getAttribute("data-home-recommend-card")),
      listed: [...document.querySelectorAll("[data-home-list-item]")].map((node) => node.getAttribute("data-home-list-item")),
      notice: document.querySelector("[data-home-notice]")?.getAttribute("href"),
      noticeStatus: document.querySelector("[data-home-notice]")?.getAttribute("data-home-notice"),
      reviews: !!document.querySelector('[data-home-directory] a[href="/reviews"]'),
      footer: document.querySelector("[data-home-footer]")?.innerText || "",
      bannerHeight: banner.querySelector("[data-home-banner-slide]").getBoundingClientRect().height,
      overlaps,
      failedPlaceholder: document.querySelector('[data-home-banner-slide="photo-fail"] [aria-label="상담사 사진 자리"]') ? false : null,
      plainPlaceholder: !!document.querySelector('[data-home-recommend-card="no-photo"] [aria-label="상담사 사진 자리"]'),
      loadedPhoto: !!document.querySelector('[data-home-banner-slide="long-name"] [data-counselor-photo]'),
      noProductBannerCta: document.querySelector('[data-home-banner-reserve="no-photo"]')?.textContent.trim(),
      noProductDirectoryCta: document.querySelector('[data-home-list-item="no-photo"] [data-home-booking-unavailable]')?.textContent.trim(),
    };
  })()`);
  assert.equal(home.index.replace(/\s/g, ""), "1/3");
  assert.equal(home.slides, 3);
  assert.equal(home.fallback, false);
  assert.equal(home.noPhotoInBanner, true);
  assert.equal(home.overlaps, false);
  assert.ok(home.bannerHeight >= 228);
  assert.equal(home.loadedPhoto, true);
  assert.equal(home.plainPlaceholder, true);
  assert.equal(home.noProductBannerCta, "선생님 소개 보기");
  assert.equal(home.noProductDirectoryCta, "예약 준비 중");
  assert.deepEqual(home.categories, [
    ["all", "/consult"],
    ["tarot", "/consult?type=tarot"],
    ["saju", "/consult?type=saju"],
    ["naming", "/stores#store-prices"],
    ["store", "/stores"],
  ]);
  assert.equal(home.band, "/stores");
  assert.equal(home.bandImage.includes("store1.jpg"), true);
  assert.deepEqual(home.menu, [
    "saju",
    "compatibility-two",
    "tarot-one-shuffle",
    "saju-tarot-one-shuffle",
    "yearly-fortune",
    "naming",
  ]);
  assert.deepEqual(home.recommend, ["long-name", "no-photo", "photo-fail"]);
  assert.deepEqual(home.listed, ["long-name", "no-photo", "photo-fail"]);
  assert.equal(home.notice, `/notices/${pinnedId}`);
  assert.equal(home.noticeStatus, "ready");
  assert.equal(home.reviews, true);
  assert.equal(home.footer.includes("쪽집게천사 운명나라"), true);
  assert.equal(home.footer.includes("1호점 · 2호점 · 3호점"), true);
  assert.equal(home.footer.includes("[대표자명]"), true);
  assert.equal(home.footer.includes("이용약관"), false);
  for (const absent of [
    privateTitle,
    "나중 일반 공지",
    "숨은상담사",
    "미승인상담사",
    "비공개상품이름",
    "야간반",
    "인기 상담",
    "1번",
    "휴무",
    "전화상담 전용",
    storeAddress,
    storePhone,
    "고객이 확정하기 전의 참고 가격이다",
    "1 / 0",
  ]) {
    assert.equal(home.text.includes(absent), false, absent);
  }
  assert.equal(home.text.includes("짧은 상담 5,000원~"), true);
  assert.equal(home.text.includes("일반 30,000원"), true);
  assert.equal(home.text.includes("중고등 20,000원"), true);
  assert.equal(home.text.includes("2인 40,000원"), true);
  assert.equal(home.text.includes("1셔플 15,000원"), true);
  assert.equal(home.text.includes("300,000원"), true);
  await until(
    () =>
      evaluate(
        `!!document.querySelector('[data-home-banner-slide="photo-fail"] [aria-label="상담사 사진 자리"]')`,
      ),
    "failed photo placeholder",
  );

  const careerAt = () =>
    evaluate(`(() => {
      const metrics = (id) => {
        const slide = document.querySelector('[data-home-banner-slide="' + id + '"]');
        const career = slide.querySelector("[data-home-banner-career]");
        const name = slide.querySelector("[data-home-banner-name]");
        const button = slide.querySelector("[data-home-banner-reserve]");
        const photo = slide.querySelector("[data-home-banner-photo]");
        const pager = document.querySelector("[data-home-banner-index]");
        const lineHeight = parseFloat(getComputedStyle(career).lineHeight);
        const box = career.getBoundingClientRect();
        const hit = (a, b) => a.right > b.left + 1 && a.left < b.right && a.bottom > b.top + 1 && a.top < b.bottom;
        return {
          lines: Math.round(box.height / lineHeight),
          height: Math.round(box.height),
          lineHeight,
          banner: Math.round(slide.getBoundingClientRect().height),
          text: career.textContent,
          nameText: name.textContent,
          nameClipped: name.scrollHeight > name.clientHeight + 1,
          buttonPhoto: hit(button.getBoundingClientRect(), photo.getBoundingClientRect()),
          buttonPager: hit(button.getBoundingClientRect(), pager.getBoundingClientRect()),
          nameButton: hit(name.getBoundingClientRect(), button.getBoundingClientRect()),
        };
      };
      return { long: metrics("long-name"), short: metrics("photo-fail") };
    })()`);
  const careerReport = [];
  const measure = () =>
    evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      const root = document.querySelector("[data-home-root]");
      const shellBox = shell.getBoundingClientRect();
      const skip = (node) => {
        const inSlider = node.closest?.(
          "[data-home-banner], [data-home-recommend]",
        );
        if (!inSlider) return false;
        const track =
          node.classList?.contains("overflow-hidden") &&
          node.classList.contains("cursor-grab") &&
          !node.hasAttribute("data-home-recommend-card") &&
          !node.hasAttribute("data-home-banner-slide");
        const row =
          node.classList?.contains("flex") &&
          node.parentElement?.classList?.contains("overflow-hidden");
        return track || row;
      };
      const overflowers = [...root.querySelectorAll("*")].filter((node) => !skip(node) && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2).slice(0, 5).map((node) => node.tagName + "." + (node.getAttribute("class") || ""));
      const tab = document.querySelector('[aria-label="하단 메뉴"]').getBoundingClientRect();
      window.scrollTo(0, document.documentElement.scrollHeight);
      const footer = document.querySelector("[data-home-footer]").getBoundingClientRect();
      const items = [...document.querySelectorAll("[data-home-list-item]")].map((item) => {
        const photo = item.querySelector("a").getBoundingClientRect();
        const buttons = [...item.querySelectorAll("a")];
        const reserve = (item.querySelector("[data-home-booking-unavailable]") ?? buttons.at(-1)).getBoundingClientRect();
        const intersects = photo.right > reserve.left + 1 && photo.left < reserve.right && photo.bottom > reserve.top && photo.top < reserve.bottom;
        return intersects;
      });
      return {
        app: Math.round(shellBox.width),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        padding: getComputedStyle(root).paddingLeft,
        overflowers,
        footerCovered: footer.bottom > tab.top + 1,
        overlaps: items.some(Boolean),
      };
    })()`);
  for (const viewport of [
    { name: "360", width: 360, height: 800, fine: false },
    { name: "390", width: 390, height: 844, fine: false },
    { name: "430", width: 430, height: 900, fine: false },
    { name: "768", width: 768, height: 1024, fine: false },
    { name: "1024", width: 1024, height: 768, fine: false },
    { name: "1280", width: 1280, height: 800, fine: true },
  ]) {
    await emulate(viewport);
    await waitText("추천 선생님");
    const career = await careerAt();
    careerReport.push({
      viewport: viewport.name,
      longLines: career.long.lines,
      longHeight: career.long.height,
      longBanner: career.long.banner,
      shortLines: career.short.lines,
      shortHeight: career.short.height,
      nameClipped: career.long.nameClipped,
      buttonPhoto: career.long.buttonPhoto,
      buttonPager: career.long.buttonPager,
      nameButton: career.long.nameButton,
    });
    assert.equal(
      career.long.text.includes(longCareer.trim()),
      true,
      viewport.name,
    );
    assert.equal(career.short.text, "타로 상담 5년", viewport.name);
    assert.equal(career.long.nameText.includes(longName), true, viewport.name);
    assert.ok(career.long.banner >= 228, viewport.name);
    const box = await measure();
    await shot(`home-${viewport.name}.png`);
    assert.equal(box.overflow, false, JSON.stringify(box));
    assert.equal(box.footerCovered, false, viewport.name);
    assert.equal(box.overlaps, false, viewport.name);
    assert.deepEqual(box.overflowers, [], viewport.name);
    assert.equal(box.fine, viewport.fine);
    if (viewport.fine) {
      assert.equal(box.app, 560);
      assert.equal(box.padding, "16px");
    } else if (viewport.width >= 768) {
      assert.equal(box.app, viewport.width);
      assert.equal(box.padding, "24px");
    } else {
      assert.equal(box.app, viewport.width);
      assert.equal(box.padding, "16px");
    }
  }
  console.log(`CAREER ${JSON.stringify(careerReport)}`);
  for (const item of careerReport) {
    assert.ok(item.longLines <= 2, JSON.stringify(item));
    assert.ok(item.longHeight <= 42, JSON.stringify(item));
    assert.equal(item.shortLines <= 2, true, JSON.stringify(item));
    assert.equal(item.nameClipped, false, JSON.stringify(item));
    assert.equal(item.buttonPhoto, false, JSON.stringify(item));
    assert.equal(item.buttonPager, false, JSON.stringify(item));
    assert.equal(item.nameButton, false, JSON.stringify(item));
  }

  await emulate({ width: 390, height: 844, fine: false });
  await evaluate("window.scrollTo(0, 0)");
  await clickAt('[data-home-banner-reserve="long-name"]');
  await until(
    () =>
      evaluate(
        `location.pathname === "/consult/long-name" && document.body.innerText.includes("경력") && document.body.innerText.includes(${JSON.stringify(longCareer.trim())}) && document.body.innerText.includes(${JSON.stringify(longName)})`,
      ),
    "long counselor detail",
  );
  await evaluate("history.back()");
  await until(
    () =>
      evaluate(
        `location.pathname === "/" && document.body.innerText.includes("추천 선생님") && !!document.querySelector("[data-home-banner]")`,
      ),
    "home before drag",
  );
  const beforeDrag = await drag("[data-home-banner]");
  assert.equal(await evaluate("location.pathname"), "/");
  await until(
    () =>
      evaluate(
        `document.querySelector("[data-home-banner-index]")?.getAttribute("data-home-banner-index") === "1"`,
      ),
    "banner page",
  );
  const recommendBefore = await evaluate(`(() => {
    const card = document.querySelector('[data-home-recommend-card="photo-fail"]');
    return Math.round(card.getBoundingClientRect().left);
  })()`);
  await drag("[data-home-recommend]");
  const recommendAfter = await evaluate(`(() => {
    const card = document.querySelector('[data-home-recommend-card="photo-fail"]');
    return { left: Math.round(card.getBoundingClientRect().left), path: location.pathname };
  })()`);
  assert.equal(recommendAfter.path, "/");
  assert.ok(
    recommendAfter.left < recommendBefore - 20,
    JSON.stringify({ recommendBefore, recommendAfter, beforeDrag }),
  );

  const directoryTop = await evaluate(`(() => {
    const tabs = document.querySelector("[data-home-directory-tabs]");
    tabs.scrollIntoView({ block: "center" });
    return { top: Math.round(tabs.getBoundingClientRect().top), y: window.scrollY };
  })()`);
  await evaluate(`document.querySelector('[data-home-tab="new"]').click()`);
  await delay(100);
  const afterToggle = await evaluate(`(() => {
    const tabs = document.querySelector("[data-home-directory-tabs]");
    return {
      top: Math.round(tabs.getBoundingClientRect().top),
      y: window.scrollY,
      path: location.pathname,
      items: [...document.querySelectorAll("[data-home-list-item]")].map((node) => node.getAttribute("data-home-list-item")),
      selected: document.querySelector('[data-home-tab="new"]').getAttribute("aria-selected"),
    };
  })()`);
  assert.equal(afterToggle.path, "/");
  assert.equal(afterToggle.selected, "true");
  assert.deepEqual(afterToggle.items, ["new-one", "photo-fail"]);
  assert.ok(Math.abs(afterToggle.top - directoryTop.top) <= 2);
  assert.ok(Math.abs(afterToggle.y - directoryTop.y) <= 2);
  await evaluate(
    `document.querySelector('[data-home-tab="recommended"]').click()`,
  );
  await until(
    () =>
      evaluate(
        `[...document.querySelectorAll("[data-home-list-item]")].map((node) => node.getAttribute("data-home-list-item")).join() === "long-name,no-photo,photo-fail"`,
      ),
    "recommended list",
  );

  await clickAt('[data-home-banner-reserve="photo-fail"]');
  await until(
    () =>
      evaluate(
        `location.pathname === "/consult/photo-fail" && document.body.innerText.includes("선생님 소개") && document.body.innerText.includes("사진실패")`,
      ),
    "counselor detail",
  );
  await evaluate("history.back()");
  await until(
    () =>
      evaluate(
        `location.pathname === "/" && document.body.innerText.includes("추천 선생님") && !!document.querySelector("[data-home-category=naming]")`,
      ),
    "home after detail",
  );
  await evaluate(
    `document.querySelector("[data-home-category=naming]").click()`,
  );
  await until(
    () =>
      evaluate(`(() => {
        const guide = document.body.innerText.includes("매장을 선택하면 사진과 참고 가격을 볼 수 있어요");
        return location.pathname === "/stores" && location.hash === "#store-prices" && guide && !document.querySelector("[data-selected-store]");
      })()`),
    "store choice",
  );
  await evaluate("history.back()");
  await until(
    () =>
      evaluate(
        `location.pathname === "/" && !!document.querySelector("[data-home-notice]")`,
      ),
    "home notice",
  );
  await evaluate(`document.querySelector("[data-home-notice]").click()`);
  await until(
    () =>
      evaluate(
        `location.pathname === ${JSON.stringify(`/notices/${pinnedId}`)} && document.body.innerText.includes("목록으로 돌아가기") && document.body.innerText.includes(${JSON.stringify(popupBody)}) && document.body.innerText.includes(${JSON.stringify(longNotice)})`,
      ),
    "notice detail",
  );

  await setMode("empty");
  await go("/");
  await closePopup();
  await waitText("전화상담 목록 보기");
  const empty = await evaluate(`(() => ({
    fallback: !!document.querySelector("[data-home-banner-fallback]"),
    index: !!document.querySelector("[data-home-banner-index]"),
    text: document.body.innerText,
    href: document.querySelector("[data-home-banner-fallback] a")?.getAttribute("href"),
  }))()`);
  assert.equal(empty.fallback, true);
  assert.equal(empty.index, false);
  assert.equal(empty.href, "/consult");
  assert.equal(empty.text.includes("추천 선생님이 아직 없어요."), true);
  assert.equal(empty.text.includes("해당하는 선생님이 아직 없어요."), true);
  assert.equal(empty.text.includes("1 / 0"), false);
  assert.equal(empty.text.includes(longName), false);

  await setMode("nophoto");
  await go("/");
  await closePopup();
  await waitText(longName);
  const missing = await evaluate(`(() => ({
    fallback: !!document.querySelector("[data-home-banner-fallback]"),
    index: !!document.querySelector("[data-home-banner-index]"),
    placeholder: document.querySelectorAll('[data-home-recommend] [aria-label="상담사 사진 자리"]').length,
    bannerPlaceholder: document.querySelectorAll('[data-home-banner] [aria-label="상담사 사진 자리"]').length,
  }))()`);
  assert.equal(missing.fallback, false);
  assert.equal(missing.index, true);
  assert.ok(missing.placeholder >= 1);
  assert.ok(missing.bannerPlaceholder >= 1);

  await setMode("notice-empty");
  await go("/");
  await closePopup();
  await waitText(longName);
  const quiet = await evaluate(`(() => ({
    status: document.querySelector("[data-home-notice]")?.getAttribute("data-home-notice"),
    href: document.querySelector("[data-home-notice]")?.getAttribute("href"),
    text: document.body.innerText,
  }))()`);
  assert.equal(quiet.status, "empty");
  assert.equal(quiet.href, "/notices");
  assert.equal(quiet.text.includes("등록된 공지가 없어요."), true);
  assert.equal(quiet.text.includes(longNotice), false);
  assert.equal(quiet.text.includes(privateTitle), false);

  await setMode("notice-fail");
  await go("/");
  await waitText(longName);
  await waitText("매장 상담 메뉴");
  const failed = await evaluate(`(() => ({
    status: document.querySelector("[data-home-notice]")?.getAttribute("data-home-notice"),
    href: document.querySelector("[data-home-notice]")?.getAttribute("href"),
    text: document.body.innerText,
  }))()`);
  assert.equal(failed.status, "error");
  assert.equal(failed.href, "/notices");
  assert.equal(failed.text.includes("공지를 불러오지 못했어요."), true);
  assert.equal(failed.text.includes("Application error"), false);
  assert.equal(failed.text.includes(privateTitle), false);
  assert.equal(failed.text.includes(longName), true);
  console.log("PASS design v2 home browser");
} finally {
  if (chrome) await chrome.close();
  stop(app);
  await new Promise((done) => fixture.close(done));
}
