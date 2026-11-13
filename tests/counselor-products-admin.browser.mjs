// 격리된 HTTP 모형이다. 실제 Supabase 자격증명과 자료는 쓰지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";

const publicId = "11111111-1111-4111-8111-111111111111";
const hiddenId = "22222222-2222-4222-8222-222222222222";
const pendingId = "33333333-3333-4333-8333-333333333333";
const emptyId = "44444444-4444-4444-8444-444444444444";
const otherProductId = "55555555-5555-4555-8555-555555555555";
const longName = `테스트긴상품${"가".repeat(70)}`;
const longCounselor = `테스트상담사${"나".repeat(12)}`;
const counselors = [
  {
    id: publicId,
    slug: "test-public",
    name: longCounselor,
    field: "tarot",
    fields: ["tarot"],
    tags: ["테스트"],
    careers: [],
    intro: "테스트 소개",
    description: "테스트 상세",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 1,
    store_id: null,
    updated_at: "2026-11-11T00:00:00.000001+00:00",
  },
  {
    id: hiddenId,
    slug: "test-hidden",
    name: "테스트 숨은상담사",
    field: "saju",
    fields: ["saju"],
    tags: [],
    careers: [],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: false,
    approval_status: "approved",
    sort_order: 2,
    store_id: null,
    updated_at: "2026-11-11T00:00:00.000002+00:00",
  },
  {
    id: pendingId,
    slug: "test-pending",
    name: "테스트 미승인상담사",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: [],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: true,
    approval_status: "pending",
    sort_order: 3,
    store_id: null,
    updated_at: "2026-11-11T00:00:00.000003+00:00",
  },
  {
    id: emptyId,
    slug: "test-empty",
    name: "테스트 빈상담사",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: [],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 4,
    store_id: null,
    updated_at: "2026-11-11T00:00:00.000004+00:00",
  },
];
const products = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    counselor_id: publicId,
    name: longName,
    minutes: 40,
    price: 15000,
    sort_order: 0,
    is_active: true,
    updated_at: "2026-11-11T00:00:00.100001+00:00",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    counselor_id: publicId,
    name: "테스트 순서먼저",
    minutes: 30,
    price: 20000,
    sort_order: 5,
    is_active: true,
    updated_at: "2026-11-11T00:00:00.100002+00:00",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    counselor_id: publicId,
    name: "테스트 순서나중",
    minutes: 30,
    price: 20000,
    sort_order: 5,
    is_active: true,
    updated_at: "2026-11-11T00:00:00.100003+00:00",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    counselor_id: publicId,
    name: "테스트 비공개상품",
    minutes: 15,
    price: 5000,
    sort_order: 2,
    is_active: false,
    updated_at: "2026-11-11T00:00:00.100004+00:00",
  },
  {
    id: otherProductId,
    counselor_id: hiddenId,
    name: "테스트 숨은상담사상품",
    minutes: 30,
    price: 9000,
    sort_order: 1,
    is_active: true,
    updated_at: "2026-11-11T00:00:00.100005+00:00",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    counselor_id: pendingId,
    name: "테스트 미승인상품",
    minutes: 30,
    price: 8000,
    sort_order: 1,
    is_active: true,
    updated_at: "2026-11-11T00:00:00.100006+00:00",
  },
];
for (let index = 0; index < 17; index += 1)
  products.push({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`,
    counselor_id: publicId,
    name: `테스트 채움 ${index + 1}`,
    minutes: 30,
    price: 1000,
    sort_order: 10 + index,
    is_active: true,
    updated_at: `2026-11-11T00:00:01.${String(index).padStart(6, "0")}+00:00`,
  });
products.push({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-000000000099",
  counselor_id: publicId,
  name: "테스트 둘째쪽",
  minutes: 30,
  price: 1000,
  sort_order: 100,
  is_active: true,
  updated_at: "2026-11-11T00:00:02.000099+00:00",
});
let admin = true;
let listFail = false;
let loseResponse = false;
let writes = 0;
let seq = 0;
const saveTrace = [];
const stamp = () =>
  `2026-11-12T03:00:00.${String(++seq).padStart(6, "0")}+00:00`;
const uid = "99999999-9999-4999-8999-999999999999";
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" });
const jwtBody = encode({
  ...user,
  sub: uid,
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only").update(`${jwtHead}.${jwtBody}`).digest("base64url")}`;

function roleOf(req) {
  const header = req.headers.authorization || "";
  if (header === `Bearer ${token}`) return admin ? "admin" : "user";
  if (header === "Bearer fixture-secret") return "service";
  return "anon";
}
function matches(row, params) {
  for (const [key, value] of params)
    if (value.startsWith("eq.") && !key.includes(".")) {
      if (String(row[key]) !== value.slice(3)) return false;
    }
  return true;
}
function sortRows(rows, order) {
  if (!order) return rows;
  return [...rows].sort((left, right) => {
    for (const part of order.split(",")) {
      const [column, direction] = part.split(".");
      if (left[column] === right[column]) continue;
      const compared = left[column] > right[column] ? 1 : -1;
      return direction === "desc" ? -compared : compared;
    }
    return 0;
  });
}
function visibleCounselor(row, role) {
  if (role === "admin" || role === "service") return true;
  return row.is_active && row.approval_status === "approved";
}
function visibleProduct(row, role) {
  if (role === "admin" || role === "service") return true;
  const counselor = counselors.find((item) => item.id === row.counselor_id);
  return (
    row.is_active &&
    counselor?.is_active &&
    counselor.approval_status === "approved"
  );
}
function projectCounselor(row, select, role) {
  const owned = products
    .filter(
      (item) =>
        item.counselor_id === row.id &&
        (role === "admin" || role === "service" || item.is_active),
    )
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || (left.id > right.id ? 1 : -1),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      minutes: item.minutes,
      price: item.price,
    }));
  if (!select) return row;
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of select) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  if (current) parts.push(current);
  const result = {};
  for (const part of parts) {
    if (part.startsWith("stores(")) result.stores = null;
    else if (part.startsWith("consult_products("))
      result.consult_products = owned;
    else result[part] = row[part];
  }
  return result;
}
function send(res, rows, params) {
  let selected = sortRows(rows, params.get("order"));
  const count = selected.length;
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  if (limit != null) selected = selected.slice(offset, offset + Number(limit));
  res.setHeader(
    "Content-Range",
    `${offset}-${Math.max(offset, offset + selected.length - 1)}/${count}`,
  );
  res.end(JSON.stringify(selected));
}
const fixture = createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const url = new URL(req.url, "http://fixture.invalid");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname === "/auth/v1/user") {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end(JSON.stringify({ message: "invalid" }));
      return;
    }
    res.end(JSON.stringify(user));
    return;
  }
  const chunks = [];
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || ""))
    for await (const chunk of req) chunks.push(chunk);
  else req.resume();
  const role = roleOf(req);
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify([{ role: role === "admin" ? "admin" : "user" }]));
    return;
  }
  if (table === "reservations") {
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
    return;
  }
  if (table === "consult_products" && listFail && req.method === "GET") {
    res.writeHead(500);
    res.end(JSON.stringify({ code: "XX000", message: "fixture" }));
    return;
  }
  if (["POST", "PATCH"].includes(req.method || "")) {
    if (role !== "admin") {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission" }));
      return;
    }
    writes += 1;
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    for (const key of ["slug", "product_name", "reservation_no"])
      assert.equal(Object.hasOwn(body, key), false);
    if (req.method === "POST") {
      assert.equal(
        products.some((row) => row.id === body.id),
        false,
      );
      assert.equal(typeof body.counselor_id, "string");
      assert.equal(
        counselors.some((row) => row.id === body.counselor_id),
        true,
      );
      const created = { ...body, updated_at: stamp() };
      products.push(created);
      saveTrace.push({
        method: "POST",
        id: created.id,
        sent: "",
        before: "",
        after: created.updated_at,
        matched: 1,
        active: created.is_active,
        name: created.name,
        minutes: created.minutes,
        price: created.price,
      });
      if (loseResponse) {
        loseResponse = false;
        req.socket.destroy();
        return;
      }
      send(res, [created], url.searchParams);
      return;
    }
    let selected = products.filter((row) => matches(row, url.searchParams));
    const sentRaw = url.searchParams.get("updated_at") || "";
    const sent = sentRaw.startsWith("eq.") ? sentRaw.slice(3) : sentRaw;
    const before = selected[0]?.updated_at || "";
    for (const row of selected)
      Object.assign(row, body, { updated_at: stamp() });
    saveTrace.push({
      method: "PATCH",
      id: selected[0]?.id || "",
      sent,
      before,
      after: selected[0]?.updated_at || "",
      matched: selected.length,
      active: selected[0]?.is_active ?? null,
      name: selected[0]?.name || "",
      minutes: selected[0]?.minutes ?? null,
      price: selected[0]?.price ?? null,
    });
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
    send(res, selected, url.searchParams);
    return;
  }
  if (table === "consult_products") {
    const selected = products.filter(
      (row) => visibleProduct(row, role) && matches(row, url.searchParams),
    );
    send(res, selected, url.searchParams);
    return;
  }
  if (table === "counselors") {
    const selected = counselors.filter(
      (row) => visibleCounselor(row, role) && matches(row, url.searchParams),
    );
    const ordered = sortRows(selected, url.searchParams.get("order"));
    const count = ordered.length;
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = url.searchParams.get("limit");
    const page =
      limit == null ? ordered : ordered.slice(offset, offset + Number(limit));
    res.setHeader(
      "Content-Range",
      `${offset}-${Math.max(offset, offset + page.length - 1)}/${count}`,
    );
    res.end(
      JSON.stringify(
        page.map((row) =>
          projectCounselor(row, url.searchParams.get("select"), role),
        ),
      ),
    );
    return;
  }
  res.setHeader("Content-Range", "*/0");
  res.end("[]");
}
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = 4332;
const base = `http://127.0.0.1:${port}`;
const shotDir = join(process.cwd(), "tmp", "counselor-products-admin");
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
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
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(`${base}/consult`)).ok;
    } catch {
      return false;
    }
  }, "app");
  page = await browser();
  const text = (value) =>
    until(
      () =>
        page.evaluate(
          `document.body.innerText.includes(${JSON.stringify(value)})`,
        ),
      value,
    );
  const absent = async (value) => {
    assert.equal(
      await page.evaluate(
        `document.body.innerText.includes(${JSON.stringify(value)})`,
      ),
      false,
      value,
    );
  };
  const go = async (path) => {
    console.log("PRODUCT_OPEN", path);
    await page.go(base + path);
  };
  const screenshot = async (name) => {
    mkdirSync(shotDir, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(shotDir, name), Buffer.from(data, "base64"));
  };
  const confirm = async () => {
    await until(
      () => page.evaluate("!!document.querySelector('dialog[open]')"),
      "modal",
    );
    await page.button("확인 후 처리");
    await until(
      () => page.evaluate("!document.querySelector('dialog[open]')"),
      "modal closed",
    );
  };
  const clickLink = async (label) => {
    await until(
      () =>
        page.evaluate(
          `Array.from(document.querySelectorAll('a')).some((item)=>item.checkVisibility()&&item.textContent.trim()===${JSON.stringify(label)})`,
        ),
      label,
    );
    await page.evaluate(
      `Array.from(document.querySelectorAll('a')).find((item)=>item.checkVisibility()&&item.textContent.trim()===${JSON.stringify(label)}).click()`,
    );
  };
  const overflow = async () =>
    page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1");
  const aboveTabs = async () =>
    page.evaluate(`(() => {
      const nav = document.querySelector('[aria-label="하단 메뉴"]');
      window.scrollTo(0, document.documentElement.scrollHeight);
      const nodes = Array.from(document.querySelectorAll("main h1, main h3, main p, main a, main button"));
      const last = nodes.at(-1);
      if (!nav || !last) return false;
      return last.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top + 1;
    })()`);
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
  const setWidth = async (width) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  };
  await setWidth(360);
  await go(`/admin/counselors/${publicId}/products`);
  await text(longCounselor);
  await text(longName);
  await text("테스트 순서먼저");
  await text("총 22건");
  assert.ok(
    (await page.evaluate("document.body.innerText")).indexOf(
      "테스트 순서먼저",
    ) <
      (await page.evaluate("document.body.innerText")).indexOf(
        "테스트 순서나중",
      ),
  );
  await absent("테스트 둘째쪽");
  assert.equal(await overflow(), true);
  await screenshot("admin-list-360.png");
  await clickLink("다음");
  await text("테스트 둘째쪽");
  await text("2 / 2");
  await page.evaluate(
    "(()=>{const select=document.querySelector('[name=status]');select.value='private';})()",
  );
  await page.button("필터 적용");
  await text("테스트 비공개상품");
  await absent("테스트 둘째쪽");
  await absent(longName);
  await clickLink("초기화");
  await text(longName);
  await go(`/admin/counselors/${emptyId}/products`);
  await text("등록된 상담 상품이 없습니다.");
  await absent("상담 상품 목록을 불러오지 못했습니다.");
  listFail = true;
  await go(`/admin/counselors/${publicId}/products`);
  await text("상담 상품 목록을 불러오지 못했습니다.");
  await absent("등록된 상담 상품이 없습니다.");
  listFail = false;
  await go(`/admin/counselors/${publicId}/products/${otherProductId}`);
  await text("상담사 또는 상담 상품을 찾을 수 없습니다.");
  await go(`/admin/counselors/${publicId}/products/new`);
  await text("상담 상품 등록");
  assert.equal(
    await page.evaluate(
      "document.querySelector('input[type=checkbox]').checked",
    ),
    false,
  );
  await text("상품을 공개해도 상담사가 비공개이거나 승인되지 않았으면");
  await text("기존 예약의 상품명·시간·금액은 바뀌지 않습니다.");
  await text("판매를 중단하려면 비공개로 전환합니다.");
  const beforeInvalid = writes;
  await page.fill("name", "테스트 신규상품");
  await page.fill("minutes", "1.5");
  await page.fill("price", "1e2");
  await page.button("저장 전 확인");
  await text("정수로 입력해 주세요.");
  assert.equal(writes, beforeInvalid);
  await page.fill("name", "테스트 신규상품");
  await page.fill("minutes", "25");
  await page.fill("price", "0");
  await page.fill("sort_order", "4");
  await page.button("저장 전 확인");
  await page.button("돌아가기");
  assert.equal(writes, beforeInvalid);
  assert.equal(
    await page.evaluate("document.querySelector('[name=minutes]').value"),
    "25",
  );
  await clickLink("상품 목록으로");
  await text("저장하지 않은 입력");
  await page.button("돌아가기");
  assert.equal(
    await page.evaluate("location.pathname.endsWith('/products/new')"),
    true,
  );
  await page.button("저장 전 확인");
  await confirm();
  await text("상담 상품을 저장했습니다.");
  const created = products.find((item) => item.name === "테스트 신규상품");
  assert.ok(created);
  assert.equal(created.is_active, false);
  assert.equal(created.price, 0);
  assert.equal(created.minutes, 25);
  assert.equal(created.counselor_id, publicId);
  assert.equal(products.filter((item) => item.id === created.id).length, 1);
  await go("/consult/test-public");
  await absent("테스트 신규상품");
  await absent("테스트 숨은상담사상품");
  await absent("테스트 미승인상품");
  await text(longName);
  await text("예시 가격");
  await go("/consult/test-hidden");
  await absent("테스트 숨은상담사상품");
  await absent(longName);
  await go("/consult/test-pending");
  await absent("테스트 미승인상품");
  await absent(longName);
  await go(`/admin/counselors/${publicId}/products/${created.id}`);
  await page.evaluate(
    "(()=>{const label=Array.from(document.querySelectorAll('label')).find((item)=>item.textContent.trim()==='공개');label.querySelector('input').click()})()",
  );
  await page.fill("name", "테스트 공개상품");
  await page.button("저장 전 확인");
  await confirm();
  await text("상담 상품을 저장했습니다.");
  assert.equal(created.is_active, true);
  assert.equal(created.name, "테스트 공개상품");
  await go("/consult/test-public");
  await text("테스트 공개상품");
  await text("0원");
  assert.equal(await aboveTabs(), true);
  await screenshot("customer-detail-360.png");
  await go("/consult/test-public/book");
  await text("테스트 공개상품");
  await text("0원");
  await text("예시 가격");
  assert.equal(await overflow(), true);
  assert.equal(await aboveTabs(), true);
  await go(`/admin/counselors/${publicId}/products/${created.id}`);
  await page.evaluate(
    "(()=>{const label=Array.from(document.querySelectorAll('label')).find((item)=>item.textContent.trim()==='공개');label.querySelector('input').click()})()",
  );
  await page.button("저장 전 확인");
  await confirm();
  await text("상담 상품을 저장했습니다.");
  assert.equal(created.is_active, false);
  await go("/consult/test-public");
  await absent("테스트 공개상품");
  await go(`/admin/counselors/${publicId}`);
  await page.fill("name", "테스트 이탈확인");
  await clickLink("상품 관리");
  await text("저장하지 않은 입력");
  await page.button("돌아가기");
  assert.equal(
    await page.evaluate("document.querySelector('[name=name]').value"),
    "테스트 이탈확인",
  );
  assert.equal(
    await page.evaluate(`location.pathname==='/admin/counselors/${publicId}'`),
    true,
  );
  await go(`/admin/counselors/${publicId}`);
  await clickLink("상품 관리");
  await text("상담 상품");
  assert.equal(
    await page.evaluate("location.pathname.endsWith('/products')"),
    true,
  );
  await go(`/admin/counselors/${publicId}/products/${created.id}`);
  created.updated_at = stamp();
  const kept = created.name;
  await page.fill("name", "테스트 충돌상품");
  await page.button("저장 전 확인");
  await confirm();
  await text("변경됐습니다");
  assert.equal(created.name, kept);
  assert.equal(
    await page.evaluate("document.querySelector('[name=name]').value"),
    "테스트 충돌상품",
  );
  await go(`/admin/counselors/${publicId}/products/new`);
  await page.fill("name", "테스트 응답유실");
  await page.fill("minutes", "45");
  await page.fill("price", "0");
  loseResponse = true;
  const beforeLost = products.filter(
    (item) => item.name === "테스트 응답유실",
  ).length;
  await page.button("저장 전 확인");
  await confirm();
  await text("확인하지 못했습니다");
  assert.equal(
    products.filter((item) => item.name === "테스트 응답유실").length,
    beforeLost + 1,
  );
  await page.button("저장 결과 다시 확인");
  await text("상담 상품을 저장했습니다.");
  assert.equal(
    products.filter((item) => item.name === "테스트 응답유실").length,
    1,
  );
  await go(`/admin/counselors/${publicId}/products/${created.id}`);
  admin = false;
  const priceBefore = created.price;
  await page.fill("price", "777");
  await page.button("저장 전 확인");
  await confirm();
  await text("관리자 권한이 필요합니다.");
  assert.equal(created.price, priceBefore);
  admin = true;
  for (const width of [768, 1024]) {
    await setWidth(width);
    await go(`/admin/counselors/${publicId}/products`);
    await text(longName);
    await text("편집");
    assert.equal(await overflow(), true, String(width));
    if (width === 1024) await screenshot("admin-list-1024.png");
    await go(`/admin/counselors/${publicId}/products/new`);
    await text("상담 상품 등록");
    assert.equal(await overflow(), true, String(width));
    if (width === 768) await screenshot("admin-editor-768.png");
    await go("/consult/test-public");
    await text(longName);
    await text(longCounselor);
    assert.equal(await overflow(), true, String(width));
    assert.equal(await aboveTabs(), true, String(width));
    await go("/consult/test-public/book");
    await text(longName);
    assert.equal(await overflow(), true, String(width));
    assert.equal(await aboveTabs(), true, String(width));
    if (width === 1024) await screenshot("customer-book-1024.png");
  }
  await setWidth(390);
  const trackedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const privateProductId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
  const snap = (id) => {
    const row = products.find((item) => item.id === id);
    return {
      updated_at: row.updated_at,
      name: row.name,
      minutes: row.minutes,
      price: row.price,
      is_active: row.is_active,
    };
  };
  const editorState = async () =>
    page.evaluate(`(() => {
      const field = (name) => {
        const el = Array.from(document.querySelectorAll("[name='" + name + "']")).find((item) => item.checkVisibility());
        return el ? el.value : "";
      };
      const box = Array.from(document.querySelectorAll("input[type=checkbox]")).find((item) => item.checkVisibility());
      const fieldset = Array.from(document.querySelectorAll("fieldset")).find((item) => item.checkVisibility());
      const textBody = document.body.innerText;
      return {
        href: location.pathname + location.search,
        saved: textBody.includes("상담 상품을 저장했습니다."),
        conflict: textBody.includes("변경됐습니다"),
        name: field("name"),
        minutes: field("minutes"),
        price: field("price"),
        active: box ? box.checked : null,
        disabled: fieldset ? fieldset.disabled : null,
        dialog: !!document.querySelector("dialog[open]"),
      };
    })()`);
  const clientEdit = async (id) => {
    await until(
      () =>
        page.evaluate(
          `Array.from(document.querySelectorAll("a")).some((item)=>item.checkVisibility()&&(item.getAttribute("href")||"").includes(${JSON.stringify(id)}))`,
        ),
      "편집 링크",
    );
    const before = await page.evaluate("location.href");
    await page.evaluate(
      `Array.from(document.querySelectorAll("a")).find((item)=>item.checkVisibility()&&(item.getAttribute("href")||"").includes(${JSON.stringify(id)})).click()`,
    );
    await until(
      () =>
        page.evaluate(
          `location.href!==${JSON.stringify(before)}&&location.pathname.includes(${JSON.stringify(id)})`,
        ),
      "편집 화면",
    );
    await text("상담 상품 편집");
  };
  const toggleActive = async () => {
    await page.evaluate(
      `(()=>{const label=Array.from(document.querySelectorAll("label")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="공개");const input=label.querySelector("input");input.click()})()`,
    );
  };
  const readGap = async () =>
    page.evaluate(
      "(() => { const hits = window.__gapHits || 0; window.__gapArmed = false; window.__gapHits = 0; return hits; })()",
    );
  const saveFromEditor = async () => {
    const traceAt = saveTrace.length;
    const clientAt = await page.evaluate(
      "(window.__productSaves || []).length",
    );
    await page.button("저장 전 확인");
    await until(
      () => page.evaluate("!!document.querySelector('dialog[open]')"),
      "modal",
    );
    const started = await page.evaluate("location.href");
    await page.evaluate("window.__gapHits = 0; window.__gapArmed = true;");
    await page.button("확인 후 처리");
    await until(
      () => page.evaluate("!document.querySelector('dialog[open]')"),
      "modal closed",
    );
    await until(
      () =>
        page.evaluate(`(() => {
          const textBody = document.body.innerText;
          const moved =
            location.href !== ${JSON.stringify(started)} &&
            location.search.includes("product=saved") &&
            textBody.includes("상담 상품을 저장했습니다.");
          return (
            moved ||
            textBody.includes("변경됐습니다") ||
            textBody.includes("거부됐습니다") ||
            textBody.includes("관리자 권한이 필요합니다.")
          );
        })()`),
      "save settled",
    );
    return {
      view: await editorState(),
      gap: await readGap(),
      trace: saveTrace.slice(traceAt),
      client: await page.evaluate(
        `(window.__productSaves || []).slice(${clientAt})`,
      ),
    };
  };
  await go(`/admin/counselors/${publicId}/products/${trackedId}`);
  await text("상담 상품 편집");
  await page.evaluate(`(() => {
    window.__productSaves = [];
    window.__gapHits = 0;
    window.__gapArmed = false;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
      let sample = "";
      try {
        const body = args[1] && args[1].body;
        if (typeof body === "string") sample = body.slice(0, 4000);
        else if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)
          sample = body.toString().slice(0, 4000);
        else if (typeof FormData !== "undefined" && body instanceof FormData)
          sample = [...body.entries()].map(([key, value]) => key + "=" + String(value)).join("&").slice(0, 4000);
        else if (body instanceof Uint8Array)
          sample = new TextDecoder().decode(body.subarray(0, 4000));
      } catch {}
      if (sample.includes("is_active") || sample.includes("sort_order")) {
        window.__productSaves.push({
          versions: sample.match(/20\\d{2}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})/g) || [],
          active: (sample.match(/is_active[\\s\\S]{0,24}(true|false)/) || [])[1] || "",
        });
      }
      return orig(...args);
    };
    new MutationObserver(() => {
      if (!window.__gapArmed) return;
      const dialog = document.querySelector("dialog[open]");
      const fieldset = Array.from(document.querySelectorAll("fieldset")).find((item) => item.checkVisibility());
      if (/\\/products\\/[0-9a-f-]{36}/.test(location.pathname) && !dialog && fieldset && !fieldset.disabled)
        window.__gapHits += 1;
    }).observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  })()`);
  const entered = snap(trackedId);
  await toggleActive();
  const turnedPrivate = await saveFromEditor();
  const savedPrivate = snap(trackedId);
  console.log(
    "CONSECUTIVE_PRIVATE",
    JSON.stringify({
      entered,
      saved: savedPrivate,
      href: turnedPrivate.view.href,
      savedMessage: turnedPrivate.view.saved,
      conflict: turnedPrivate.view.conflict,
      gap: turnedPrivate.gap,
      trace: turnedPrivate.trace,
      client: turnedPrivate.client,
    }),
  );
  assert.equal(turnedPrivate.view.saved, true, "비공개 저장 후 목록으로 이동");
  assert.equal(savedPrivate.is_active, false);
  assert.notEqual(savedPrivate.updated_at, entered.updated_at);
  assert.equal(turnedPrivate.trace[0].sent, entered.updated_at);
  assert.equal(turnedPrivate.trace[0].before, entered.updated_at);
  assert.equal(turnedPrivate.trace[0].after, savedPrivate.updated_at);
  await clientEdit(trackedId);
  const returned = await editorState();
  console.log("CONSECUTIVE_RETURN", JSON.stringify(returned));
  await page.fill("name", "테스트 연속공개");
  if (returned.active === false) await toggleActive();
  const turnedPublic = await saveFromEditor();
  const savedPublic = snap(trackedId);
  console.log(
    "CONSECUTIVE_PUBLIC",
    JSON.stringify({
      before: savedPrivate,
      saved: savedPublic,
      href: turnedPublic.view.href,
      savedMessage: turnedPublic.view.saved,
      conflict: turnedPublic.view.conflict,
      input: {
        name: turnedPublic.view.name,
        active: turnedPublic.view.active,
      },
      gap: turnedPublic.gap,
      trace: turnedPublic.trace,
      client: turnedPublic.client,
    }),
  );
  assert.equal(
    turnedPublic.view.conflict,
    false,
    "공개로 이어 저장할 때 거짓 충돌",
  );
  assert.equal(turnedPublic.view.saved, true, "이어 저장 후 목록으로 이동");
  assert.equal(savedPublic.is_active, true);
  assert.equal(savedPublic.name, "테스트 연속공개");
  assert.equal(turnedPublic.trace[0].sent, turnedPublic.trace[0].before);
  assert.equal(turnedPublic.trace[0].sent, savedPrivate.updated_at);
  assert.equal(turnedPrivate.gap, 0, "첫 저장 직후 폼이 다시 열림");
  assert.equal(turnedPublic.gap, 0, "이어 저장 직후 폼이 다시 열림");
  await clientEdit(trackedId);
  await page.fill("minutes", "41");
  const minutesSave = await saveFromEditor();
  assert.equal(minutesSave.view.conflict, false, "시간 이어 저장 충돌");
  assert.equal(minutesSave.view.saved, true);
  assert.equal(snap(trackedId).minutes, 41);
  assert.equal(minutesSave.trace[0].sent, minutesSave.trace[0].before);
  assert.equal(minutesSave.gap, 0);
  await clientEdit(trackedId);
  await page.fill("price", "16000");
  const priceSave = await saveFromEditor();
  assert.equal(priceSave.view.conflict, false, "가격 이어 저장 충돌");
  assert.equal(priceSave.view.saved, true);
  assert.equal(snap(trackedId).price, 16000);
  assert.equal(priceSave.trace[0].sent, priceSave.trace[0].before);
  assert.equal(priceSave.gap, 0);
  await clientEdit(trackedId);
  await page.fill("name", "테스트 임시보관");
  await page.evaluate("history.back()");
  await until(
    () =>
      page.evaluate(
        `location.pathname.endsWith("/products") && !location.pathname.includes(${JSON.stringify(trackedId)})`,
      ),
    "뒤로 목록",
  );
  await page.evaluate("history.forward()");
  await until(
    () =>
      page.evaluate(`location.pathname.includes(${JSON.stringify(trackedId)})`),
    "앞으로 편집",
  );
  await text("상담 상품 편집");
  const drafted = await editorState();
  console.log("CONSECUTIVE_DRAFT", JSON.stringify(drafted));
  assert.equal(drafted.name, "테스트 임시보관", "뒤로가기 뒤 작성 중 입력");
  await page.fill("name", "테스트 연속공개");
  const draftSave = await saveFromEditor();
  assert.equal(draftSave.view.conflict, false, "앞으로가기 뒤 저장 충돌");
  assert.equal(draftSave.view.saved, true);
  assert.equal(draftSave.trace[0].sent, draftSave.trace[0].before);
  assert.equal(snap(trackedId).name, "테스트 연속공개");
  const keptRow = snap(trackedId);
  const tracked = products.find((item) => item.id === trackedId);
  tracked.updated_at = stamp();
  await clientEdit(trackedId);
  await page.fill("name", "테스트 연속충돌");
  const conflicted = await saveFromEditor();
  console.log(
    "CONSECUTIVE_CONFLICT",
    JSON.stringify({
      kept: keptRow,
      now: snap(trackedId),
      view: conflicted.view,
      trace: conflicted.trace,
      client: conflicted.client,
    }),
  );
  assert.equal(conflicted.view.conflict, true, "실제 충돌은 유지");
  assert.equal(conflicted.view.saved, false);
  assert.equal(conflicted.view.name, "테스트 연속충돌");
  assert.equal(tracked.name, keptRow.name);
  assert.equal(conflicted.trace.length, 0);
  await page.button("최신 내용 다시 불러오기");
  await until(
    () => page.evaluate("!!document.querySelector('dialog[open]')"),
    "reload modal",
  );
  await page.button("확인 후 처리");
  await text("최신 내용을 불러왔습니다.");
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll("[name=name]")).find((item)=>item.checkVisibility()).value`,
    ),
    keptRow.name,
  );
  await page.fill("name", "테스트 충돌후저장");
  const recovered = await saveFromEditor();
  assert.equal(recovered.view.conflict, false, "다시 불러온 뒤 저장");
  assert.equal(recovered.view.saved, true);
  assert.equal(snap(trackedId).name, "테스트 충돌후저장");
  assert.equal(recovered.trace[0].sent, recovered.trace[0].before);
  await clientEdit(privateProductId);
  assert.equal((await editorState()).active, false);
  await toggleActive();
  const turnedOn = await saveFromEditor();
  assert.equal(turnedOn.view.saved, true, "비공개 상품을 공개로 저장");
  assert.equal(snap(privateProductId).is_active, true);
  await clientEdit(privateProductId);
  await toggleActive();
  const turnedOff = await saveFromEditor();
  console.log(
    "CONSECUTIVE_REVERSE",
    JSON.stringify({
      on: turnedOn.trace,
      off: turnedOff.trace,
      db: snap(privateProductId),
      conflict: turnedOff.view.conflict,
      gap: turnedOff.gap,
    }),
  );
  assert.equal(turnedOff.view.conflict, false, "공개 뒤 비공개로 이어 저장");
  assert.equal(turnedOff.view.saved, true);
  assert.equal(snap(privateProductId).is_active, false);
  assert.equal(turnedOff.trace[0].sent, turnedOff.trace[0].before);
  assert.equal(turnedOff.gap, 0);
  await page.call("Network.enable");
  await page.call("Network.clearBrowserCookies");
  await page.call("Page.navigate", {
    url: `${base}/admin/counselors/${publicId}/products`,
  });
  await until(
    () => page.evaluate("location.pathname==='/admin/login'"),
    "login",
  );
  console.log("PRODUCT_BROWSER_OK", {
    products: products.length,
    writes,
  });
} finally {
  if (page) await page.close();
  stop(app);
  fixture.close();
}
