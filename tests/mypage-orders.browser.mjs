// 격리된 HTTP 모형으로 마이페이지 주문 내역과 360px/PC 560px 화면을 확인한다.
// 운영 주문은 만들지 않는다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, delay, stop, until } from "./notices-browser-tools.mjs";

const memberId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const orderNo = "O-20261126-0001";
const otherNo = "O-20261126-0002";
const user = {
  id: memberId,
  aud: "authenticated",
  role: "authenticated",
  email: "member@example.invalid",
  email_confirmed_at: "2026-11-01T00:00:00.000Z",
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  sub: memberId,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only")
  .update(`${jwtHead}.${jwtBody}`)
  .digest("base64url")}`;

function orderRow(patch) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: memberId,
    order_no: orderNo,
    created_at: "2026-11-26T00:01:00.000Z",
    status: "pending_payment",
    postal_code: "41911",
    address_line1: "대구광역시 중구 테스트로 1",
    address_line2: "테스트 101호",
    subtotal: 12000,
    shipping_fee: 0,
    total: 12000,
    tracking_number: null,
    order_items: [
      {
        line_no: 1,
        product_name: "테스트 카드",
        unit_price: 12000,
        quantity: 1,
        line_total: 12000,
      },
    ],
    ...patch,
  };
}

const state = { rows: [] };
const orderReads = [];

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function visibleRows(params) {
  let rows = state.rows.filter((row) => row.user_id === memberId);
  for (const [key, value] of params) {
    if (!value.startsWith("eq.")) continue;
    const expected = value.slice(3);
    if (key === "user_id")
      rows = rows.filter((row) => row.user_id === expected);
    if (key === "order_no")
      rows = rows.filter((row) => row.order_no === expected);
  }
  return rows;
}

const fixture = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (req.headers.authorization !== `Bearer ${token}`)
      return send(res, 401, { message: "invalid" });
    return send(res, 200, user);
  }
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles")
    return send(res, 200, [{ id: memberId, name: "회원 A" }]);
  if (table !== "orders") return send(res, 200, []);
  const authorization = req.headers.authorization || "";
  const apiKey = req.headers.apikey || "";
  orderReads.push({
    authorization,
    apiKey,
    search: url.search,
  });
  if (authorization === "Bearer fixture-secret" || apiKey === "fixture-secret")
    return send(res, 200, state.rows);
  if (authorization !== `Bearer ${token}`) return send(res, 200, []);
  return send(res, 200, visibleRows(url.searchParams));
});

const fixturePort = 10818;
await new Promise((resolve) =>
  fixture.listen(fixturePort, "127.0.0.1", resolve),
);
const appPort = 4348;
const base = `http://127.0.0.1:${appPort}`;
const screenshotDir = join(process.cwd(), "screenshots", "mypage-orders");
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
};
let app;
let page;

try {
  app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    { env, windowsHide: true, stdio: "ignore" },
  );
  await until(
    async () => {
      try {
        return (await fetch(`${base}/login`)).ok;
      } catch {
        return false;
      }
    },
    "app",
    180000,
  );
  page = await browser();
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
  const text = (value) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(value)})`,
        ),
      value,
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
      const controls = [...document.querySelectorAll("a,button,input,select,textarea")]
        .filter((node) => node.checkVisibility() && node.type !== "hidden")
        .filter((node) => node.getBoundingClientRect().height < 44)
        .map((node) => node.tagName + ":" + Math.round(node.getBoundingClientRect().height));
      return {
        shellWidth: Math.round(shell.getBoundingClientRect().width),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        controls,
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
      };
    })()`);
  const screenshot = async (name) => {
    mkdirSync(screenshotDir, { recursive: true });
    await page.evaluate(
      "document.querySelectorAll('nextjs-portal').forEach((node) => node.remove())",
    );
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(screenshotDir, name), Buffer.from(data, "base64"));
  };
  const checkFrame = async (width, fine) => {
    const box = await measure();
    assert.equal(box.shellWidth, width);
    assert.equal(box.overflow, false);
    assert.deepEqual(box.controls, []);
    assert.equal(box.fine, fine);
  };

  await emulate({ width: 360, fine: false });
  await page.go(`${base}/mypage`);
  await text("회원 계정으로 주문한 내역이 없어요.");
  await checkFrame(360, false);
  await screenshot("mypage-empty-360.png");

  await emulate({ width: 1280, fine: true });
  await page.go(`${base}/mypage`);
  await text("회원 계정으로 주문한 내역이 없어요.");
  await checkFrame(560, true);
  await screenshot("mypage-empty-pc560.png");

  state.rows = [
    orderRow(),
    orderRow({
      id: "44444444-4444-4444-8444-444444444444",
      user_id: otherId,
      order_no: otherNo,
      address_line1: "비밀 주소",
      order_items: [
        {
          line_no: 1,
          product_name: "비밀 상품",
          unit_price: 9000,
          quantity: 1,
          line_total: 9000,
        },
      ],
    }),
  ];
  await emulate({ width: 360, fine: false });
  await page.go(`${base}/mypage`);
  await text("테스트 카드");
  await text("12,000원");
  await text("입금 대기");
  await text(orderNo);
  const listText = await page.evaluate("document.body.innerText");
  assert.equal(listText.includes("비밀 상품"), false);
  assert.equal(listText.includes(otherNo), false);
  assert.equal(listText.includes("비밀 주소"), false);
  await checkFrame(360, false);
  await screenshot("mypage-list-360.png");

  await page.go(`${base}/mypage/orders/${orderNo}`);
  await text("입금 안내");
  await text("배송지");
  await text("송장번호");
  await text("테스트 101호");
  await text("배송 시작 후 확인할 수 있어요.");
  await text("[입금 계좌 준비 중]");
  const detailText = await page.evaluate("document.body.innerText");
  assert.equal(detailText.includes("비밀 주소"), false);
  await checkFrame(360, false);
  await screenshot("mypage-detail-360.png");

  await page.go(`${base}/mypage/orders/${otherNo}`);
  await text("주문을 찾을 수 없어요");
  const hiddenText = await page.evaluate("document.body.innerText");
  assert.equal(hiddenText.includes("비밀 주소"), false);
  assert.equal(hiddenText.includes("비밀 상품"), false);

  await emulate({ width: 1280, fine: true });
  await page.go(`${base}/mypage/orders/${orderNo}`);
  await text("입금 안내");
  await checkFrame(560, true);
  await screenshot("mypage-detail-pc560.png");

  assert.ok(orderReads.length > 0);
  assert.ok(
    orderReads.every(
      (read) =>
        read.authorization !== "Bearer fixture-secret" &&
        read.apiKey !== "fixture-secret",
    ),
  );
  assert.ok(
    orderReads.some((read) => read.search.includes(`user_id=eq.${memberId}`)),
  );
  console.log("MYPAGE_ORDERS_BROWSER_OK");
} catch (error) {
  if (page) {
    try {
      console.error("MYPAGE_BROWSER_URL", await page.evaluate("location.href"));
      console.error(
        "MYPAGE_BROWSER_TEXT",
        await page.evaluate("document.body?.innerText?.slice(0, 1800)"),
      );
    } catch {
      // 브라우저가 먼저 종료된 경우에는 원래 오류를 유지한다.
    }
  }
  throw error;
} finally {
  if (page) {
    try {
      await page.close();
    } catch (error) {
      if (error?.code !== "EPERM") throw error;
    }
  }
  stop(app);
  fixture.close();
}
