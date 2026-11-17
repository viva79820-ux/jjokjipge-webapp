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

const outDir = join("tmp", "navigation-response");
mkdirSync(outDir, { recursive: true });
const counselorId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const productA = "55555555-5555-4555-8555-555555555555";
const productB = "66666666-6666-4666-8666-666666666666";
const noticeId = "99999999-9999-4999-8999-999999999999";
const products = [
  {
    id: productA,
    counselor_id: counselorId,
    name: "사주 40분",
    minutes: 40,
    price: 30000,
    is_active: true,
  },
  {
    id: productB,
    counselor_id: counselorId,
    name: "짧은 상담",
    minutes: 15,
    price: 5000,
    is_active: true,
  },
];
const counselors = [
  {
    id: counselorId,
    slug: "both",
    name: "상담사 A",
    field: "saju",
    fields: ["saju", "tarot"],
    tags: ["진로"],
    careers: ["경력 더미"],
    intro: "상담사 A 소개",
    description: "상담사 A 설명",
    image_path: null,
    is_recommended: true,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 1,
    stores: { name: "테스트 매장", slug: "store-one" },
    consult_products: products,
  },
  {
    id: otherId,
    slug: "tarot-only",
    name: "상담사 B",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: [],
    intro: "타로 소개",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: true,
    is_active: true,
    approval_status: "approved",
    sort_order: 2,
    stores: { name: "테스트 매장", slug: "store-one" },
    consult_products: [],
  },
];
const notice = {
  id: noticeId,
  title: "점검 공지",
  body: "공지 본문 더미",
  image_path: null,
  image_alt: null,
  is_pinned: true,
  is_published: true,
  is_popup: false,
  published_at: "2026-11-01T00:00:00+09:00",
  created_at: "2026-11-01T00:00:00+09:00",
  updated_at: "2026-11-01T00:00:00+09:00",
};
const hits = [];
let slow = false;
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
const fixture = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  hits.push({
    t: Date.now(),
    method: req.method,
    table: url.pathname.split("/").at(-1),
  });
  const send = () => {
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
    const eq = (key) => url.searchParams.get(key)?.replace(/^eq\./, "");
    if (table === "counselors") {
      const slug = eq("slug");
      const rows = counselors.filter((item) => !slug || item.slug === slug);
      json(res, object ? rows[0] || null : rows);
      return;
    }
    if (table === "consult_products") {
      const id = eq("id");
      const rows = products.filter((item) => !id || item.id === id);
      json(res, object ? rows[0] || null : rows);
      return;
    }
    if (table === "notices") {
      const id = eq("id");
      const rows = [notice].filter((item) => !id || item.id === id);
      json(res, object ? rows[0] || null : rows);
      return;
    }
    if (table === "faqs") {
      json(res, [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          category: "consultation",
          question: "예약은 어떻게 하나요",
          answer: "전화상담 화면에서 예약합니다.",
          is_active: true,
          sort_order: 1,
        },
      ]);
      return;
    }
    if (table === "stores") {
      json(res, [
        {
          slug: "store-one",
          name: "테스트 매장",
          address: "대구 테스트",
          hours: "테스트 시간",
          description: "테스트 설명",
          phone: "010-0000-0000",
          image_path: null,
          is_active: true,
          sort_order: 1,
        },
      ]);
      return;
    }
    json(res, object ? null : []);
  };
  if (slow && !url.pathname.startsWith("/auth/")) setTimeout(send, 800);
  else send();
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
const report = [];
try {
  let build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  if (
    build.status !== 0 &&
    `${build.stdout}\n${build.stderr}`.includes("SecurityFatalError")
  ) {
    build = spawnSync(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build"],
      { env, encoding: "utf8", windowsHide: true },
    );
  }
  writeFileSync(
    join(outDir, "after-build.log"),
    `${build.stdout || ""}\n${build.stderr || ""}`,
  );
  assert.equal(build.status, 0, "next build failed");
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(base)).ok;
    } catch {
      return false;
    }
  }, "production server");
  slow = true;
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
    await delay(120);
  };
  const waitText = async (text) => {
    await until(
      () =>
        evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`),
      text,
    );
  };
  const clickVisible = async (selector) => {
    await until(
      () =>
        evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})]
          .some((node) => node.checkVisibility()))()`),
      selector,
    );
    await evaluate(`(() => {
      const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((item) => item.checkVisibility());
      node.click();
    })()`);
  };
  const counselorHits = () => hits.filter((hit) => hit.table === "counselors");
  const bodyText = () => evaluate("document.body.innerText");
  const href = () => evaluate("location.pathname + location.search");

  await emulate({ width: 390, height: 844, fine: false });
  await go("/consult?type=saju&type=tarot");
  await until(
    () =>
      evaluate(`(() => {
        const text = document.body.innerText;
        return (
          text.includes("선생님") &&
          !text.includes("상담사 목록을 불러오는 중이에요.")
        );
      })()`),
    "duplicate field list",
  );
  const duplicateHits = counselorHits().length;
  await delay(1000);
  const duplicateText = await bodyText();
  assert.equal(await href(), "/consult?type=saju&type=tarot");
  assert.equal(duplicateText.includes("선생님 2명"), true, duplicateText);
  assert.equal(duplicateText.includes("상담사 A"), true, duplicateText);
  assert.equal(duplicateText.includes("상담사 B"), true, duplicateText);
  assert.equal(
    await evaluate(
      `document.querySelector('nav[aria-label="상담 분야"] a[href="/consult"]')?.getAttribute("aria-current")`,
    ),
    "page",
  );
  assert.equal(counselorHits().length, duplicateHits);
  report.push({ duplicateType: "all", href: await href() });

  await go("/consult");
  try {
    await waitText("선생님 2명");
  } catch (error) {
    writeFileSync(
      join(outDir, "debug-consult.txt"),
      `${await href()}\n${await bodyText()}\n${JSON.stringify(hits.slice(-20))}\n${error}`,
    );
    throw error;
  }
  await evaluate("window.scrollTo(0, 220)");
  await delay(50);
  const scrolled = await evaluate("window.scrollY");
  assert.ok(scrolled > 40, `page did not scroll ${scrolled}`);
  const beforeFilter = counselorHits().length;
  await evaluate("document.documentElement.dataset.probe = 'filter'");
  await clickVisible('a[href="/consult?type=tarot"]');
  await delay(120);
  const earlyFilter = await bodyText();
  const earlyScroll = await evaluate("window.scrollY");
  const earlyHref = await href();
  assert.equal(earlyHref, "/consult?type=tarot");
  assert.equal(earlyFilter.includes("선생님 2명"), true);
  assert.equal(earlyFilter.includes("상담사 목록을 불러오는 중이에요."), false);
  assert.equal(
    await evaluate(
      `document.querySelector('a[href="/consult?type=tarot"]')?.getAttribute('aria-current')`,
    ),
    "page",
  );
  assert.equal(
    await evaluate("document.documentElement.dataset.probe"),
    "filter",
  );
  assert.ok(Math.abs(earlyScroll - scrolled) < 5, `scroll ${earlyScroll}`);
  await clickVisible('a[href="/consult?type=saju"]');
  await delay(80);
  const sajuFilter = await bodyText();
  assert.equal(await href(), "/consult?type=saju");
  assert.equal(sajuFilter.includes("선생님 1명"), true);
  assert.equal(sajuFilter.includes("상담사 B"), false);
  await delay(1000);
  assert.equal(counselorHits().length, beforeFilter);
  assert.equal(await href(), "/consult?type=saju");
  assert.equal((await bodyText()).includes("선생님 1명"), true);
  report.push({
    filter: "local",
    scrolled,
    earlyScroll,
    counselorRequests: counselorHits().length - beforeFilter,
  });
  await shot("after-filter-saju.png");

  const beforeRapid = counselorHits().length;
  await clickVisible('a[href="/consult?type=tarot"]');
  await clickVisible('a[href="/consult?type=saju"]');
  await clickVisible('nav[aria-label="상담 분야"] a[href="/consult"]');
  await delay(80);
  assert.equal(await href(), "/consult");
  assert.equal((await bodyText()).includes("선생님 2명"), true);
  await delay(1000);
  assert.equal(counselorHits().length, beforeRapid);
  assert.equal(await href(), "/consult");
  assert.equal((await bodyText()).includes("선생님 2명"), true);

  await clickVisible('a[href="/consult?type=saju"]');
  await clickVisible('a[href="/consult?type=tarot"]');
  await evaluate("history.back()");
  await until(() => evaluate("location.search === '?type=saju'"), "back saju");
  await delay(50);
  assert.equal((await bodyText()).includes("선생님 1명"), true);
  assert.equal(
    await evaluate("document.documentElement.dataset.probe"),
    "filter",
  );
  await evaluate("history.forward()");
  await until(
    () => evaluate("location.search === '?type=tarot'"),
    "forward tarot",
  );
  await delay(50);
  assert.equal((await bodyText()).includes("선생님 2명"), true);
  assert.equal((await bodyText()).includes("상담사 B"), true);
  assert.equal(
    await evaluate("document.documentElement.dataset.probe"),
    "filter",
  );

  await go("/consult?type=saju");
  await waitText("선생님 1명");
  assert.equal(
    await evaluate(
      `document.querySelector('a[href="/consult?type=saju"]')?.getAttribute('aria-current')`,
    ),
    "page",
  );
  await evaluate("history.back()");
  await until(
    () => evaluate("location.search === '?type=tarot'"),
    "back tarot",
  );

  await clickVisible('a[href="/consult/both"]');
  await delay(160);
  await shot("after-detail-pending.png");
  const detailPending = await bodyText();
  assert.equal(await href(), "/consult/both");
  assert.equal(
    await evaluate(
      `document.querySelector('[data-site-header]')?.checkVisibility() ?? false`,
    ),
    false,
  );
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-counselor-header]')?.checkVisibility()`,
    ),
    true,
  );
  assert.equal(detailPending.trim().length > 0, true);
  assert.equal(detailPending.includes("선생님 소개"), true);
  assert.equal(
    detailPending.includes("선생님 정보를 불러오는 중이에요.") ||
      detailPending.includes("상담사 A"),
    true,
  );
  await waitText("상담 메뉴");
  await evaluate("document.documentElement.dataset.probe = 'detail'");
  await clickVisible('a[href*="/book"]');
  await delay(160);
  await shot("after-book-pending.png");
  const bookPending = await bodyText();
  assert.equal(bookPending.includes("예약 가능 시간을 확인하고 있어요."), true);
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-site-header]')?.checkVisibility()`,
    ),
    true,
  );
  assert.equal(bookPending.trim().length > 0, true);
  await waitText("상품 선택");
  await evaluate(`(() => {
    const input = document.querySelector('[name="name"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    set.call(input, "홍길동");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  const beforeBook = hits.filter((hit) => hit.table === "reservations").length;
  await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.textContent.includes("짧은 상담"),
    );
    if (!button) throw new Error("product");
    button.click();
  })()`);
  await delay(80);
  assert.equal(
    await evaluate(`document.querySelector('[name="name"]').value`),
    "홍길동",
  );
  assert.equal(
    await evaluate(
      "location.search.includes('product=66666666-6666-4666-8666-666666666666')",
    ),
    true,
  );
  assert.equal(
    await evaluate("document.documentElement.dataset.probe"),
    "detail",
  );
  await delay(900);
  assert.equal(
    hits.filter((hit) => hit.table === "reservations").length,
    beforeBook,
  );
  const dateBefore = await href();
  await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) =>
      node.getAttribute("aria-pressed") === "false" &&
      !node.disabled &&
      !node.closest("fieldset") &&
      !node.textContent.includes("분"),
    );
    if (!button) throw new Error("date");
    button.click();
  })()`);
  await delay(80);
  assert.equal(
    await evaluate(`document.querySelector('[name="name"]').value`),
    "홍길동",
  );
  await evaluate(`(() => {
    const button = [...document.querySelectorAll("fieldset button")].find((node) => !node.disabled);
    button.click();
  })()`);
  await delay(40);
  assert.equal(
    await evaluate(
      `document.querySelector('fieldset button[aria-pressed="true"]') !== null`,
    ),
    true,
  );
  assert.notEqual(await href(), dateBefore);
  assert.equal(
    (await href()).includes("product=66666666-6666-4666-8666-666666666666"),
    true,
  );
  report.push({ bookingSelection: "client", href: await href() });

  await evaluate("history.back()");
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "detail back",
  );
  await waitText("선생님 소개");
  assert.equal(
    await evaluate(
      `document.querySelector('[data-site-header]')?.checkVisibility() ?? false`,
    ),
    false,
  );
  await evaluate("history.back()");
  await until(() => evaluate("location.pathname === '/consult'"), "list back");
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-site-header]')?.checkVisibility()`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-counselor-header]')?.checkVisibility() ?? false`,
    ),
    false,
  );

  await go("/shop");
  await waitText("타로샵");
  await clickVisible('a[href="/"]');
  await delay(160);
  await shot("after-home-pending.png");
  const homePending = await bodyText();
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-site-header]')?.checkVisibility()`,
    ),
    true,
  );
  assert.equal(
    homePending.includes("홈 내용을 불러오는 중이에요.") ||
      homePending.includes("추천 상담사"),
    true,
  );
  await waitText("추천 상담사");

  await go("/category");
  await waitText("고객센터");
  await clickVisible('a[href="/notices"]');
  await waitText("점검 공지");
  await clickVisible(`a[href*="${noticeId}"]`);
  await delay(160);
  const noticePending = await bodyText();
  assert.equal(
    await evaluate(
      `!!document.querySelector('[data-site-header]')?.checkVisibility()`,
    ),
    true,
  );
  assert.equal(
    noticePending.includes("공지를 불러오고 있습니다.") ||
      noticePending.includes("공지 본문 더미"),
    true,
  );
  await waitText("공지 본문 더미");

  await go("/support");
  await waitText("예약은 어떻게 하나요");
  const beforeFaq = hits.filter((hit) => hit.table === "faqs").length;
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('[aria-label="질문 분류"] button')]
      .find((node) => node.textContent.includes("상담"));
    button.click();
  })()`);
  await delay(200);
  assert.equal(hits.filter((hit) => hit.table === "faqs").length, beforeFaq);
  assert.equal((await bodyText()).includes("예약은 어떻게 하나요"), true);
  await clickVisible('a[href="/support/inquiry"]');
  await delay(80);
  assert.equal(await href(), "/support/inquiry");
  assert.equal((await bodyText()).includes("1:1 문의"), true);

  slow = false;
  const viewports = [
    ["360", 360, 844, false],
    ["390", 390, 844, false],
    ["430", 430, 844, false],
    ["768", 768, 1024, false],
    ["1024", 1024, 1366, false],
    ["pc-1280", 1280, 900, true],
  ];
  for (const [name, width, height, fine] of viewports) {
    await emulate({ width, height, fine });
    await go("/consult?type=saju");
    await waitText("선생님 1명");
    const reading = await evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        app: Math.round(shell.getBoundingClientRect().width),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
      };
    })()`);
    assert.equal(reading.overflow, false, `${name} ${JSON.stringify(reading)}`);
    assert.equal(reading.fine, fine);
    if (fine) assert.equal(reading.app, 560);
    else assert.equal(reading.app, width);
    await clickVisible('nav[aria-label="상담 분야"] a[href="/consult"]');
    await delay(80);
    assert.equal((await bodyText()).includes("선생님 2명"), true);
    report.push({ viewport: name, ...reading });
  }

  writeFileSync(
    join(outDir, "after-summary.json"),
    JSON.stringify(report, null, 2),
  );
  console.log("PASS navigation response");
} finally {
  if (chrome) await chrome.close();
  stop(app);
  await new Promise((done) => fixture.close(done));
}
