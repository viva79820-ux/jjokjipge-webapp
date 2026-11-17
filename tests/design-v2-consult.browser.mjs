// Isolated fixture only. No real Supabase credentials or reservation writes.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  browser,
  delay,
  server,
  stop,
  until,
} from "./notices-browser-tools.mjs";

const outDir = join("tmp", "design-v2-consult");
mkdirSync(outDir, { recursive: true });
copyFileSync(
  join("docs", "design", "v2", "screens", "consult.png"),
  join(outDir, "reference-consult.png"),
);
copyFileSync(
  join("docs", "design", "v2", "screens", "counselor.png"),
  join(outDir, "reference-counselor.png"),
);

const bothId = "11111111-1111-4111-8111-111111111111";
const tarotId = "22222222-2222-4222-8222-222222222222";
const sajuId = "33333333-3333-4333-8333-333333333333";
const photoId = "44444444-4444-4444-8444-444444444444";
const expensiveProduct = "55555555-5555-4555-8555-555555555555";
const cheapProduct = "66666666-6666-4666-8666-666666666666";
const tarotProduct = "77777777-7777-4777-8777-777777777777";
const photoProduct = "88888888-8888-4888-8888-888888888888";
const longName = `긴이름${"가".repeat(27)}`;
const longTopic = "가나다라마바사아자차카타파하가나다라마바";
const longCareer = `경력원문${"가".repeat(196)}`;
const longProduct = `긴상품명${"나".repeat(96)}`;
const longIntro = `소개원문${"다".repeat(40)}`;
const longDescription = `${"라".repeat(80)}\n둘째 줄 ${"마".repeat(40)}`;
assert.equal([...longName].length, 30);
assert.equal([...longTopic].length, 20);
assert.equal([...longCareer].length, 200);
assert.equal([...longProduct].length, 100);
assert.equal(longTopic.includes(" "), false);
assert.equal(longProduct.includes(" "), false);
const failedPhoto = "counselors/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
let emptySaju = false;

const products = [
  {
    id: expensiveProduct,
    counselor_id: bothId,
    name: longProduct,
    minutes: 40,
    price: 30000,
    is_active: true,
  },
  {
    id: cheapProduct,
    counselor_id: bothId,
    name: "짧은 상담",
    minutes: 15,
    price: 5000,
    is_active: true,
  },
  {
    id: tarotProduct,
    counselor_id: tarotId,
    name: "타로 30분",
    minutes: 30,
    price: 20000,
    is_active: true,
  },
  {
    id: photoProduct,
    counselor_id: photoId,
    name: "사진 상담",
    minutes: 20,
    price: 12000,
    is_active: true,
  },
];
const counselors = [
  {
    id: bothId,
    slug: "both",
    name: longName,
    field: "saju",
    fields: ["saju", "tarot"],
    tags: [longTopic],
    careers: [longCareer],
    intro: longIntro,
    description: longDescription,
    image_path: null,
    is_recommended: true,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 1,
    stores: { name: "동성로 테스트 매장", slug: "store-one" },
    consult_products: products.filter((item) => item.counselor_id === bothId),
  },
  {
    id: tarotId,
    slug: "tarot-only",
    name: "타로만",
    field: "tarot",
    fields: ["tarot"],
    tags: ["연애"],
    careers: [],
    intro: "타로만 소개",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: true,
    is_active: true,
    approval_status: "approved",
    sort_order: 2,
    stores: { name: "동성로 2호점", slug: "store-two" },
    consult_products: products.filter((item) => item.counselor_id === tarotId),
  },
  {
    id: sajuId,
    slug: "saju-only",
    name: "사주만",
    field: "saju",
    fields: ["saju"],
    tags: [],
    careers: ["   "],
    intro: "   ",
    description: "   ",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 3,
    stores: null,
    consult_products: [],
  },
  {
    id: photoId,
    slug: "photo-fail",
    name: "사진실패",
    field: "tarot",
    fields: ["tarot"],
    tags: ["직업"],
    careers: ["사진 상담 경력"],
    intro: "사진이 실패하는 상담사",
    description: "사진 실패 소개",
    image_path: failedPhoto,
    is_recommended: false,
    is_new: true,
    is_active: true,
    approval_status: "approved",
    sort_order: 4,
    stores: { name: "동성로 테스트 매장", slug: "store-one" },
    consult_products: products.filter((item) => item.counselor_id === photoId),
  },
];

