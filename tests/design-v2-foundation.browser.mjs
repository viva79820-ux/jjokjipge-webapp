// Isolated fixture only. No real Supabase credentials or resources.
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

const outDir = join("tmp", "design-v2-foundation");
mkdirSync(outDir, { recursive: true });
const productId = "22222222-2222-4222-8222-222222222222";
const counselorDbId = "33333333-3333-4333-8333-333333333333";
const noticeId = "44444444-4444-4444-8444-444444444444";
const longName = "아주긴이름가나다라마바사아자차카타파하";
const longCareer = `승인된경력원문${"가".repeat(80)}`;
const longAddress = `대구광역시 중구 동성로 테스트주소${"나".repeat(80)}`;
const longTopic = "가나다라마바사아자차카타파하가나다라마바";
assert.equal([...longTopic].length, 20);
assert.equal(longTopic.includes(" "), false);
const failedPhoto = "counselors/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const baseCounselor = {
  field: "saju",
  fields: ["saju", "tarot"],
  tags: ["사주", "타로"],
  careers: [longCareer],
  intro: longCareer,
  description: longCareer,
  is_recommended: true,
  is_new: false,
  is_active: true,
  approval_status: "approved",
  stores: { name: "동성로 테스트 매장", slug: "store-one" },
  consult_products: [
    { id: productId, name: "사주 30분", minutes: 30, price: 30000 },
  ],
};
const counselors = [
  {
    ...baseCounselor,
    id: counselorDbId,
    slug: "long-name",
    name: longName,
    tags: [longTopic],
    image_path: null,
  },
  {
    ...baseCounselor,
    id: "55555555-5555-4555-8555-555555555555",
    slug: "photo-fail",
    name: "사진실패",
    image_path: failedPhoto,
    consult_products: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "타로 30분",
        minutes: 30,
        price: 20000,
      },
    ],
  },
];
const calls = [];
const json = (res, body, status = 200) => {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  calls.push(`${req.method} ${url.pathname}`);
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
    json(res, { message: "missing" }, 404);
    return;
  }
  const table = url.pathname.split("/").at(-1);
  const object = req.headers.accept?.includes("object+json");
  if (table === "counselors") {
    const slug = url.searchParams.get("slug")?.replace(/^eq\./, "");
    const rows = slug
      ? counselors.filter((item) => item.slug === slug)
      : counselors;
    const select = url.searchParams.get("select") || "";
    if (select === "id,name") {
      const row = rows[0];
      json(res, row ? { id: row.id, name: row.name } : null);
      return;
    }
    json(res, object ? rows[0] || null : rows);
    return;
  }
  if (table === "consult_products") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const product = counselors
      .flatMap((item) => item.consult_products)
      .find((item) => item.id === id);
    json(res, object ? product || null : product ? [product] : []);
    return;
  }
  if (table === "reservations") {
    json(res, []);
    return;
  }
  if (table === "stores") {
    json(res, [
      {
        slug: "store-one",
        name: "동성로 테스트 매장",
        address: longAddress,
        hours: "테스트 영업시간",
        description: "테스트 매장 설명",
        phone: "010-0000-0000",
        image_path: null,
      },
    ]);
    return;
  }
  if (table === "notices") {
    const notice = {
      id: noticeId,
      title: "홈 공지 팝업 확인",
      body: "팝업 본문입니다.\n둘째 줄",
      image_path: null,
      image_alt: null,
      is_published: true,
      is_popup: true,
      is_pinned: true,
      published_at: "2026-11-16T00:00:00+09:00",
    };
    json(res, object ? notice : [notice]);
    return;
  }
  if (table === "profiles") {
    json(res, object ? null : []);
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
  const shot = async (name) => {
    const { data } = await chrome.call("Page.captureScreenshot", {
      format: "png",
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
  const measure = () =>
    evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      const bar = document.querySelector("[data-app-bar]");
      const list = document.querySelector("main ul");
      const columns = list ? getComputedStyle(list).gridTemplateColumns : "";
      return {
        innerWidth: window.innerWidth,
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        app: Math.round(shell.getBoundingClientRect().width),
        bar: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        bodySize: getComputedStyle(document.body).fontSize,
        columns: columns.split(" ").filter(Boolean).length,
      };
    })()`);
  const topicChip = () =>
    evaluate(`(() => {
      const topic = ${JSON.stringify(longTopic)};
      const chip = [...document.querySelectorAll("li span")].find(
        (node) => node.textContent.replace(/\\s+/g, "") === topic,
      );
      if (!chip) return { missing: true };
      const item = chip.closest("li");
      const range = document.createRange();
      range.selectNodeContents(chip);
      const text = range.getBoundingClientRect();
      const box = chip.getBoundingClientRect();
      const intro = item.querySelector("p");
      const introBox = intro.getBoundingClientRect();
      const button = [...item.querySelectorAll("a")].find((node) =>
        node.textContent.includes("전화상담 예약"),
      );
      const buttonBox = button.getBoundingClientRect();
      const overlaps = (a, b) =>
        a.left < b.right - 0.5 &&
        a.right > b.left + 0.5 &&
        a.top < b.bottom - 0.5 &&
        a.bottom > b.top + 0.5;
      const short = [...item.querySelectorAll("span")].find(
        (node) => node.textContent.replace(/\\s+/g, "") === "사주",
      );
      const style = getComputedStyle(chip);
      const shortStyle = getComputedStyle(short);
      return {
        text: chip.textContent.replace(/\\s+/g, ""),
        lines: range.getClientRects().length,
        chipWidth: box.width,
        chipHeight: box.height,
        textTop: text.top - box.top,
        textBottom: box.bottom - text.bottom,
        textHeight: text.height,
        inside:
          text.width > 0 &&
          text.top >= box.top - 0.5 &&
          text.bottom <= box.bottom + 0.5 &&
          text.left >= box.left - 0.5 &&
          text.right <= box.right + 0.5,
        overlapsIntro: overlaps(text, introBox),
        overlapsButton: overlaps(text, buttonBox),
        chipScrolls: chip.scrollWidth > chip.clientWidth + 1,
        fontSize: style.fontSize,
        color: style.color,
        weight: style.fontWeight,
        wrap: style.overflowWrap,
        radius: style.borderTopLeftRadius,
        shortHeight: short.getBoundingClientRect().height,
        shortWeight: shortStyle.fontWeight,
        shortSize: shortStyle.fontSize,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    })()`);
  const assertTopic = (chip, multiline) => {
    assert.equal(chip.missing, undefined, "긴 상담 주제 칩을 찾지 못했습니다.");
    assert.equal(chip.text, longTopic);
    assert.equal(chip.fontSize, "12px");
    assert.equal(chip.wrap, "anywhere");
    assert.equal(chip.shortSize, "12px");
    assert.equal(chip.color, "rgb(94, 47, 120)");
    assert.equal(String(chip.weight), "600");
    assert.equal(String(chip.shortWeight), "700");
    assert.equal(Math.round(chip.shortHeight), 24);
    assert.equal(chip.overflow, false, JSON.stringify(chip));
    assert.equal(chip.chipScrolls, false, JSON.stringify(chip));
    assert.equal(chip.overlapsIntro, false, JSON.stringify(chip));
    assert.equal(chip.overlapsButton, false, JSON.stringify(chip));
    assert.ok(
      parseFloat(chip.radius) + 0.5 >= chip.chipHeight / 2,
      JSON.stringify(chip),
    );
    if (multiline) assert.ok(chip.lines > 1, JSON.stringify(chip));
    assert.equal(chip.inside, true, JSON.stringify(chip));
  };

  await emulate({ width: 390, height: 844, fine: false });
  await go("/");
  await until(
    () => evaluate("!!document.querySelector('dialog[open]')"),
    "notice popup",
  );
  assert.equal(
    await evaluate(
      "document.activeElement.closest('dialog') === document.querySelector('dialog[open]')",
    ),
    true,
  );
  assert.equal(
    await evaluate(`(() => {
      const dialog = document.querySelector("dialog[open]");
      const buttons = [...dialog.querySelectorAll("button")];
      const labels = buttons.map((button) => button.textContent.trim());
      const visible = buttons.every((button) => {
        const box = button.getBoundingClientRect();
        return box.height >= 44 && box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
      });
      return visible && labels.includes("닫기") && labels.includes("오늘 하루 보지 않기") && labels.includes("공지 자세히 보기");
    })()`),
    true,
  );
  await shot("popup-390.png");
  await chrome.button("닫기");
  await until(
    () => evaluate("!document.querySelector('dialog[open]')"),
    "popup closed",
  );
  assert.equal(await evaluate("document.activeElement.id"), "home-start");

  await until(
    () =>
      evaluate(
        "document.querySelectorAll('[aria-label=\"상담사 사진 자리\"]').length >= 1",
      ),
    "photo placeholder",
  );
  const placeholder = await evaluate(`(() => {
    const frame = document.querySelector('[aria-label="상담사 사진 자리"]');
    const image = frame.querySelector("img");
    const frameBox = frame.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    return {
      src: image.getAttribute("src"),
      ratio: imageBox.width / frameBox.width,
      background: getComputedStyle(frame).backgroundColor,
    };
  })()`);
  assert.match(placeholder.src, /logo-angel-mark\.png/);
  assert.ok(placeholder.ratio > 0.5 && placeholder.ratio < 0.75);
  assert.equal(placeholder.background, "rgb(243, 234, 248)");

  const header = await evaluate(`(() => {
    const row = document.querySelector("header > div");
    const logo = row.querySelector("img");
    const login = document.querySelector('a[aria-label="로그인"]');
    const loginBox = login.getBoundingClientRect();
    const tab = document.querySelector('nav[aria-label="주요 메뉴"]');
    const bar = document.querySelector('[data-app-bar]');
    const phoneButton = bar.querySelector("#bottom-phone-call");
    const phone = phoneButton.querySelector("span");
    const phoneBox = phone.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    return {
      row: Math.round(row.getBoundingClientRect().height),
      logo: Math.round(logo.getBoundingClientRect().height),
      name: row.innerText.replace(/\\s+/g, " ").trim(),
      loginHref: login.getAttribute("href"),
      loginWidth: loginBox.width,
      loginHeight: loginBox.height,
      tabHeight: Math.round(tab.getBoundingClientRect().height),
      barHeight: Math.round(barBox.height),
      phoneWidth: Math.round(phoneBox.width),
      phoneRaised: Math.round(barBox.top - phoneBox.top),
      phoneTag: phoneButton.tagName,
      phoneHref: phoneButton.getAttribute("href"),
      labels: [...bar.children].map(
        (node) => node.querySelectorAll("span")[1]?.textContent.trim() ?? "",
      ),
      headerBg: getComputedStyle(document.querySelector("header")).backgroundColor,
      barBg: getComputedStyle(bar).backgroundColor,
      pageBg: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  assert.equal(header.row, 60);
  assert.equal(header.logo, 34);
  assert.equal(header.name, "쪽집게천사 운세통");
  assert.equal(header.loginHref, "/login");
  assert.ok(header.loginWidth >= 44 && header.loginHeight >= 44);
  assert.equal(header.tabHeight, 48);
  assert.equal(header.barHeight, 72);
  assert.equal(header.phoneWidth, 54);
  assert.ok(header.phoneRaised >= 16 && header.phoneRaised <= 24);
  assert.equal(header.phoneTag, "BUTTON");
  assert.equal(header.phoneHref, null);
  assert.deepEqual(header.labels, [
    "홈",
    "카테고리",
    "전화하기",
    "예약조회",
    "로그인",
  ]);
  assert.equal(header.headerBg, "rgb(255, 255, 255)");
  assert.equal(header.barBg, "rgb(255, 255, 255)");
  assert.equal(header.pageBg, "rgb(247, 243, 250)");

  let focused = null;
  for (let step = 0; step < 8; step += 1) {
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
        tag: node.tagName,
        label: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 40),
        width: box.width,
        height: box.height,
        outline: style.outlineStyle,
      };
    })()`);
    if (
      focused.width >= 44 &&
      focused.height >= 44 &&
      focused.outline !== "none"
    )
      break;
  }
  assert.ok(
    focused.width >= 44 && focused.height >= 44 && focused.outline !== "none",
    JSON.stringify(focused),
  );

  await go("/consult");
  assert.equal(
    await evaluate(`(() => {
      const tab = document.querySelector('nav[aria-label="주요 메뉴"] [aria-current="page"]');
      const style = getComputedStyle(tab);
      return tab.textContent.trim() + "|" + style.borderBottomWidth + "|" + style.color + "|" + style.fontWeight;
    })()`),
    "전화상담|3px|rgb(124, 66, 154)|700",
  );
  await go("/stores");
  assert.equal(
    await evaluate(
      'document.querySelector(\'nav[aria-label="주요 메뉴"] [aria-current="page"]\').textContent.trim()',
    ),
    "매장상담",
  );
  assert.equal(
    await evaluate(
      `document.body.innerText.includes(${JSON.stringify(longAddress)}) && document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth + 1`,
    ),
    true,
  );
  const tabLabels = [
    "전화상담",
    "AI 사주",
    "클래스",
    "매장상담",
    "타로샵",
    "콘텐츠",
  ];
  const readTabs = () =>
    evaluate(`(() => {
      const nav = document.querySelector('nav[aria-label="주요 메뉴"]');
      const active = nav?.querySelector('[aria-current="page"]');
      const navBox = nav?.getBoundingClientRect();
      const activeBox = active?.getBoundingClientRect();
      const shell = document.querySelector("[data-app-shell]");
      return {
        labels: nav ? [...nav.querySelectorAll(":scope > a")].map((link) => link.textContent.trim()) : [],
        active: active ? active.textContent.trim() : "",
        scrolls: nav ? nav.scrollWidth > nav.clientWidth + 1 : false,
        scrollLeft: nav ? nav.scrollLeft : 0,
        activeInside: Boolean(
          nav &&
            active &&
            activeBox.left >= navBox.left - 1 &&
            activeBox.right <= navBox.right + 1 &&
            activeBox.width > 0,
        ),
        shell: shell ? Math.round(shell.getBoundingClientRect().width) : 0,
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    })()`);
  for (const [width, fine] of [
    [360, false],
    [390, false],
    [1280, true],
  ]) {
    await emulate({ width, height: fine ? 900 : 844, fine });
    await go("/contents");
    await until(async () => {
      const tabs = await readTabs();
      return (
        tabs.active === "콘텐츠" &&
        tabs.activeInside &&
        tabs.labels.length === 6 &&
        (fine || (tabs.scrolls && tabs.scrollLeft > 0))
      );
    }, `contents tabs ${width}`);
    const contents = await readTabs();
    assert.deepEqual(contents.labels, tabLabels, String(width));
    assert.equal(contents.active, "콘텐츠", String(width));
    assert.equal(contents.activeInside, true, `contents scroll ${width}`);
    assert.equal(contents.overflow, true, `contents page ${width}`);
    if (fine) assert.equal(contents.shell, 560, String(contents.shell));
    else {
      assert.equal(contents.scrolls, true, `contents overflow tabs ${width}`);
      assert.ok(contents.scrollLeft > 0, `contents autoscroll ${width}`);
    }
    await go("/ai-saju");
    await until(async () => {
      const tabs = await readTabs();
      return tabs.active === "AI 사주" && tabs.activeInside;
    }, `ai tabs ${width}`);
    const preparing = await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === "준비 중");
      const example = [...document.querySelectorAll("a")].find((node) => node.textContent.trim() === "예시 결과 보기");
      return {
        disabled: Boolean(button && button.disabled),
        example: example ? example.getAttribute("href") : "",
        form: document.querySelectorAll("form").length,
      };
    })()`);
    assert.equal(preparing.disabled, true, `preparing ${width}`);
    assert.equal(preparing.example, "/ai-saju/result", `example ${width}`);
    assert.equal(preparing.form, 0, `form ${width}`);
  }
  await emulate({ width: 390, height: 844, fine: false });
  await go("/ai-saju");
  await evaluate(`(() => {
    const example = [...document.querySelectorAll("a")].find((node) => node.textContent.trim() === "예시 결과 보기");
    example.click();
  })()`);
  await until(
    () => evaluate('location.pathname === "/ai-saju/result"'),
    "ai example",
  );
  assert.equal(
    await evaluate(`(() => {
      const text = document.body.innerText;
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].some((node) =>
          node.checkVisibility(),
        );
      return (
        text.includes("예시 결과") &&
        text.includes("다른 사람 보기") &&
        text.includes("선생님께 상담") &&
        !visible('nav[aria-label="주요 메뉴"]') &&
        !visible('nav[aria-label="하단 메뉴"]')
      );
    })()`),
    true,
  );
  await go("/");
  assert.equal(
    await evaluate(
      'document.querySelector(\'nav[aria-label="하단 메뉴"] [aria-current="page"]\').textContent.trim()',
    ),
    "홈",
  );

  await go("/consult/photo-fail");
  await until(
    () =>
      evaluate(
        "!!document.querySelector('[aria-label=\"상담사 사진 자리\"] img')",
      ),
    "failed photo fallback",
  );
  assert.match(
    await evaluate(
      "document.querySelector('[aria-label=\"상담사 사진 자리\"] img').src",
    ),
    /logo-angel-mark\.png/,
  );

  await go("/consult/long-name");
  await until(
    () =>
      evaluate(
        `document.body.innerText.includes(${JSON.stringify(longCareer)})`,
      ),
    "career text",
  );
  assert.equal(
    await evaluate(`(() => {
      const item = [...document.querySelectorAll("li")].find((node) => node.textContent.includes(${JSON.stringify(longCareer)}));
      return item.scrollWidth <= item.clientWidth + 1;
    })()`),
    true,
  );

  await go(`/consult/long-name/book?product=${productId}`);
  await until(
    () => evaluate("document.body.innerText.includes('사주 30분')"),
    "booking product",
  );
  assert.equal(
    await evaluate("document.body.innerText.includes('30,000')"),
    true,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),
    true,
  );

  await go("/booking/lookup");
  await until(
    () => evaluate("!!document.querySelector('main input')"),
    "lookup form",
  );
  assert.equal(
    await evaluate(`(() => {
      const fields = [...document.querySelectorAll("main input")];
      return fields.length > 0 && fields.every((field) => {
        const box = field.getBoundingClientRect();
        const radius = getComputedStyle(field).borderRadius;
        return box.height >= 44 && box.right <= innerWidth + 1 && !radius.endsWith("9999px") && radius !== "50%";
      });
    })()`),
    true,
  );

  await go("/admin/login");
  await until(
    () => evaluate("document.body.innerText.includes('관리자')"),
    "admin login",
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),
    true,
  );
  await shot("admin-login-390.png");

  const viewports = [
    ["home-360.png", 360, 844, false],
    ["home-390.png", 390, 844, false],
    ["home-430.png", 430, 844, false],
    ["home-tablet-768.png", 768, 1024, false],
    ["home-tablet-1024.png", 1024, 1366, false],
    ["home-pc-1280.png", 1280, 900, true],
  ];
  const results = [];
  for (const [name, width, height, fine] of viewports) {
    await emulate({ width, height, fine });
    await go("/consult");
    await until(
      () =>
        evaluate(
          `document.body.innerText.includes(${JSON.stringify(longTopic)})`,
        ),
      name,
    );
    const topic = await topicChip();
    await evaluate(`(() => {
      const topic = ${JSON.stringify(longTopic)};
      const chip = [...document.querySelectorAll("li span")].find(
        (node) => node.textContent.replace(/\\s+/g, "") === topic,
      );
      chip?.scrollIntoView({ block: "center" });
      return true;
    })()`);
    await shot(name.replace("home-", "consult-chip-"));
    assertTopic(topic, false);
    const consult = await measure();
    await go("/");
    await until(
      () => evaluate("!!document.querySelector('[data-app-bar]')"),
      `${name} home`,
    );
    const home = await measure();
    await shot(name);
    const wideTabs = fine || width >= 768;
    const readMenu = () =>
      evaluate(`(() => {
        const nav = document.querySelector('nav[aria-label="주요 메뉴"]');
        if (!nav) return null;
        const links = [...nav.querySelectorAll(":scope > a")];
        const navBox = nav.getBoundingClientRect();
        const boxes = links.map((link) => {
          const box = link.getBoundingClientRect();
          return {
            label: link.textContent.trim(),
            left: box.left,
            right: box.right,
            width: box.width,
            fits: link.scrollWidth <= link.clientWidth + 1,
          };
        });
        const visible = (box) =>
          box.left >= navBox.left - 1 &&
          box.right <= navBox.right + 1 &&
          box.width > 0;
        const first = boxes[0];
        const last = boxes.at(-1);
        return {
          count: boxes.length,
          first: first ? first.label : "",
          last: last ? last.label : "",
          scrolls: nav.scrollWidth > nav.clientWidth + 1,
          scrollLeft: nav.scrollLeft,
          firstVisible: Boolean(first && visible(first)),
          lastVisible: Boolean(last && visible(last)),
          span: first && last ? last.right - first.left : 0,
          inner: nav.clientWidth - 16,
          textFits: boxes.every((box) => box.fits),
          widthGap:
            boxes.reduce((gap, box) => Math.max(gap, box.width), 0) -
            boxes.reduce((gap, box) => Math.min(gap, box.width), Infinity),
        };
      })()`);
    await until(async () => {
      const menu = await readMenu();
      return Boolean(
        menu &&
        menu.count === 6 &&
        menu.textFits &&
        menu.firstVisible &&
        (wideTabs
          ? !menu.scrolls && menu.lastVisible && menu.span >= menu.inner - 2
          : menu.scrolls && !menu.lastVisible),
      );
    }, `${name} home tabs`);
    const homeTabs = await readMenu();
    assert.equal(homeTabs.first, "전화상담", `${name} first tab`);
    assert.equal(homeTabs.last, "콘텐츠", `${name} last tab`);
    assert.equal(homeTabs.textFits, true, `${name} tab text`);
    assert.equal(homeTabs.firstVisible, true, `${name} first visible`);
    if (wideTabs) {
      assert.equal(homeTabs.scrolls, false, `${name} tabs fit`);
      assert.equal(homeTabs.lastVisible, true, `${name} last visible`);
      assert.ok(
        homeTabs.span >= homeTabs.inner - 2,
        `${name} span ${homeTabs.span} inner ${homeTabs.inner}`,
      );
      if (!fine)
        assert.ok(homeTabs.widthGap <= 1, `${name} even ${homeTabs.widthGap}`);
    } else {
      assert.equal(homeTabs.scrolls, true, `${name} tabs scroll`);
      assert.equal(homeTabs.lastVisible, false, `${name} last clipped`);
    }
    await go("/contents");
    await until(async () => {
      const menu = await readMenu();
      return Boolean(
        menu &&
        menu.lastVisible &&
        menu.textFits &&
        (wideTabs ? menu.firstVisible && !menu.scrolls : menu.scrolls),
      );
    }, `${name} contents tabs`);
    const contentsTabs = await readMenu();
    assert.equal(contentsTabs.first, "전화상담", `${name} contents first`);
    assert.equal(contentsTabs.last, "콘텐츠", `${name} contents last`);
    assert.equal(contentsTabs.lastVisible, true, `${name} contents last`);
    assert.equal(contentsTabs.textFits, true, `${name} contents text`);
    if (wideTabs) {
      assert.equal(contentsTabs.scrolls, false, `${name} contents fit`);
      assert.equal(contentsTabs.firstVisible, true, `${name} contents first`);
    } else {
      assert.equal(contentsTabs.scrolls, true, `${name} contents scroll`);
      assert.ok(contentsTabs.scrollLeft > 0, `${name} contents autoscroll`);
    }
    results.push({ name, consult, home, homeTabs, contentsTabs });
    assert.equal(home.innerWidth, width);
    assert.equal(home.fine, fine);
    assert.equal(home.overflow, false);
    assert.equal(consult.overflow, false);
    assert.equal(home.bodySize, "15px");
    assert.equal(home.app, home.bar);
    if (fine) {
      assert.equal(home.app, 560);
      assert.equal(consult.columns, 1);
    } else if (width >= 768) {
      assert.equal(home.app, width);
      assert.equal(consult.columns, 2);
    } else {
      assert.equal(home.app, width);
      assert.equal(consult.columns, 1);
    }
  }
  await emulate({ width: 1280, height: 900, fine: true });
  await go("/admin/login");
  const adminPc = await measure();
  assert.equal(adminPc.fine, true);
  assert.equal(adminPc.app, 560);
  assert.equal(adminPc.overflow, false);
  await shot("admin-login-pc-1280.png");
  writeFileSync(
    join(outDir, "measurements.json"),
    JSON.stringify({ results, adminPc, calls: [...new Set(calls)] }, null, 2),
  );
  console.log("PASS design v2 foundation browser");
} finally {
  if (chrome) await chrome.close();
  stop(app);
  await new Promise((done) => fixture.close(done));
}
