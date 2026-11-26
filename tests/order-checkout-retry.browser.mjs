// 격리된 HTTP 모형이다. 운영 DB에 주문을 만들지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, delay, stop, until } from "./notices-browser-tools.mjs";

const productId = "20000000-0000-4000-8000-000000000001";
const draftKey = "jjokjipge:order-checkout-draft";
const cartKey = "jjokjipge:shop-cart";
const draft = {
  name: "테스트주문자",
  phone: "010-1234-5678",
  email: "buyer@example.invalid",
  postalCode: "41911",
  addressLine1: "대구광역시 중구 테스트로 1",
  addressLine2: "테스트 101호",
};
const product = {
  id: productId,
  name: "테스트 카드",
  description: "모형 상품 설명",
  price: 12000,
  image_path: null,
  image_alt: null,
  is_published: true,
  is_sold_out: false,
  sort_order: 0,
  created_at: "2026-11-25T00:00:00.000Z",
};
let orderWrites = 0;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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
  if (url.pathname.includes("/rpc/")) {
    orderWrites += 1;
    send(res, 400, { message: "mock refuses orders" });
    return;
  }
  if (url.pathname.endsWith("/products")) {
    send(res, 200, [product]);
    return;
  }
  if (url.pathname.startsWith("/auth/")) {
    send(res, 401, { message: "no session" });
    return;
  }
  send(res, 200, []);
});

const fixturePort = 10821;
await new Promise((resolve) =>
  fixture.listen(fixturePort, "127.0.0.1", resolve),
);
const appPort = 4343;
const base = `http://127.0.0.1:${appPort}`;
const orderUrl = `${base}/shop/order`;
const screenshotDir = join(
  process.cwd(),
  "screenshots",
  "order-checkout-retry",
);
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
  const { spawn } = await import("node:child_process");
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
        return (await fetch(orderUrl)).ok;
      } catch {
        return false;
      }
    },
    "app",
    120000,
  );
  page = await browser();
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
      return {
        shellWidth: Math.round(shell.getBoundingClientRect().width),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
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
  const seed = () =>
    page.evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(cartKey)}, ${JSON.stringify(
        JSON.stringify([{ id: productId, quantity: 2 }]),
      )});
      sessionStorage.setItem(${JSON.stringify(draftKey)}, ${JSON.stringify(
        JSON.stringify(draft),
      )});
    })()`);
  const fieldValue = (name) =>
    page.evaluate(
      `document.querySelector('[name=${JSON.stringify(name)}]')?.value ?? ""`,
    );
  const waitDraft = async (name = draft.name) => {
    await until(
      async () => (await fieldValue("name")) === name,
      `draft name ${name}`,
    );
    assert.equal(await fieldValue("phone"), draft.phone);
    assert.equal(await fieldValue("email"), draft.email);
    assert.equal(await fieldValue("postalCode"), draft.postalCode);
    assert.equal(await fieldValue("addressLine1"), draft.addressLine1);
    assert.equal(await fieldValue("addressLine2"), draft.addressLine2);
    assert.equal(
      await page.evaluate(
        "document.querySelector('[name=privacyConsent]').checked",
      ),
      false,
    );
    assert.match(
      await fieldValue("requestKey"),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  };

  await emulate({ width: 360, fine: false });
  await page.go(orderUrl);
  await seed();
  await page.go(orderUrl);
  await waitDraft();
  await page.fill("name", "테스트주문자수정");
  await page.go(orderUrl);
  await waitDraft("테스트주문자수정");
  let box = await measure();
  assert.equal(box.shellWidth, 360);
  assert.equal(box.overflow, false);
  assert.equal(box.fine, false);
  await screenshot("order-checkout-360.png");

  await emulate({ width: 1280, fine: true });
  await until(
    async () => (await fieldValue("name")) === "테스트주문자수정",
    "pc draft",
  );
  box = await measure();
  assert.equal(box.shellWidth, 560);
  assert.equal(box.overflow, false);
  assert.equal(box.fine, true);
  await screenshot("order-checkout-pc560.png");

  await page.evaluate(
    "document.querySelector('a[href=\"/shop/cart\"]').click()",
  );
  await until(
    () =>
      page.evaluate(
        `sessionStorage.getItem(${JSON.stringify(draftKey)}) === null`,
      ),
    "draft cleared",
  );
  assert.equal(orderWrites, 0);
  console.log("ORDER_CHECKOUT_RETRY_BROWSER_OK");
} catch (error) {
  if (page) {
    try {
      console.error("ORDER_CHECKOUT_URL", await page.evaluate("location.href"));
      console.error(
        "ORDER_CHECKOUT_TEXT",
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
