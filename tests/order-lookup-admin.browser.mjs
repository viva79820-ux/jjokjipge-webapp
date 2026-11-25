// 격리된 HTTP 모형으로 주문 조회·관리 흐름과 360px/PC 560px 화면을 확인한다.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, delay, stop, until } from "./notices-browser-tools.mjs";

const adminId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000001";
const orderNo = "O-20261125-0001";
const customerEmail = "buyer@example.invalid";
const user = {
  id: adminId,
  aud: "authenticated",
  role: "authenticated",
  email: "admin@example.invalid",
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  sub: adminId,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only")
  .update(`${jwtHead}.${jwtBody}`)
  .digest("base64url")}`;
let sequence = 0;
const order = {
  id: orderId,
  order_no: orderNo,
  request_key: "30000000-0000-4000-8000-000000000001",
  user_id: null,
  customer_name: "테스트 주문자",
  customer_phone: "010-1234-5678",
  customer_email: customerEmail,
  postal_code: "41911",
  address_line1: "대구광역시 중구 테스트로 1",
  address_line2: "테스트 101호",
  subtotal: 24000,
  shipping_fee: 3000,
  total: 27000,
  status: "pending_payment",
  tracking_number: null,
  created_at: "2026-11-25T01:00:00.000Z",
  updated_at: "2026-11-25T01:00:00.000Z",
  payment_confirmed_at: null,
  shipped_at: null,
  completed_at: null,
  cancelled_at: null,
  order_items: [
    {
      line_no: 1,
      product_name: "테스트 카드",
      unit_price: 12000,
      quantity: 2,
      line_total: 24000,
    },
  ],
};

function roleOf(req) {
  const authorization = req.headers.authorization || "";
  if (authorization === `Bearer ${token}`) return "admin";
  if (
    authorization.startsWith("Bearer ") &&
    authorization !== "Bearer fixture-public"
  )
    return "service";
  return "anon";
}

function send(res, status, body, count) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (count !== undefined) res.setHeader("Content-Range", `0-0/${count}`);
  res.end(JSON.stringify(body));
}

function matches(params) {
  for (const [key, value] of params) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    if (value.startsWith("eq.") && String(order[key]) !== value.slice(3))
      return false;
  }
  return true;
}

const fixture = createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, {});
  }),
);

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  if (process.env.ORDER_BROWSER_TRACE)
    console.log("FIXTURE", req.method, url.pathname, url.search);
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
  const role = roleOf(req);
  if (table === "profiles") {
    return send(
      res,
      role === "admin" ? 200 : 401,
      role === "admin" ? [{ role: "admin" }] : { message: "permission" },
    );
  }
  if (table !== "orders") return send(res, 200, []);
  if (req.method === "GET" || req.method === "HEAD") {
    if (role !== "admin" && role !== "service") return send(res, 401, []);
    const rows = matches(url.searchParams) ? [order] : [];
    if (req.method === "HEAD") {
      res.setHeader("Content-Range", `*/${rows.length}`);
      res.end();
      return;
    }
    return send(res, 200, rows, rows.length);
  }
  if (req.method !== "PATCH" || role !== "admin")
    return send(res, 401, { message: "permission" });
  if (!matches(url.searchParams)) return send(res, 200, []);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const patch = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  const previous = order.status;
  if (previous === "pending_payment" && patch.status === "payment_confirmed") {
    order.payment_confirmed_at = new Date().toISOString();
  } else if (
    previous === "payment_confirmed" &&
    patch.status === "shipping" &&
    patch.tracking_number
  ) {
    order.tracking_number = patch.tracking_number;
    order.shipped_at = new Date().toISOString();
  } else if (previous === "shipping" && patch.status === "completed") {
    order.completed_at = new Date().toISOString();
  } else if (
    ["pending_payment", "payment_confirmed", "shipping"].includes(previous) &&
    patch.status === "cancelled"
  ) {
    order.cancelled_at = new Date().toISOString();
  } else {
    return send(res, 400, {
      code: "P0001",
      message: "ORDER_STATUS_TRANSITION_INVALID",
    });
  }
  order.status = patch.status;
  sequence += 1;
  order.updated_at = `2026-11-25T02:00:00.${String(sequence).padStart(3, "0")}Z`;
  return send(res, 200, [{ id: orderId }]);
}

// 이 저장소의 브라우저 테스트용 로컬 Supabase 주소와 같은 고정 포트다.
const fixturePort = 10808;
await new Promise((resolve) =>
  fixture.listen(fixturePort, "127.0.0.1", resolve),
);
const appPort = 4337;
const base = `http://127.0.0.1:${appPort}`;
const screenshotDir = join(process.cwd(), "screenshots", "orders-lookup-admin");
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixturePort}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
  NOTICES_MOCK_TRACE: process.env.ORDER_BROWSER_TRACE ? "1" : "",
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
    {
      env,
      windowsHide: true,
      stdio: process.env.ORDER_BROWSER_TRACE
        ? ["ignore", "ignore", "pipe"]
        : "ignore",
    },
  );
  if (process.env.ORDER_BROWSER_TRACE)
    app.stderr?.on("data", (chunk) =>
      console.error("NEXT", chunk.toString().trim()),
    );
  await until(
    async () => {
      try {
        return (await fetch(`${base}/shop/order/lookup`)).ok;
      } catch {
        return false;
      }
    },
    "app",
    90000,
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
  const confirm = async () => {
    await text("확인 후 처리");
    await page.button("확인 후 처리");
    await until(
      () =>
        page.evaluate(
          "![...document.querySelectorAll('dialog')].some((node) => node.open && node.checkVisibility())",
        ),
      "modal closed",
    );
  };
  const submitLookup = async () => {
    await page.fill("orderNo", orderNo);
    await page.fill("email", customerEmail);
    await page.button("주문 조회하기");
    await text("테스트 카드");
  };

  await emulate({ width: 360, fine: false });
  await page.go(`${base}/shop/order/lookup`);
  await submitLookup();
  await text("입금 대기");
  let box = await measure();
  assert.equal(box.shellWidth, 360);
  assert.equal(box.overflow, false);
  assert.deepEqual(box.controls, []);
  assert.equal(box.fine, false);
  await screenshot("customer-lookup-360.png");

  await page.go(`${base}/admin/orders/${orderId}`);
  await text(orderNo);
  await page.button("입금 확인");
  await confirm();
  await until(() => order.status === "payment_confirmed", "payment confirmed");
  await page.button("배송 중으로 변경");
  await page.fill("trackingNumber", "TRACK-1234");
  await confirm();
  await until(() => order.status === "shipping", "shipping");
  await text("TRACK-1234");
  box = await measure();
  assert.equal(box.shellWidth, 360);
  assert.equal(box.overflow, false);
  assert.deepEqual(box.controls, []);
  await screenshot("admin-detail-360.png");

  await page.go(`${base}/shop/order/lookup`);
  await submitLookup();
  await text("TRACK-1234");
  await text("배송 중");

  await emulate({ width: 1280, fine: true });
  await page.go(`${base}/admin/orders/${orderId}`);
  await text("TRACK-1234");
  box = await measure();
  assert.equal(box.shellWidth, 560);
  assert.equal(box.overflow, false);
  assert.deepEqual(box.controls, []);
  assert.equal(box.fine, true);
  await screenshot("admin-detail-pc560.png");
  await page.button("주문 완료");
  await confirm();
  await until(() => order.status === "completed", "completed");

  await page.go(`${base}/shop/order/lookup`);
  await submitLookup();
  await text("완료");
  box = await measure();
  assert.equal(box.shellWidth, 560);
  assert.equal(box.overflow, false);
  assert.deepEqual(box.controls, []);
  assert.equal(box.fine, true);
  await screenshot("customer-lookup-pc560.png");
  console.log("ORDER_LOOKUP_ADMIN_BROWSER_OK");
} catch (error) {
  if (page) {
    try {
      console.error("ORDER_BROWSER_URL", await page.evaluate("location.href"));
      console.error(
        "ORDER_BROWSER_TEXT",
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
      // Windows에서 종료 직후 Chromium 프로필 잠금이 잠시 남을 수 있다.
      if (error?.code !== "EPERM") throw error;
    }
  }
  stop(app);
  fixture.close();
}