const json = (res, body, status = 200) => {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const visibleRows = () =>
  counselors.map((row) =>
    emptySaju
      ? {
          ...row,
          field: "tarot",
          fields: ["tarot"],
        }
      : row,
  );
const fixture = createServer((req, res) => {
  const url = new URL(req.url, "http://fixture.invalid");
  if (url.pathname === "/fixture-control") {
    emptySaju = url.searchParams.get("emptySaju") === "1";
    json(res, { emptySaju });
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
    json(res, { message: "missing" }, 404);
    return;
  }
  const table = url.pathname.split("/").at(-1);
  const object = req.headers.accept?.includes("object+json");
  const eq = (key) => url.searchParams.get(key)?.replace(/^eq\./, "");
  if (table === "counselors") {
    const slug = eq("slug");
    const rows = visibleRows().filter((item) => !slug || item.slug === slug);
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
    const id = eq("id");
    const counselorId = eq("counselor_id");
    const selected = products.filter(
      (item) =>
        (!id || item.id === id) &&
        (!counselorId || item.counselor_id === counselorId) &&
        item.is_active,
    );
    json(res, object ? selected[0] || null : selected);
    return;
  }
  if (table === "stores") {
    json(res, [
      {
        slug: "store-one",
        name: "동성로 테스트 매장",
        address: "대구 테스트 주소",
        hours: "테스트 영업시간",
        description: "테스트 매장 설명",
        phone: "010-0000-0000",
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
    const clip = full
      ? await evaluate(`(() => ({
          width: Math.ceil(document.documentElement.clientWidth),
          height: Math.ceil(Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
          )),
        }))()`)
      : null;
    const { data } = await chrome.call(
      "Page.captureScreenshot",
      full
        ? {
            format: "png",
            captureBeyondViewport: true,
            fromSurface: true,
            clip: { x: 0, y: 0, ...clip, scale: 1 },
          }
        : { format: "png" },
    );
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
  const clickVisible = async (selector) => {
    await until(
      () =>
        evaluate(`(() => {
          const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .find((item) => item.checkVisibility());
          return !!node;
        })()`),
      selector,
    );
    await evaluate(`(() => {
      const node = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .find((item) => item.checkVisibility());
      node.click();
      return true;
    })()`);
    await delay(200);
  };
  const visibleCount = (selector) =>
    evaluate(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter((node) => node.checkVisibility()).length)()`);
  const measure = () =>
    evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      const list = [...document.querySelectorAll("[data-counselor-list]")]
        .find((node) => node.checkVisibility());
      const columns = list ? getComputedStyle(list).gridTemplateColumns : "";
      const bar = [...document.querySelectorAll("[data-booking-bar]")]
        .find((node) => node.checkVisibility());
      return {
        innerWidth: window.innerWidth,
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
        app: Math.round(shell.getBoundingClientRect().width),
        bar: bar ? Math.round(bar.getBoundingClientRect().width) : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        columns: columns.split(" ").filter(Boolean).length,
      };
    })()`);
  const readClearance = async () => {
    await evaluate(`(() => {
      const top = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
      window.scrollTo(0, top);
      return true;
    })()`);
    await delay(150);
    return evaluate(`(() => {
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].find((node) =>
          node.checkVisibility(),
        );
      const review = [...document.querySelectorAll("div")].find(
        (node) =>
          node.textContent.trim() === "상담 후기는 준비 중이에요." &&
          node.checkVisibility(),
      );
      const bar = visible("[data-booking-bar]");
      const detail = visible("[data-counselor-detail]");
      const main = document.querySelector("main");
      const reviewBox = review.getBoundingClientRect();
      const barBox = bar ? bar.getBoundingClientRect() : null;
      const detailStyle = detail ? getComputedStyle(detail) : null;
      const detailPad = detailStyle
        ? Number.parseFloat(detailStyle.paddingBottom) || 0
        : 0;
      const detailMargin = detailStyle
        ? Number.parseFloat(detailStyle.marginBottom) || 0
        : 0;
      const mainPad = main
        ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      let scrollSpace = 0;
      let node = review.parentElement;
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        scrollSpace += Number.parseFloat(style.paddingBottom) || 0;
        scrollSpace += Number.parseFloat(style.marginBottom) || 0;
        if (node === document.body) break;
        node = node.parentElement;
      }
      const selected = [...document.querySelectorAll('input[type="radio"]')].find(
        (node) => node.checked && node.checkVisibility(),
      );
      const link = bar
        ? [...bar.querySelectorAll("a")].find((node) => node.checkVisibility())
        : null;
      const gap = barBox
        ? barBox.top - reviewBox.bottom
        : window.innerHeight - reviewBox.bottom;
      return {
        reviewBottom: reviewBox.bottom,
        barTop: barBox ? barBox.top : null,
        barHeight: barBox ? barBox.height : 0,
        gap,
        covered: barBox ? reviewBox.bottom - barBox.top : 0,
        detailPad,
        detailMargin,
        mainPad,
        scrollSpace,
        productId: bar ? bar.dataset.productId : null,
        href: link ? link.getAttribute("href") : null,
        selected: selected ? selected.value : null,
        barText: bar ? bar.innerText : "",
        barPaddingBottom: bar
          ? Number.parseFloat(getComputedStyle(bar).paddingBottom) || 0
          : 0,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollable:
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
          ) >
          window.innerHeight + 2,
      };
    })()`);
  };
  const assertBarClearance = (reading, label) => {
    assert.ok(
      reading.barHeight > 0 && reading.gap >= -1 && reading.gap <= 8,
      `${label} ${JSON.stringify(reading)}`,
    );
    assert.ok(
      Math.abs(reading.scrollSpace - reading.barHeight) <= 1.5,
      `${label} space ${JSON.stringify(reading)}`,
    );
  };
  const assertLongSelection = (reading) => {
    assert.equal(reading.productId, expensiveProduct);
    assert.equal(reading.selected, expensiveProduct);
    assert.equal(
      reading.href,
      `/consult/both/book?product=${expensiveProduct}`,
    );
    assert.equal(reading.barText.includes(longProduct), true);
    assert.equal(reading.barText.includes("30,000원"), true);
    assert.equal(reading.barText.includes("5,000원"), false);
  };

  await emulate({ width: 390, height: 844, fine: false });
  await go("/consult");
  await waitText("이렇게 진행돼요");
  await waitText(longTopic);
  assert.deepEqual(
    await evaluate(`(() => [...document.querySelectorAll('nav[aria-label="상담 분야"] a')]
      .filter((node) => node.checkVisibility())
      .map((node) => node.textContent.trim()))()`),
    ["전체", "타로", "사주"],
  );
  assert.equal(
    await evaluate("document.body.innerText.includes('선생님 4명')"),
    true,
  );
  assert.equal(
    await evaluate(
      "document.body.innerText.includes('짧은 상담 5,000원~') && !document.body.innerText.includes('매장 가격') && !document.body.innerText.includes('전화상담 선생님') && !document.body.innerText.includes('휴무')",
    ),
    true,
  );
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-app-bar]"), 1);
  assert.equal(await visibleCount('nav[aria-label="주요 메뉴"]'), 1);
  assert.equal(
    await evaluate(`(() => {
      const topic = ${JSON.stringify(longTopic)};
      const chip = [...document.querySelectorAll("li span")].find(
        (node) => node.textContent.replace(/\\s+/g, "") === topic,
      );
      const card = chip.closest("li");
      const reserve = [...card.querySelectorAll("a")].find((node) =>
        node.textContent.includes("전화상담 예약"),
      );
      return reserve.getAttribute("href") === "/consult/both"
        && !card.innerText.includes(${JSON.stringify(longProduct)});
    })()`),
    true,
  );

  await clickVisible('a[href="/consult?type=tarot"]');
  await until(
    () => evaluate("location.search === '?type=tarot'"),
    "tarot filter",
  );
  await waitText("선생님 3명");
  assert.equal(
    await evaluate(
      "document.body.innerText.includes('타로만') && document.body.innerText.includes('사진실패') && !document.body.innerText.includes('사주만')",
    ),
    true,
  );
  await clickVisible('a[href="/consult?type=saju"]');
  await until(
    () => evaluate("location.search === '?type=saju'"),
    "saju filter",
  );
  await waitText("선생님 2명");
  assert.equal(
    await evaluate(
      `document.body.innerText.includes(${JSON.stringify(longName)}) && document.body.innerText.includes('사주만') && !document.body.innerText.includes('타로만')`,
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "document.body.innerText.includes('등록된 상담 상품이 없어요.')",
    ),
    true,
  );

  await clickVisible('a[href="/consult"]');
  await until(
    () =>
      evaluate("location.pathname === '/consult' && location.search === ''"),
    "all filter",
  );
  await waitText("선생님 4명");
  await clickVisible('a[href="/consult/both"]');
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "detail",
  );
  await waitText("선생님 소개");
  await waitText(longCareer);
  await waitText("둘째 줄");
  assert.equal(await visibleCount("[data-site-header]"), 0);
  assert.equal(await visibleCount("[data-app-bar]"), 0);
  assert.equal(await visibleCount('nav[aria-label="주요 메뉴"]'), 0);
  assert.equal(await visibleCount("[data-counselor-header]"), 1);
  assert.equal(await visibleCount("[data-booking-bar]"), 1);
  assert.equal(
    await evaluate(`(() => {
      const bar = [...document.querySelectorAll("[data-booking-bar]")].find((node) => node.checkVisibility());
      const link = [...bar.querySelectorAll("a")].find((node) => node.checkVisibility());
      const selected = document.querySelector('input[type="radio"]:checked');
      return bar.dataset.productId === ${JSON.stringify(expensiveProduct)}
        && selected.value === ${JSON.stringify(expensiveProduct)}
        && link.getAttribute("href") === ${JSON.stringify(`/consult/both/book?product=${expensiveProduct}`)}
        && link.textContent.includes("전화상담 예약하기")
        && bar.innerText.includes(${JSON.stringify(longProduct)})
        && bar.innerText.includes("30,000원");
    })()`),
    true,
  );
  assert.equal(
    await evaluate(`(() => {
      const item = [...document.querySelectorAll("li")].find((node) =>
        node.textContent.includes(${JSON.stringify(longCareer)}),
      );
      const photo = document.querySelector('[aria-label="상담사 사진 자리"]');
      const name = document.querySelector("h1");
      const photoBox = photo.getBoundingClientRect();
      const nameBox = name.getBoundingClientRect();
      const overlaps = nameBox.top < photoBox.bottom - 1 && nameBox.bottom > photoBox.top + 1;
      return item.scrollWidth <= item.clientWidth + 1
        && photo.querySelector("img").src.includes("logo-angel-mark.png")
        && Math.round(photo.getBoundingClientRect().height) === 340
        && !overlaps
        && !document.body.innerText.includes("전화상담 선생님")
        && !document.body.innerText.includes("휴무")
        && !document.body.innerText.includes("매장 가격")
        && document.body.innerText.includes("상담 후기는 준비 중이에요.")
        && !document.body.innerText.includes("후기 작성");
    })()`),
    true,
  );

  const longWidths = [
    ["360", 360, 844, false],
    ["390", 390, 844, false],
    ["430", 430, 844, false],
    ["768", 768, 1024, false],
    ["1024", 1024, 1366, false],
    ["pc-1280", 1280, 900, true],
  ];
  const longReadings = [];
  for (const [name, width, height, fine] of longWidths) {
    await emulate({ width, height, fine });
    const reading = await readClearance();
    longReadings.push({ name, ...reading });
    if (name === "360" && reading.covered > 1) {
      writeFileSync(
        join(outDir, "long-name-before.json"),
        JSON.stringify(reading, null, 2),
      );
      await shot("counselor-long-360-before.png");
    }
    await shot(`counselor-long-${name}.png`);
    assertLongSelection(reading);
    assertBarClearance(reading, `long ${name}`);
  }
  writeFileSync(
    join(outDir, "long-name-clearance.json"),
    JSON.stringify(longReadings, null, 2),
  );
  let safeAreaEmulated = false;
  try {
    await chrome.call("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 0, left: 0, right: 0, bottom: 34 },
    });
    safeAreaEmulated = true;
  } catch (error) {
    writeFileSync(
      join(outDir, "safe-area-emulation.txt"),
      error instanceof Error ? error.message : String(error),
    );
  }
  if (safeAreaEmulated) {
    await emulate({ width: 360, height: 844, fine: false });
    const safeReading = await readClearance();
    writeFileSync(
      join(outDir, "long-name-safe-area.json"),
      JSON.stringify(safeReading, null, 2),
    );
    await shot("counselor-long-360-safe-area.png");
    assertLongSelection(safeReading);
    assertBarClearance(safeReading, "safe area");
    assert.ok(safeReading.barPaddingBottom >= 34, JSON.stringify(safeReading));
    await chrome.call("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    });
  }
  await emulate({ width: 390, height: 844, fine: false });

  await evaluate(`(() => {
    document.querySelector(${JSON.stringify(`input[value="${cheapProduct}"]`)}).click();
    return true;
  })()`);
  await until(
    () =>
      evaluate(
        `document.querySelector("[data-booking-bar]").dataset.productId === ${JSON.stringify(cheapProduct)}`,
      ),
    "selected product",
  );
  assert.equal(
    await evaluate(`(() => {
      const bar = document.querySelector("[data-booking-bar]");
      const link = bar.querySelector("a");
      const selected = [...document.querySelectorAll("label")].find((node) =>
        node.textContent.includes("짧은 상담"),
      );
      const border = getComputedStyle(selected);
      return link.getAttribute("href") === ${JSON.stringify(`/consult/both/book?product=${cheapProduct}`)}
        && bar.innerText.includes("짧은 상담")
        && bar.innerText.includes("5,000원")
        && !bar.innerText.includes("30,000원")
        && border.borderTopWidth === "2px"
        && border.borderTopColor === "rgb(124, 66, 154)";
    })()`),
    true,
  );
  await evaluate(`(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return true;
  })()`);
  await delay(100);
  assert.equal(
    await evaluate(`(() => {
      const review = [...document.querySelectorAll("div")].find((node) =>
        node.textContent.trim() === "상담 후기는 준비 중이에요." && node.checkVisibility(),
      );
      const bar = document.querySelector("[data-booking-bar]");
      const reviewBox = review.getBoundingClientRect();
      const barBox = bar.getBoundingClientRect();
      const price = bar.querySelector("p");
      const button = bar.querySelector("a");
      const priceBox = price.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const overlaps = priceBox.left < buttonBox.right - 0.5
        && priceBox.right > buttonBox.left + 0.5
        && priceBox.top < buttonBox.bottom - 0.5
        && priceBox.bottom > buttonBox.top + 0.5;
      return reviewBox.bottom <= barBox.top + 1
        && !overlaps
        && buttonBox.height >= 44
        && barBox.width === document.querySelector("[data-app-shell]").getBoundingClientRect().width;
    })()`),
    true,
  );
  const cheapReading = await readClearance();
  assert.equal(cheapReading.productId, cheapProduct);
  assert.equal(cheapReading.selected, cheapProduct);
  assert.equal(cheapReading.href, `/consult/both/book?product=${cheapProduct}`);
  assert.equal(cheapReading.barText.includes("짧은 상담"), true);
  assert.equal(cheapReading.barText.includes("5,000원"), true);
  assertBarClearance(cheapReading, "short product");

  await evaluate(`(() => {
    const input = [...document.querySelectorAll('input[type="radio"]')].find(
      (node) =>
        node.value === ${JSON.stringify(expensiveProduct)} &&
        node.checkVisibility(),
    );
    input.click();
    return true;
  })()`);
  await until(
    () =>
      evaluate(`(() => {
        const bar = [...document.querySelectorAll("[data-booking-bar]")].find(
          (node) => node.checkVisibility(),
        );
        return !!bar && bar.dataset.productId === ${JSON.stringify(expensiveProduct)};
      })()`),
    "reselect long product",
  );
  await emulate({ width: 360, height: 844, fine: false });
  const relongNarrow = await readClearance();
  assertLongSelection(relongNarrow);
  assertBarClearance(relongNarrow, "reselect long 360");
  await emulate({ width: 1280, height: 900, fine: true });
  const relongPc = await readClearance();
  assertLongSelection(relongPc);
  assertBarClearance(relongPc, "reselect long pc");
  await emulate({ width: 390, height: 844, fine: false });
  await evaluate("history.back()");
  await until(
    () => evaluate("location.pathname === '/consult'"),
    "long back to list",
  );
  await waitText("이렇게 진행돼요");
  assert.equal(await visibleCount("[data-booking-bar]"), 0);
  assert.equal(await visibleCount("[data-counselor-header]"), 0);
  assert.equal(
    await evaluate(`(() => {
      const frames = [...document.querySelectorAll("[data-counselor-detail]")];
      return frames
        .filter((node) => !node.checkVisibility())
        .every(
          (node) =>
            node.style.paddingBottom === "" && node.style.marginBottom === "",
        );
    })()`),
    true,
  );
  await evaluate("history.forward()");
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "long forward to detail",
  );
  await waitText("선생님 소개");
  const restoredLong = await readClearance();
  assertLongSelection(restoredLong);
  assertBarClearance(restoredLong, "long forward");
  await emulate({ width: 360, height: 844, fine: false });
  const restoredNarrow = await readClearance();
  assertLongSelection(restoredNarrow);
  assertBarClearance(restoredNarrow, "long forward 360");
  await shot("counselor-long-restored-360.png");
  await emulate({ width: 390, height: 844, fine: false });
  await evaluate(`(() => {
    const input = [...document.querySelectorAll('input[type="radio"]')].find(
      (node) =>
        node.value === ${JSON.stringify(cheapProduct)} && node.checkVisibility(),
    );
    input.click();
    return true;
  })()`);
  await until(
    () =>
      evaluate(`(() => {
        const bar = [...document.querySelectorAll("[data-booking-bar]")].find(
          (node) => node.checkVisibility(),
        );
        return !!bar && bar.dataset.productId === ${JSON.stringify(cheapProduct)};
      })()`),
    "reselect short product",
  );

  await clickVisible("[data-booking-bar] a");
  await until(
    () =>
      evaluate(
        `location.pathname === "/consult/both/book" && location.search.includes(${JSON.stringify(`product=${cheapProduct}`)})`,
      ),
    "booking url",
  );
  await waitText("전화상담 예약");
  await waitText("짧은 상담");
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-app-bar]"), 1);
  assert.equal(await visibleCount("[data-booking-bar]"), 0);
  assert.equal(
    await evaluate(`(() => {
      const pressed = [...document.querySelectorAll('[aria-pressed="true"]')]
        .find((node) => node.checkVisibility());
      return pressed.textContent.includes("짧은 상담") && pressed.textContent.includes("5,000");
    })()`),
    true,
  );

  await evaluate("history.back()");
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "back to detail",
  );
  await waitText("선생님 소개");
  assert.equal(
    await evaluate(
      `document.querySelector("[data-booking-bar]").dataset.productId === ${JSON.stringify(cheapProduct)}`,
    ),
    true,
  );
  assert.equal(await visibleCount("[data-site-header]"), 0);
  const cheapBack = await readClearance();
  assert.equal(cheapBack.productId, cheapProduct);
  assert.equal(cheapBack.selected, cheapProduct);
  assertBarClearance(cheapBack, "short back");
  await evaluate("history.back()");
  await until(
    () => evaluate("location.pathname === '/consult'"),
    "back to list",
  );
  await waitText("이렇게 진행돼요");
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-app-bar]"), 1);
  assert.equal(await visibleCount("[data-counselor-header]"), 0);
  assert.equal(await visibleCount("[data-booking-bar]"), 0);
  assert.equal(
    await evaluate("document.body.innerText.includes('선생님 소개')"),
    false,
  );
  await evaluate("history.forward()");
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "forward to detail",
  );
  await waitText("선생님 소개");
  assert.equal(await visibleCount("[data-site-header]"), 0);
  assert.equal(await visibleCount("[data-booking-bar]"), 1);
  assert.equal(
    await evaluate(
      `document.querySelector("[data-booking-bar]").dataset.productId === ${JSON.stringify(cheapProduct)}`,
    ),
    true,
  );
  const cheapForward = await readClearance();
  assert.equal(cheapForward.productId, cheapProduct);
  assert.equal(cheapForward.selected, cheapProduct);
  assertBarClearance(cheapForward, "short forward");

  await clickVisible('[aria-label="뒤로"]');
  await until(
    () => evaluate("location.pathname === '/consult'"),
    "header back",
  );
  await waitText("선생님 4명");
  assert.equal(await visibleCount("[data-site-header]"), 1);

  await go("/consult/saju-only");
  await waitText("사주만");
  assert.equal(await visibleCount("[data-booking-bar]"), 0);
  assert.equal(
    await evaluate(
      "document.body.innerText.includes('등록된 상담 상품이 없어요.') && !document.body.innerText.includes('전화상담 예약하기') && !document.body.innerText.includes('경력')",
    ),
    true,
  );
  const emptyProducts = await readClearance();
  writeFileSync(
    join(outDir, "empty-products-clearance.json"),
    JSON.stringify(emptyProducts, null, 2),
  );
  await shot("counselor-empty-products.png");
  assert.equal(emptyProducts.barHeight, 0);
  assert.equal(emptyProducts.productId, null);
  assert.ok(
    Math.abs(emptyProducts.scrollSpace) <= 2,
    JSON.stringify(emptyProducts),
  );
  if (emptyProducts.scrollable) {
    assert.ok(
      emptyProducts.gap >= -1 && emptyProducts.gap <= 8,
      JSON.stringify(emptyProducts),
    );
  }
  await go("/consult/photo-fail");
  await until(
    () =>
      evaluate(
        "!!document.querySelector('[aria-label=\"상담사 사진 자리\"] img')",
      ),
    "photo fallback",
  );
  assert.match(
    await evaluate(
      "document.querySelector('[aria-label=\"상담사 사진 자리\"] img').src",
    ),
    /logo-angel-mark\.png/,
  );

  await evaluate(`(() => {
    const back = document.querySelector('[aria-label="뒤로"]');
    back.focus();
    return true;
  })()`);
  for (let step = 0; step < 6; step += 1) {
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
    const focused = await evaluate(`(() => {
      const node = document.activeElement;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const host = node.closest("label, a, button") || node;
      const hostStyle = getComputedStyle(host);
      return {
        tag: node.tagName,
        type: node.getAttribute("type"),
        height: Math.round(box.height),
        width: Math.round(box.width),
        hostHeight: Math.round(host.getBoundingClientRect().height),
        outline: style.outlineStyle !== "none" ? style.outlineStyle : hostStyle.outlineStyle,
      };
    })()`);
    if (focused.type === "radio") {
      assert.ok(focused.hostHeight >= 44, JSON.stringify(focused));
      assert.notEqual(focused.outline, "none");
      break;
    }
    if (step === 5)
      assert.equal(focused.type, "radio", JSON.stringify(focused));
  }

  await go("/");
  await waitText("추천");
  await waitText("신규");
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-app-bar]"), 1);
  assert.equal(
    await evaluate(`(() => {
      const tabs = document.querySelector('[role="tablist"]');
      const reserve = [...document.querySelectorAll("a")].some((node) =>
        node.checkVisibility() && node.textContent.includes("전화 상담 예약"),
      );
      return !!tabs && !!document.querySelector(".cursor-grab") && reserve;
    })()`),
    true,
  );
  await clickVisible('a[href="/consult/both"]');
  await until(
    () => evaluate("location.pathname === '/consult/both'"),
    "home detail",
  );
  assert.equal(await visibleCount("[data-site-header]"), 0);
  await evaluate("history.back()");
  await until(() => evaluate("location.pathname === '/'"), "back home");
  await waitText("추천");
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-counselor-header]"), 0);

  await go("/stores");
  await waitText("동성로 테스트 매장");
  assert.equal(await visibleCount("[data-site-header]"), 1);
  assert.equal(await visibleCount("[data-app-bar]"), 1);
  assert.equal(await visibleCount("[data-counselor-header]"), 0);

  const response = await fetch(`${fakeUrl}/fixture-control?emptySaju=1`, {
    method: "POST",
  });
  assert.equal(response.ok, true);
  await go("/consult?type=saju");
  await waitText("해당 분야 상담사가 아직 없어요.");
  assert.equal(
    await evaluate("document.body.innerText.includes('선생님 0명')"),
    true,
  );
  await fetch(`${fakeUrl}/fixture-control?emptySaju=0`, { method: "POST" });

  await emulate({ width: 390, height: 844, fine: false });
  await go("/consult");
  await waitText(longName);
  await shot("consult-390-compare.png", true);
  await go("/consult/both");
  await waitText("선생님 소개");
  await shot("counselor-390-compare.png", true);

  const viewports = [
    ["360", 360, 844, false],
    ["390", 390, 844, false],
    ["430", 430, 844, false],
    ["768", 768, 1024, false],
    ["1024", 1024, 1366, false],
    ["pc-1280", 1280, 900, true],
  ];
  const results = [];
  for (const [name, width, height, fine] of viewports) {
    await emulate({ width, height, fine });
    await go("/consult");
    await waitText("선생님 4명");
    const list = await measure();
    await shot(`consult-${name}.png`);
    await go("/consult/both");
    await waitText("선생님 소개");
    const detail = await measure();
    const targets = await evaluate(`(() => {
      const nodes = [
        document.querySelector('[aria-label="뒤로"]'),
        document.querySelector("[data-booking-bar] a"),
      ];
      return nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
    })()`);
    await shot(`counselor-${name}.png`);
    const clearance = await readClearance();
    await shot(`counselor-clearance-${name}.png`);
    assertLongSelection(clearance);
    assertBarClearance(clearance, `viewport ${name}`);
    results.push({ name, list, detail, targets, clearance });
    assert.equal(list.fine, fine);
    assert.equal(detail.fine, fine);
    assert.equal(list.overflow, false, JSON.stringify(list));
    assert.equal(detail.overflow, false, JSON.stringify(detail));
    assert.equal(detail.bar, detail.app);
    assert.ok(targets.every((item) => item.width >= 44 && item.height >= 44));
    if (fine) {
      assert.equal(list.app, 560);
      assert.equal(list.columns, 1);
      assert.equal(detail.app, 560);
    } else if (width >= 768) {
      assert.equal(list.app, width);
      assert.equal(list.columns, 2);
      assert.equal(detail.app, width);
    } else {
      assert.equal(list.app, width);
      assert.equal(list.columns, 1);
      assert.equal(detail.app, width);
    }
  }
  writeFileSync(
    join(outDir, "measurements.json"),
    JSON.stringify(results, null, 2),
  );
  console.log("PASS design v2 consult browser");
} finally {
  if (chrome) await chrome.close();
  stop(app);
  await new Promise((done) => fixture.close(done));
}
