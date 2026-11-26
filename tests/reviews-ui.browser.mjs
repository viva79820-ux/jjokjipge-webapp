// Isolated HTTP fixture only. No real Supabase rows or credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";

const userId = "11111111-1111-4111-8111-111111111111";
const counselorId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const rows = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    counselor_id: counselorId,
    product_id: null,
    author_name: "홍길동",
    rating: 5,
    body: "공개 상담 후기입니다. 모바일에서도 자연스럽게 줄이 바뀌는 긴 문장을 확인합니다.".repeat(
      3,
    ),
    is_published: true,
    created_at: "2026-11-25T00:00:00.000000+00:00",
    updated_at: "2026-11-25T00:00:00.000000+00:00",
    counselor: { name: "상담사 A" },
    product: null,
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    counselor_id: null,
    product_id: productId,
    author_name: "김천사",
    rating: 3,
    body: "관리자만 먼저 볼 수 있는 숨김 상품 후기입니다.",
    is_published: false,
    created_at: "2026-11-24T00:00:00.000000+00:00",
    updated_at: "2026-11-24T00:00:00.000000+00:00",
    counselor: null,
    product: { name: "테스트 타로 상품" },
  },
];
let sequence = 0;
const issues = [];

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const user = {
  id: userId,
  sub: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
};
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only")
  .update(`${jwtHead}.${jwtBody}`)
  .digest("base64url")}`;

const fixture = createServer((request, response) =>
  handle(request, response).catch((error) => {
    issues.push(error instanceof Error ? error.message : "fixture failure");
    response.writeHead(500);
    response.end("{}");
  }),
);

async function handle(request, response) {
  const url = new URL(request.url, "http://fixture.invalid");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PATCH,OPTIONS");
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
    response.end(JSON.stringify({ role: "admin" }));
    return;
  }
  assert.equal(table, "reviews");

  let selected = rows.filter((row) =>
    [...url.searchParams].every(
      ([key, value]) =>
        !value.startsWith("eq.") ||
        String(row[key]) === value.slice("eq.".length),
    ),
  );
  if (request.method === "PATCH") {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const patch = JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(Object.keys(patch), ["is_published"]);
    for (const row of selected) {
      row.is_published = patch.is_published;
      row.updated_at = `2026-11-25T00:00:01.${String(++sequence).padStart(6, "0")}+00:00`;
    }
  }
  const order = url.searchParams.get("order");
  if (order)
    selected.sort((left, right) => {
      for (const part of order.split(",")) {
        const [column, direction] = part.split(".");
        if (left[column] === right[column]) continue;
        const compared = left[column] > right[column] ? 1 : -1;
        return direction === "desc" ? -compared : compared;
      }
      return 0;
    });
  const count = selected.length;
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Number(url.searchParams.get("limit") || 20);
  selected = selected.slice(offset, offset + limit);
  response.setHeader(
    "Content-Range",
    `0-${Math.max(selected.length - 1, 0)}/${count}`,
  );
  const columns = url.searchParams.get("select")?.split(",");
  let result =
    request.method === "PATCH"
      ? selected.map(({ id }) => ({ id }))
      : selected.map((row) =>
          columns
            ? Object.fromEntries(
                columns.map((column) => {
                  const key = column.includes(":")
                    ? column.split(":")[0]
                    : column;
                  return [key, row[key]];
                }),
              )
            : row,
        );
  if (request.headers.accept?.includes("object+json"))
    result = result[0] ?? null;
  response.end(JSON.stringify(result));
}

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const appPort = 4332;
const base = `http://127.0.0.1:${appPort}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
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
  app = server(appPort, env);
  await until(async () => {
    try {
      return (await fetch(`${base}/reviews`)).ok;
    } catch {
      return false;
    }
  }, "review app");

  page = await browser();
  const go = async (path) => {
    await page.go(`${base}${path}`);
  };
  const contains = (text) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(text)})`,
        ),
      text,
    );
  const screenshot = async (name) => {
    const directory = process.env.REVIEWS_SCREENSHOT_DIR;
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(directory, name), Buffer.from(data, "base64"));
  };
  const metrics = async (width) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await go("/reviews");
    await contains("공개 상담 후기");
    const layout = await page.evaluate(`(()=>{
      const shell=document.querySelector('[data-app-shell]');
      const links=[...document.querySelectorAll('[data-naver-review-link]')];
      return {
        overflow:document.documentElement.scrollWidth>innerWidth,
        shellWidth:Math.round(shell.getBoundingClientRect().width),
        links:links.map(link=>({
          text:link.textContent.trim(),
          target:link.target,
          rel:link.rel,
          height:Math.round(link.getBoundingClientRect().height),
          inside:link.getBoundingClientRect().left>=0&&link.getBoundingClientRect().right<=innerWidth,
        })),
        cards:[...document.querySelectorAll('[data-review-card]')].length,
      };
    })()`);
    assert.equal(layout.overflow, false);
    assert.equal(layout.cards, 1);
    assert.equal(layout.links.length, 2);
    assert.ok(layout.links.every((link) => link.height >= 44 && link.inside));
    assert.ok(
      layout.links.every(
        (link) =>
          link.target === "_blank" && link.rel === "noopener noreferrer",
      ),
    );
    if (width >= 1000) assert.equal(layout.shellWidth, 560);
    else assert.equal(layout.shellWidth, width);
    return layout;
  };

  await metrics(360);
  assert.equal(
    await page.evaluate("document.body.innerText.includes('숨김 상품 후기')"),
    false,
  );
  assert.equal(
    await page.evaluate(
      "document.querySelector('[aria-label=\"별점 5점 중 5점\"]')!==null",
    ),
    true,
  );
  await screenshot("reviews-public-360.png");
  await metrics(390);
  await metrics(1200);

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
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/reviews");
  await contains("숨김 상품 후기");
  assert.equal(
    await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await page.button("공개로 전환");
  await until(
    () =>
      page.evaluate(
        `["후기를 공개했습니다.","관리자 권한이 필요합니다.","변경 결과를 확인하지 못했습니다.","다른 작업으로 후기가 변경됐습니다.","연결 오류가 발생했습니다."].some(text=>document.body.innerText.includes(text))`,
      ),
    "visibility action result",
  );
  const actionMessage = await page.evaluate(
    `["후기를 공개했습니다.","관리자 권한이 필요합니다.","변경 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요.","다른 작업으로 후기가 변경됐습니다. 새로고침해 주세요.","연결 오류가 발생했습니다. 목록을 새로고침해 주세요."].find(text=>document.body.innerText.includes(text))`,
  );
  assert.equal(actionMessage, "후기를 공개했습니다.");
  await until(
    () =>
      page.evaluate(
        "document.body.innerText.includes('숨김으로 전환')&&document.body.innerText.includes('테스트 타로 상품')",
      ),
    "published review refreshed",
  );
  assert.equal(rows[1].is_published, true);
  await screenshot("reviews-admin-560.png");

  rows.forEach((row) => {
    row.is_published = false;
  });
  await go("/reviews");
  await contains("아직 공개된 후기가 없어요.");
  assert.equal(
    await page.evaluate(
      "document.querySelectorAll('[data-review-card]').length",
    ),
    0,
  );
  assert.deepEqual(issues, []);
  console.log(
    "PASS review public/admin, Naver links, empty state, 360/390/PC 560",
  );
} finally {
  try {
    try {
      await page?.close();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("EPERM"))
        throw error;
    }
  } finally {
    stop(app);
    fixture.closeAllConnections();
    await new Promise((resolve) => fixture.close(resolve));
  }
}
