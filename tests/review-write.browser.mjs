// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, stop, until } from "./notices-browser-tools.mjs";

const userId = "22222222-2222-4222-8222-222222222222";
const completedId = "11111111-1111-4111-8111-111111111111";
const confirmedId = "55555555-5555-4555-8555-555555555555";
const reviewId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const requests = [];
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "member@example.invalid",
  email_confirmed_at: "2026-11-01T00:00:00.000Z",
};
const reservations = [
  {
    id: completedId,
    reservation_no: "R-20261120-0007",
    status: "completed",
    starts_at: "2026-11-20T01:00:00.000Z",
    ends_at: "2026-11-20T01:30:00.000Z",
    product_name: "사주 30분",
    user_id: userId,
    counselor_id: "44444444-4444-4444-8444-444444444444",
    customer_name: "예약 고객",
    counselors: { name: "상담사 A" },
  },
  {
    id: confirmedId,
    reservation_no: "R-20261121-0008",
    status: "confirmed",
    starts_at: "2026-11-21T02:00:00.000Z",
    ends_at: "2026-11-21T02:30:00.000Z",
    product_name: "타로 30분",
    user_id: userId,
    counselor_id: "44444444-4444-4444-8444-444444444444",
    customer_name: "예약 고객",
    counselors: { name: "상담사 A" },
  },
];
const myReviews = [
  {
    id: reviewId,
    reservation_id: "66666666-6666-4666-8666-666666666666",
    counselor_id: "44444444-4444-4444-8444-444444444444",
    counselor_name: "상담사 B",
    rating: 4,
    body: "상담 내용을 짧게 남긴 비공개 후기입니다.",
    is_published: false,
    publish_consent: true,
    hidden_by_admin: true,
    created_at: "2026-11-24T15:00:00.000Z",
    updated_at: "2026-11-24T15:10:00.000Z",
  },
];

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  sub: userId,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only")
  .update(`${jwtHead}.${jwtBody}`)
  .digest("base64url")}`;

const fixture = createServer((request, response) => {
  const url = new URL(request.url, "http://fixture.invalid");
  requests.push(`${request.method} ${url.pathname}`);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,POST,PATCH,DELETE,OPTIONS",
  );
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    response.end(JSON.stringify(user));
    return;
  }
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    response.end(
      request.headers.accept?.includes("object+json")
        ? JSON.stringify({ name: "회원 A", phone: null, role: "user" })
        : JSON.stringify([{ name: "회원 A", phone: null, role: "user" }]),
    );
    return;
  }
  if (table === "reservations") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const selected = id
      ? reservations.filter((row) => row.id === id)
      : reservations;
    if (request.headers.accept?.includes("object+json")) {
      response.end(JSON.stringify(selected[0] ?? null));
      return;
    }
    response.setHeader(
      "Content-Range",
      `0-${Math.max(selected.length - 1, 0)}/${selected.length}`,
    );
    response.end(JSON.stringify(selected));
    return;
  }
  if (url.pathname.endsWith("/rpc/list_my_reviews")) {
    response.end(JSON.stringify(myReviews));
    return;
  }
  response.end("[]");
});

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const appPort = 4342;
const base = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
};
const app = spawn(
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
let page;
try {
  await until(async () => {
    try {
      const response = await fetch(`${base}/login`);
      return response.ok;
    } catch {
      return false;
    }
  }, "review write app", 120000);

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
    value: `base64-${encode(session)}`,
    url: base,
    path: "/",
  });
  const shotDir = join("tmp", "review-write");
  mkdirSync(shotDir, { recursive: true });
  const screenshot = async (name) => {
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const text = () => page.evaluate("document.body.innerText");
  const layout = async (width, path) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await page.go(`${base}${path}`);
    await until(
      () => page.evaluate("document.body.innerText.includes('내 후기')"),
      path,
    );
    const metrics = await page.evaluate(`(()=>{
      const shell=document.querySelector('[data-app-shell]');
      const write=[...document.querySelectorAll('a')].filter(link=>link.textContent.trim()==='후기 쓰기');
      return {
        overflow:document.documentElement.scrollWidth>innerWidth,
        shellWidth:Math.round(shell.getBoundingClientRect().width),
        write:write.length,
        writeInside:write.every(link=>link.getBoundingClientRect().left>=0&&link.getBoundingClientRect().right<=innerWidth&&link.getBoundingClientRect().height>=44),
      };
    })()`);
    assert.equal(metrics.overflow, false, `${width} overflow`);
    assert.equal(metrics.write, 1, `${width} write buttons`);
    assert.equal(metrics.writeInside, true, `${width} write button`);
    if (width >= 1000) assert.equal(metrics.shellWidth, 560);
    else assert.equal(metrics.shellWidth, width);
    return metrics;
  };

  await layout(360, "/mypage");
  const narrow = await text();
  assert.match(narrow, /상담 완료/);
  assert.match(narrow, /예약 확정/);
  assert.match(narrow, /후기 쓰기/);
  assert.match(narrow, /내 후기/);
  assert.match(narrow, /상담사 B 선생님/);
  assert.match(narrow, /관리자에 의해 숨겨짐/);
  assert.match(narrow, /2026년 11월 25일/);
  await screenshot("mypage-360.png");

  await page.go(`${base}/mypage/reviews/new/${completedId}`);
  await until(
    () => page.evaluate("document.body.innerText.includes('후기 공개에 동의')"),
    "write form",
  );
  const writeText = await text();
  assert.match(writeText, /상담 후기 작성/);
  assert.match(writeText, /상담사 A 선생님/);
  assert.match(writeText, /사주 30분/);
  assert.equal(writeText.includes("작성자"), false);
  const writeLayout = await page.evaluate(`(()=>{
    const shell=document.querySelector('[data-app-shell]');
    return {
      overflow:document.documentElement.scrollWidth>innerWidth,
      shellWidth:Math.round(shell.getBoundingClientRect().width),
    };
  })()`);
  assert.equal(writeLayout.overflow, false);
  assert.equal(writeLayout.shellWidth, 360);
  await screenshot("write-360.png");

  await page.go(`${base}/mypage/reviews/${reviewId}/edit`);
  await until(
    () =>
      page.evaluate(
        "document.body.innerText.includes('관리자에 의해 숨겨짐')",
      ),
    "edit form",
  );
  await screenshot("edit-360.png");

  await layout(1200, "/mypage");
  await screenshot("mypage-560.png");
  await page.go(`${base}/mypage/reviews/new/${completedId}`);
  await until(
    () => page.evaluate("document.body.innerText.includes('후기 등록')"),
    "write form desktop",
  );
  const desktop = await page.evaluate(`(()=>{
    const shell=document.querySelector('[data-app-shell]');
    return {
      overflow:document.documentElement.scrollWidth>innerWidth,
      shellWidth:Math.round(shell.getBoundingClientRect().width),
    };
  })()`);
  assert.equal(desktop.overflow, false);
  assert.equal(desktop.shellWidth, 560);
  await screenshot("write-560.png");
  console.log("PASS review write 360 and PC 560");
} catch (error) {
  console.error(requests.slice(-30).join("\n"));
  throw error;
} finally {
  try {
    await page?.close();
  } catch {}
  stop(app);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
