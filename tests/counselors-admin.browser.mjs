// 격리된 HTTP DB/Storage 모형이다. 실제 Supabase 자격증명과 자료는 쓰지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";

const uid = "11111111-1111-4111-8111-111111111111";
const storeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hiddenStoreId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sharedPhoto = "counselors/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";
const brokenPhoto = "counselors/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";
const longName = "W".repeat(30);
const longCareer = "W".repeat(200);
const mixedCareer = `https://example.invalid/${"W".repeat(40)}한글경력`;
const longTag = "T".repeat(20);
const longDescription = `${"W".repeat(120)}\n둘째 줄 ${"가".repeat(40)}`;
const stores = [
  {
    id: storeId,
    slug: "store-a",
    name: "더미 동성로",
    is_active: true,
    address: "더미 주소",
    hours: "12:00~22:00",
    description: "더미 매장",
    sort_order: 1,
  },
  {
    id: hiddenStoreId,
    slug: "store-b",
    name: "숨긴 매장",
    is_active: false,
    address: "숨김 주소",
    hours: "휴무",
    description: "숨김 매장",
    sort_order: 2,
  },
];
const products = [
  {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    counselor_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "더미 30분",
    minutes: 30,
    price: 10000,
    sort_order: 1,
    is_active: true,
  },
];
products.push({
  id: "ffffffff-ffff-4fff-8fff-fffffffffffe",
  counselor_id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd6",
  name: "더미 30분",
  minutes: 30,
  price: 10000,
  sort_order: 1,
  is_active: true,
});
const baseRow = {
  tags: [],
  careers: [],
  intro: "",
  description: "",
  image_path: null,
  is_recommended: false,
  is_new: false,
  is_active: false,
  affiliation: "store",
  approval_status: "approved",
  expert_url: null,
  store_id: null,
};
const counselors = [
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    slug: "a",
    store_id: storeId,
    name: "상담사 A",
    field: "tarot",
    fields: ["tarot", "saju"],
    tags: ["타로", "연애운"],
    careers: ["사주명리상담경력 10년", "타로 심리상담사1급"],
    intro: "더미 한 줄",
    description: "첫째 줄\n둘째 줄",
    image_path: sharedPhoto,
    is_recommended: true,
    is_active: true,
    sort_order: 1,
    updated_at: "2026-11-11T00:00:00.111111+00:00",
  },
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
    slug: "gayeon",
    name: "가연샘",
    field: "saju",
    fields: ["tarot", "saju"],
    is_new: true,
    is_active: true,
    sort_order: 2,
    updated_at: "2026-11-11T00:00:00.222222+00:00",
  },
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
    slug: "pending",
    name: "승인대기",
    field: "tarot",
    fields: ["tarot"],
    is_active: true,
    approval_status: "pending",
    sort_order: 3,
    updated_at: "2026-11-11T00:00:00.333333+00:00",
  },
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
    slug: "broken",
    name: "사진깨짐",
    field: "tarot",
    fields: ["tarot"],
    image_path: brokenPhoto,
    is_active: true,
    sort_order: 4,
    updated_at: "2026-11-11T00:00:00.444444+00:00",
  },
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd5",
    slug: "shared",
    name: "사진공유",
    field: "saju",
    fields: ["saju"],
    image_path: sharedPhoto,
    sort_order: 5,
    updated_at: "2026-11-11T00:00:00.555555+00:00",
  },
  {
    ...baseRow,
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd6",
    slug: "long",
    store_id: storeId,
    name: longName,
    field: "tarot",
    fields: ["tarot"],
    tags: [longTag],
    careers: [longCareer, mixedCareer],
    intro: "짧은 소개",
    description: longDescription,
    image_path: sharedPhoto,
    is_recommended: true,
    is_active: true,
    sort_order: 6,
    updated_at: "2026-11-11T00:00:00.666666+00:00",
  },
];
for (let index = 0; index < 25; index += 1) {
  counselors.push({
    ...baseRow,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    slug: `filler-${index + 1}`,
    name: `비공개 ${index + 1}`,
    field: "tarot",
    fields: ["tarot"],
    sort_order: 20 + index,
    updated_at: `2026-11-11T00:00:01.${String(index).padStart(6, "0")}+00:00`,
  });
}
const files = new Map();
const imageDimensions = new Map();
files.set(sharedPhoto, Buffer.from("shared-photo"));
imageDimensions.set(sharedPhoto, { width: 80, height: 160 });
let admin = true;
let seq = 0;
let cleanupFail = false;
let loseResponse = false;
let loseUploadResponse = false;
let writes = 0;
const deletes = [];
const stamp = () =>
  `2026-11-12T01:00:00.${String(++seq).padStart(6, "0")}+00:00`;
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
const fixture = createServer((req, res) =>
  handle(req, res).catch((error) => {
    console.error(error);
    res.writeHead(500);
    res.end("{}");
  }),
);
function matches(row, params) {
  for (const [key, value] of params)
    if (value.startsWith("eq.") && !key.includes(".")) {
      if (String(row[key]) !== value.slice(3)) return false;
    }
  return true;
}
function project(row, select, privileged) {
  const store = stores.find((item) => item.id === row.store_id) || null;
  const owned = products
    .filter(
      (item) => item.counselor_id === row.id && (privileged || item.is_active),
    )
    .sort((a, b) => a.sort_order - b.sort_order)
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
    if (part.startsWith("stores("))
      result.stores = store
        ? {
            name: store.name,
            is_active: store.is_active,
          }
        : null;
    else if (part.startsWith("consult_products("))
      result.consult_products = owned;
    else result[part] = row[part];
  }
  return result;
}
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
    res.end(JSON.stringify(user));
    return;
  }
  const chunks = [];
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || ""))
    for await (const chunk of req) chunks.push(chunk);
  else req.resume();
  const rawBuffer = Buffer.concat(chunks);
  const raw = rawBuffer.toString();
  const privileged = admin && req.headers.authorization === `Bearer ${token}`;
  if (url.pathname.startsWith("/storage/v1/")) {
    const path = decodeURIComponent(
      url.pathname.split("/public-images/")[1] || "",
    );
    if (url.pathname.includes("/object/info/")) {
      if (!files.has(path)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      const file = files.get(path);
      res.end(
        JSON.stringify({
          size: Buffer.isBuffer(file) ? file.length : 1200,
          content_type: "image/png",
        }),
      );
      return;
    }
    if (req.method === "GET" && url.pathname.includes("/object/public/")) {
      const image = files.get(path);
      const dimensions = imageDimensions.get(path);
      if (!image) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      if (dimensions) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"></svg>`,
        );
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.end(image);
      return;
    }
    if (req.method === "POST") {
      assert.equal(privileged, true);
      assert.equal(req.headers["x-upsert"], "false");
      if (files.has(path)) {
        res.writeHead(409);
        res.end(JSON.stringify({ message: "already exists" }));
        return;
      }
      files.set(path, rawBuffer);
      if (loseUploadResponse) {
        loseUploadResponse = false;
        req.socket.destroy();
        return;
      }
      res.end(JSON.stringify({ Key: path }));
      return;
    }
    if (req.method === "DELETE") {
      const paths = JSON.parse(raw).prefixes;
      deletes.push(paths);
      if (cleanupFail) {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      for (const item of paths) {
        const used = counselors.some((row) => row.image_path === item);
        if (!used) files.delete(item);
      }
      res.end("[]");
      return;
    }
    res.end("{}");
    return;
  }
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify([{ role: admin ? "admin" : "user" }]));
    return;
  }
  if (table === "stores") {
    let selected = stores.filter((row) => privileged || row.is_active);
    selected = selected.filter((row) => matches(row, url.searchParams));
    res.setHeader(
      "Content-Range",
      `0-${Math.max(0, selected.length - 1)}/${selected.length}`,
    );
    res.end(JSON.stringify(selected));
    return;
  }
  if (table === "consult_products" || table === "reservations") {
    const selected =
      table === "reservations"
        ? []
        : products.filter((row) => matches(row, url.searchParams));
    res.setHeader(
      "Content-Range",
      `0-${Math.max(0, selected.length - 1)}/${selected.length}`,
    );
    res.end(JSON.stringify(selected));
    return;
  }
  if (table !== "counselors") {
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
    return;
  }
  let selected = counselors.filter(
    (row) =>
      (privileged || (row.is_active && row.approval_status === "approved")) &&
      matches(row, url.searchParams),
  );
  if (["POST", "PATCH"].includes(req.method || "")) {
    assert.equal(privileged, true);
    writes += 1;
    const body = JSON.parse(raw);
    for (const key of ["affiliation", "approval_status", "expert_url"])
      assert.equal(Object.hasOwn(body, key), false);
    if (req.method === "POST") {
      assert.equal(
        counselors.some((row) => row.id === body.id),
        false,
      );
      assert.equal(body.slug, body.id);
      const created = {
        ...baseRow,
        ...body,
        affiliation: "store",
        approval_status: "approved",
        expert_url: null,
        updated_at: stamp(),
      };
      counselors.push(created);
      selected = [created];
    } else {
      assert.equal(Object.hasOwn(body, "slug"), false);
      const version = url.searchParams.get("updated_at")?.slice(3);
      selected = selected.filter((row) => row.updated_at === version);
      for (const row of selected)
        Object.assign(row, body, { updated_at: stamp() });
    }
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
  }
  const order = url.searchParams.get("order");
  if (order)
    selected.sort((a, b) => {
      for (const part of order.split(",")) {
        const [column, direction] = part.split(".");
        if (a[column] === b[column]) continue;
        const cmp = a[column] > b[column] ? 1 : -1;
        return direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  const count = selected.length;
  if (req.method === "HEAD") {
    res.setHeader("Content-Range", `*/${count}`);
    res.writeHead(200);
    res.end();
    return;
  }
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = url.searchParams.get("limit");
  if (limit != null) selected = selected.slice(offset, offset + Number(limit));
  res.setHeader(
    "Content-Range",
    `${offset}-${Math.max(offset, offset + selected.length - 1)}/${count}`,
  );
  res.end(
    JSON.stringify(
      selected.map((row) =>
        project(row, url.searchParams.get("select"), privileged),
      ),
    ),
  );
}
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = 4331;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
  SUPABASE_SECRET_KEY: "fixture-secret",
  COUNSELORS_SCREENSHOT_DIR: join(process.cwd(), "tmp", "counselors-admin"),
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
  const go = async (path) => {
    console.log("MOCK_OPEN", path);
    await page.go(base + path);
  };
  const screenshot = async (name) => {
    mkdirSync(env.COUNSELORS_SCREENSHOT_DIR, { recursive: true });
    const { data } = await page.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(
      join(env.COUNSELORS_SCREENSHOT_DIR, name),
      Buffer.from(data, "base64"),
    );
  };
  const confirm = async () => {
    await until(
      () => page.evaluate("!!document.querySelector('dialog[open]')"),
      "modal",
    );
    assert.equal(
      await page.evaluate(
        "(()=>{const d=document.querySelector('dialog[open]');const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth+1})()",
      ),
      true,
    );
    await page.button("확인 후 처리");
    await until(
      () => page.evaluate("!document.querySelector('dialog[open]')"),
      "modal closed",
    );
  };
  const clickLabel = async (label, type = "checkbox") => {
    await page.evaluate(
      `(()=>{const label=Array.from(document.querySelectorAll('label')).find((item)=>item.textContent.trim()===${JSON.stringify(label)}&&item.querySelector('input[type=${type}]'));label.querySelector('input').click()})()`,
    );
  };
  const setCareer = async (index, value) => {
    await page.evaluate(
      `(()=>{const section=Array.from(document.querySelectorAll('section')).find((item)=>item.querySelector('h2')?.textContent==='경력·교육·자격');const input=Array.from(section.querySelectorAll('input'))[${index}];const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set;set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
  };
  const selectImage = async () => {
    await page.evaluate(
      `(async()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=30;const context=canvas.getContext('2d');context.fillStyle='#5e3363';context.fillRect(0,0,20,30);const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],'fixture.png',{type:'image/png'}));const input=Array.from(document.querySelectorAll('input[type=file]')).find((item)=>item.checkVisibility());input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await until(
      () =>
        page.evaluate(
          "document.querySelector('[data-counselor-image-preview]')?.naturalWidth===20",
        ),
      "preview",
    );
  };
  const overflow = async () =>
    page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1");
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
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/counselors/new");
  await text("상담사 등록");
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('input[type=checkbox]')).every((item)=>!item.checked)",
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      "document.querySelector('[data-counselor-image-preview]')===null",
    ),
    true,
  );
  await page.fill("name", "모의상담사");
  await page.button("저장 전 확인");
  await text("타로와 사주");
  assert.equal(writes, 0);
  await clickLabel("타로");
  await clickLabel("사주");
  await clickLabel("사주", "radio");
  await page.button("경력 추가");
  await setCareer(0, "둘째 경력");
  await page.button("경력 추가");
  await setCareer(1, "첫째 경력");
  await page.evaluate(
    "(()=>{const section=Array.from(document.querySelectorAll('section')).find((item)=>item.querySelector('h2')?.textContent==='경력·교육·자격');const cards=Array.from(section.children).filter((item)=>item.querySelector('input'));cards[1].querySelector('button').click()})()",
  );
  await page.button("주제 추가");
  await page.evaluate(
    `(()=>{const section=Array.from(document.querySelectorAll('section')).find((item)=>item.querySelector('h2')?.textContent==='상담 주제');const input=section.querySelector('input');const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set;set.call(input,'타로');input.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await page.button("저장 전 확인");
  await page.button("돌아가기");
  assert.equal(writes, 0);
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('section')).find((item)=>item.querySelector('h2')?.textContent==='경력·교육·자격').querySelector('input').value",
    ),
    "첫째 경력",
  );
  await page.call("Page.bringToFront");
  await page.call("Emulation.setFocusEmulationEnabled", { enabled: true });
  const nameId = await page.evaluate(
    "(()=>{const input=document.querySelector('[name=name]');input.focus();window.__keys=[];document.addEventListener('keydown',(event)=>window.__keys.push(event.key+':'+event.target.id),true);document.addEventListener('click',(event)=>window.__keys.push('click:'+event.target.textContent.trim()),true);return input.id})()",
  );
  await page.call("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  await page.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
  assert.notEqual(await page.evaluate("document.activeElement.id"), nameId);
  await page.evaluate(
    "Array.from(document.querySelectorAll('button[type=submit]')).find((button)=>button.textContent.trim()==='저장 전 확인').focus()",
  );
  for (const type of ["rawKeyDown", "char", "keyUp"])
    await page.call("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      text: type === "char" ? "\r" : undefined,
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  let keyboardModal = false;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    keyboardModal = await page.evaluate(
      "!!document.querySelector('dialog[open]')",
    );
    if (keyboardModal) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!keyboardModal)
    throw Error(
      `keyboard modal ${JSON.stringify(await page.evaluate("window.__keys"))}`,
    );
  await page.call("Page.bringToFront");
  for (const type of ["rawKeyDown", "keyUp"])
    await page.call("Input.dispatchKeyEvent", {
      type,
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
  await until(
    () => page.evaluate("!document.querySelector('dialog[open]')"),
    "escape modal",
  );
  assert.equal(writes, 0);
  loseResponse = true;
  await page.button("저장 전 확인");
  await confirm();
  await text("확인하지 못했습니다");
  assert.equal(deletes.length, 0);
  await page.button("저장 결과 다시 확인");
  await text("상담사를 저장했습니다.");
  const created = counselors.find((row) => row.name === "모의상담사");
  assert.ok(created);
  assert.equal(created.slug, created.id);
  assert.equal(created.is_active, false);
  assert.equal(created.is_recommended, false);
  assert.equal(created.is_new, false);
  assert.deepEqual(created.fields, ["tarot", "saju"]);
  assert.equal(created.field, "saju");
  assert.deepEqual(created.careers, ["첫째 경력", "둘째 경력"]);
  assert.deepEqual(created.tags, ["타로"]);
  assert.equal(created.approval_status, "approved");
  assert.equal(created.image_path, null);
  await go("/admin/counselors?status=private&page=2");
  await text("2 /");
  await clickLink("편집");
  await text("상담사 편집");
  await clickLink("목록으로 돌아가기");
  await until(
    () => page.evaluate("location.search.includes('page=2')"),
    "return page",
  );
  await go("/admin/counselors?status=private");
  await text("모의상담사");
  await text("미지정");
  assert.equal(await overflow(), true);
  await screenshot("admin-counselors-list-360.png");
  await go(`/admin/counselors/${created.id}`);
  created.updated_at = stamp();
  await page.fill("name", "수정이름");
  await page.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 상담사가 변경됐습니다.");
  assert.equal(
    await page.evaluate("document.querySelector('[name=name]').value"),
    "수정이름",
  );
  await page.button("최신 내용 다시 불러오기");
  await confirm();
  await text("최신 내용을 불러왔습니다.");
  assert.equal(
    await page.evaluate("document.querySelector('[name=name]').value"),
    "모의상담사",
  );
  const beforeUpload = deletes.length;
  loseUploadResponse = true;
  await selectImage();
  await page.button("저장 전 확인");
  await confirm();
  await text("사진 업로드 응답을 확인하지 못했습니다");
  assert.equal(deletes.length, beforeUpload);
  assert.equal(
    [...files.keys()].some((item) => item.startsWith("counselors/")),
    true,
  );
  await page.button("저장 결과 다시 확인");
  await text("업로드한 사진은 보존했습니다");
  await page.button("저장 전 확인");
  await confirm();
  await text("상담사를 저장했습니다.");
  assert.equal(created.image_path?.startsWith("counselors/"), true);
  assert.equal(files.has(created.image_path), true);
  const firstPhoto = created.image_path;
  await go(`/admin/counselors/${created.id}`);
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 768,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go(`/admin/counselors/${created.id}`);
  await text("사진 크게 보기");
  assert.equal(await overflow(), true);
  await screenshot("admin-counselor-editor-768.png");
  cleanupFail = true;
  await selectImage();
  await page.button("저장 전 확인");
  await confirm();
  await text("정리만 다시 시도");
  assert.equal(files.has(firstPhoto), true);
  assert.notEqual(created.image_path, firstPhoto);
  const writesAfterSave = writes;
  cleanupFail = false;
  await page.button("파일 정리만 재시도");
  await text("상담사를 저장했습니다.");
  assert.equal(files.has(firstPhoto), false);
  assert.equal(writes, writesAfterSave);
  const sharedBefore = counselors.find((row) => row.slug === "shared");
  sharedBefore.image_path = created.image_path;
  await go(`/admin/counselors/${created.id}`);
  const keptPhoto = created.image_path;
  await page.button("사진 제거");
  assert.equal(files.has(keptPhoto), true);
  await page.button("저장 전 확인");
  await confirm();
  await text("상담사를 저장했습니다.");
  assert.equal(created.image_path, null);
  assert.equal(files.has(keptPhoto), true);
  await go("/consult");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('모의상담사')"),
    false,
  );
  assert.equal(
    await page.evaluate("document.body.innerText.includes('승인대기')"),
    false,
  );
  assert.equal(
    await page.evaluate("document.body.innerText.includes('가연샘 선생님')"),
    false,
  );
  await text("가연샘");
  await go("/consult?type=tarot");
  await text("가연샘");
  await text("상담사 A");
  await go("/consult?type=saju");
  await text("가연샘");
  await text("상담사 A");
  await go("/consult");
  assert.equal(
    await page.evaluate(
      "(document.body.innerText.match(/가연샘/g)||[]).length===1",
    ),
    true,
  );
  await go("/consult/a");
  await text("상담사 A");
  await text("선생님");
  await text("사주명리상담경력 10년");
  await text("첫째 줄");
  await text("둘째 줄");
  await text("더미 동성로 상담사");
  await until(
    () =>
      page.evaluate(
        "getComputedStyle(document.querySelector('[data-counselor-photo]')).objectFit==='contain'&&document.querySelector('[data-counselor-photo]').naturalWidth===80",
      ),
    "contained photo",
  );
  const chipText = await page.evaluate(
    "Array.from(document.querySelectorAll('span')).map((item)=>item.textContent.trim()).filter((item)=>['타로','사주','연애운'].includes(item)).join(',')",
  );
  assert.equal(chipText.includes("타로,사주,연애운"), true);
  assert.equal(chipText.split("타로").length - 1, 1);
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/consult/a");
  assert.equal(await overflow(), true);
  await screenshot("customer-counselor-detail-360.png");
  await go("/consult/gayeon");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('경력·교육·자격')"),
    false,
  );
  assert.equal(
    await page.evaluate("document.body.innerText.includes('가연샘 선생님')"),
    false,
  );
  await text("등록된 상담 상품이 없어요.");
  await until(
    () =>
      page.evaluate(
        "!!document.querySelector('[aria-label=\"상담사 사진 자리\"]')",
      ),
    "missing photo",
  );
  await go("/consult/gayeon/book");
  await text("지금은 예약 가능한 상담 상품이 없어요.");
  await go("/consult/broken");
  await until(
    () =>
      page.evaluate(
        "!!document.querySelector('[aria-label=\"상담사 사진 자리\"]')&&!document.querySelector('[data-counselor-photo]')",
      ),
    "broken photo",
  );
  await go("/");
  await text("상담사 A");
  await until(
    () => page.evaluate("!!document.querySelector('[data-counselor-photo]')"),
    "home photo",
  );
  await go(`/admin/counselors/${created.id}`);
  await clickLabel("공개");
  await page.button("저장 전 확인");
  await confirm();
  await text("상담사를 저장했습니다.");
  assert.equal(created.is_active, true);
  await go("/consult?type=tarot");
  await text("모의상담사");
  await go("/consult?type=saju");
  await text("모의상담사");
  for (const width of [360, 768, 1024]) {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await go("/admin/counselors");
    assert.equal(await overflow(), true, String(width));
    await go("/consult/a");
    assert.equal(await overflow(), true, String(width));
  }
  const measured = async () =>
    page.evaluate(
      "(()=>{const root=document.documentElement;return {scrollWidth:root.scrollWidth,clientWidth:root.clientWidth}})()",
    );
  const assertFits = async (label) => {
    const size = await measured();
    assert.ok(
      size.scrollWidth <= size.clientWidth,
      `${label} ${JSON.stringify(size)}`,
    );
  };
  const assertInside = async (snippet) => {
    const placed = await page.evaluate(`(() => {
      const snippet = ${JSON.stringify(snippet)};
      const nodes = Array.from(document.querySelectorAll("body *")).filter((node) => {
        const text = node.textContent || "";
        if (!text.includes(snippet)) return false;
        return !Array.from(node.children).some((child) => (child.textContent || "").includes(snippet));
      });
      return nodes.map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const text = range.getBoundingClientRect();
        const card = node.closest("li, a, section, header, dd, p") || node;
        const box = card.getBoundingClientRect();
        return text.right > box.right + 1 || text.left < box.left - 1;
      });
    })()`);
    assert.ok(placed.length > 0, snippet.slice(0, 24));
    assert.ok(
      placed.every((outside) => !outside),
      snippet.slice(0, 24),
    );
  };
  for (const width of [360, 768, 1024]) {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await go("/consult/long");
    await text(longName);
    await text(longCareer);
    await text(mixedCareer);
    await text(longTag);
    await text("둘째 줄");
    await text("선생님");
    await assertFits(`detail ${width}`);
    await assertInside(longName);
    await assertInside(longCareer);
    await assertInside(mixedCareer);
    await assertInside(longDescription.split("\n")[0]);
    const separated = await page.evaluate(`(() => {
      const name = Array.from(document.querySelectorAll("h1")).find((node) => node.textContent.includes(${JSON.stringify(longName)}));
      const button = Array.from(document.querySelectorAll("a")).find((node) => node.textContent.includes("전화 상담 예약하기"));
      const photo = document.querySelector("[data-counselor-photo-frame]");
      const rect = (node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      const hits = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const nameBox = rect(name);
      return hits(nameBox, rect(button)) || hits(nameBox, rect(photo));
    })()`);
    assert.equal(separated, false, `overlap ${width}`);
    if (width === 360) await screenshot("customer-counselor-long-360.png");
    await go("/consult");
    await text(longName);
    await text(longTag);
    await assertFits(`list ${width}`);
    await assertInside(longName);
    await go("/");
    await text(longName);
    await text("상담사 A");
    await assertFits(`home ${width}`);
    await assertInside(longName);
    await go("/consult/long/book");
    await text(longName);
    await text("전화상담 예약");
    await assertFits(`book ${width}`);
    await assertInside(longName);
    await go("/consult/gayeon");
    assert.equal(
      await page.evaluate("document.body.innerText.includes('가연샘 선생님')"),
      false,
    );
    await text("가연샘");
  }
  admin = false;
  await go("/admin/counselors");
  await text("관리자 권한이 없어요.");
  console.log("COUNSELORS_BROWSER_OK", {
    counselors: counselors.length,
    files: files.size,
    writes,
    deletes: deletes.length,
  });
} finally {
  if (page) await page.close();
  stop(app);
  fixture.close();
}
