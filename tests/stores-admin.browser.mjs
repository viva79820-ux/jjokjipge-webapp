// 격리된 HTTP DB/Storage 모형이다. 실제 Supabase 자격증명과 자료는 쓰지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, server, stop, until } from "./notices-browser-tools.mjs";

const uid = "11111111-1111-4111-8111-111111111111";
const sharedPhoto = "stores/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";
const brokenPhoto = "stores/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";
const cleanupPhoto = "stores/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const lostPhoto = "stores/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";
const longName = "가".repeat(80);
const longAddress = "주".repeat(80);
const stores = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "store-a",
    name: "같은이름",
    description: "소개 첫째\n소개 둘째",
    address: "더미 주소 A",
    hours: "오전\n오후",
    phone: null,
    image_path: null,
    sort_order: 0,
    is_active: true,
    updated_at: "2026-11-13T00:00:00.000001+00:00",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "store-b",
    name: "같은이름",
    description: "다른 매장 소개",
    address: "더미 주소 B",
    hours: "매일 12:00~20:00",
    phone: "053-000-0000",
    image_path: sharedPhoto,
    sort_order: 0,
    is_active: true,
    updated_at: "2026-11-13T00:00:00.000002+00:00",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "store-hidden",
    name: "숨긴매장",
    description: "비공개",
    address: "숨김 주소",
    hours: "휴무",
    phone: null,
    image_path: sharedPhoto,
    sort_order: 1,
    is_active: false,
    updated_at: "2026-11-13T00:00:00.000003+00:00",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    slug: "store-long",
    name: longName,
    description: `긴 소개\n${"내".repeat(40)}`,
    address: longAddress,
    hours: `긴 시간\n${"시".repeat(20)}`,
    phone: null,
    image_path: brokenPhoto,
    sort_order: 2,
    is_active: true,
    updated_at: "2026-11-13T00:00:00.000004+00:00",
  },
];
for (let index = 1; index <= 18; index += 1) {
  stores.push({
    id: `00000000-0000-4000-8000-${String(index + 4).padStart(12, "0")}`,
    slug: `filler-${index}`,
    name: `채움 ${index}`,
    description: null,
    address: "채움 주소",
    hours: null,
    phone: null,
    image_path: null,
    sort_order: 10 + index,
    is_active: false,
    updated_at: `2026-11-13T00:00:01.${String(index).padStart(6, "0")}+00:00`,
  });
}
stores[4].image_path = cleanupPhoto;
stores[5].image_path = lostPhoto;
stores[6].image_path = sharedPhoto;
stores[7].image_path = sharedPhoto;
const cleanupStoreId = stores[4].id;
const lostStoreId = stores[5].id;
const sharedStoreId = stores[6].id;
const raceStoreId = stores[7].id;
const counselors = [
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    slug: "one",
    store_id: stores[0].id,
    name: "상담사 하나",
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
    sort_order: 1,
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
    slug: "two",
    store_id: stores[1].id,
    name: "상담사 둘",
    field: "saju",
    fields: ["saju"],
    tags: [],
    careers: [],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: true,
    approval_status: "approved",
    sort_order: 2,
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3",
    slug: "hidden-public",
    store_id: stores[2].id,
    name: "숨김 매장 공개 상담사",
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
    sort_order: 3,
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd4",
    slug: "hidden-private",
    store_id: stores[2].id,
    name: "숨김 매장 비공개 상담사",
    field: "tarot",
    fields: ["tarot"],
    tags: [],
    careers: [],
    intro: "",
    description: "",
    image_path: null,
    is_recommended: false,
    is_new: false,
    is_active: false,
    approval_status: "approved",
    sort_order: 4,
  },
  {
    id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd5",
    slug: "hidden-pending",
    store_id: stores[2].id,
    name: "숨김 매장 미승인 상담사",
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
    approval_status: "pending",
    sort_order: 5,
  },
];
const files = new Map();
files.set(sharedPhoto, Buffer.from("shared-store"));
files.set(cleanupPhoto, Buffer.from("cleanup-store"));
files.set(lostPhoto, Buffer.from("lost-store"));
const imageDimensions = new Map([[sharedPhoto, { width: 160, height: 90 }]]);
let admin = true;
let seq = 0;
let cleanupFail = false;
let loseResponse = false;
let loseDeleteResponse = false;
let linkBeforeDelete = false;
const deletes = [];
const deleteTrace = [];
const saveTrace = [];
const stamp = () =>
  `2026-11-13T03:00:00.${String(++seq).padStart(6, "0")}+00:00`;
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
function sortRows(rows, order) {
  if (!order) return rows;
  return [...rows].sort((a, b) => {
    for (const part of order.split(",")) {
      const [column, direction] = part.split(".");
      if (a[column] === b[column]) continue;
      const cmp = a[column] > b[column] ? 1 : -1;
      return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}
function projectStore(row, select) {
  if (!select) return row;
  const result = {};
  for (const part of select.split(",")) result[part] = row[part];
  return result;
}
function projectCounselor(row, select, privileged) {
  const store = stores.find((item) => item.id === row.store_id) || null;
  const visible = store && (privileged || store.is_active) ? store : null;
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
    if (part.startsWith("stores(")) {
      const fields = part
        .slice("stores(".length, -1)
        .split(",")
        .map((item) => item.trim());
      result.stores = visible
        ? Object.fromEntries(fields.map((field) => [field, visible[field]]))
        : null;
    } else if (part.startsWith("consult_products("))
      result.consult_products = [];
    else result[part] = row[part];
  }
  return result;
}
function writeRows(res, rows, offset, total) {
  res.setHeader(
    "Content-Range",
    rows.length
      ? `${offset}-${offset + rows.length - 1}/${total}`
      : `*/${total}`,
  );
  res.end(JSON.stringify(rows));
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
      if (!privileged) {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      if (!files.has(path)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          size: files.get(path).length || 1200,
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
      if (!privileged || req.headers["x-upsert"] !== "false") {
        res.writeHead(401);
        res.end(JSON.stringify({ message: "upload denied" }));
        return;
      }
      if (files.has(path)) {
        res.writeHead(409);
        res.end(JSON.stringify({ message: "already exists" }));
        return;
      }
      files.set(path, rawBuffer);
      imageDimensions.set(path, { width: 160, height: 90 });
      res.end(JSON.stringify({ Key: path }));
      return;
    }
    if (req.method === "DELETE") {
      if (!privileged) {
        res.writeHead(401);
        res.end("{}");
        return;
      }
      const paths = JSON.parse(raw).prefixes || [];
      deletes.push(paths);
      if (cleanupFail) {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      for (const item of paths) {
        const used = stores.some((row) => row.image_path === item);
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
    res.end(
      JSON.stringify([
        {
          role: privileged
            ? "admin"
            : req.headers.authorization
              ? "user"
              : null,
        },
      ]),
    );
    return;
  }
  if (table === "counselors") {
    let selected = counselors.filter(
      (row) =>
        (privileged || (row.is_active && row.approval_status === "approved")) &&
        matches(row, url.searchParams),
    );
    selected = sortRows(selected, url.searchParams.get("order"));
    writeRows(
      res,
      selected.map((row) =>
        projectCounselor(row, url.searchParams.get("select"), privileged),
      ),
      0,
      selected.length,
    );
    return;
  }
  if (table !== "stores") {
    res.setHeader("Content-Range", "*/0");
    res.end("[]");
    return;
  }
  let selected = stores.filter((row) => privileged || row.is_active);
  selected = selected.filter((row) => matches(row, url.searchParams));
  if (req.method === "DELETE") {
    if (!privileged) {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission denied" }));
      return;
    }
    const target = selected[0] || null;
    deleteTrace.push({
      id: url.searchParams.get("id")?.slice(3) || null,
      version: url.searchParams.get("updated_at")?.slice(3) || null,
      active: url.searchParams.get("is_active")?.slice(3) || null,
    });
    if (linkBeforeDelete && target) {
      linkBeforeDelete = false;
      counselors.push({
        id: `dddddddd-dddd-4ddd-8ddd-${String(counselors.length + 1).padStart(12, "0")}`,
        slug: `race-${counselors.length + 1}`,
        store_id: target.id,
        name: "경합 상담사",
        field: "tarot",
        fields: ["tarot"],
        tags: [],
        careers: [],
        intro: "",
        description: "",
        image_path: null,
        is_recommended: false,
        is_new: false,
        is_active: false,
        approval_status: "pending",
        sort_order: 99,
      });
    }
    if (
      target &&
      counselors.some((counselor) => counselor.store_id === target.id)
    ) {
      res.writeHead(409);
      res.end(
        JSON.stringify({ code: "23503", message: "foreign key violation" }),
      );
      return;
    }
    if (target) stores.splice(stores.indexOf(target), 1);
    if (loseDeleteResponse && target) {
      loseDeleteResponse = false;
      req.socket.destroy();
      return;
    }
    writeRows(
      res,
      target ? [projectStore(target, url.searchParams.get("select"))] : [],
      0,
      target ? 1 : 0,
    );
    return;
  }
  if (["POST", "PATCH"].includes(req.method || "")) {
    if (!privileged) {
      res.writeHead(401);
      res.end(JSON.stringify({ code: "42501", message: "permission denied" }));
      return;
    }
    const body = JSON.parse(raw);
    if (req.method === "POST") {
      if (stores.some((row) => row.id === body.id || row.slug === body.slug)) {
        res.writeHead(409);
        res.end(JSON.stringify({ code: "23505", message: "duplicate" }));
        return;
      }
      for (const key of Object.keys(body))
        assert.ok(
          [
            "id",
            "slug",
            "name",
            "description",
            "address",
            "hours",
            "phone",
            "image_path",
            "sort_order",
            "is_active",
          ].includes(key),
          key,
        );
      assert.equal(body.slug, body.id);
      const created = { ...body, updated_at: stamp() };
      stores.push(created);
      saveTrace.push({
        mode: "create",
        sent: null,
        before: null,
        after: created.updated_at,
      });
      selected = [created];
    } else {
      assert.equal(Object.hasOwn(body, "slug"), false);
      assert.equal(Object.hasOwn(body, "id"), false);
      const version = url.searchParams.get("updated_at")?.slice(3);
      const id = url.searchParams.get("id")?.slice(3);
      const current = stores.find((row) => row.id === id);
      saveTrace.push({
        mode: "update",
        sent: version,
        before: current?.updated_at || null,
        after: null,
      });
      selected = selected.filter(
        (row) => row.id === id && row.updated_at === version,
      );
      for (const row of selected) {
        Object.assign(row, body, { updated_at: stamp() });
        saveTrace.at(-1).after = row.updated_at;
      }
    }
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
  }
  selected = sortRows(selected, url.searchParams.get("order"));
  const total = selected.length;
  if (req.method === "HEAD") {
    res.setHeader("Content-Range", `*/${total}`);
    res.writeHead(200);
    res.end();
    return;
  }
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = url.searchParams.get("limit");
  if (limit != null) selected = selected.slice(offset, offset + Number(limit));
  writeRows(
    res,
    selected.map((row) => projectStore(row, url.searchParams.get("select"))),
    offset,
    total,
  );
}
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const port = 4332;
const base = `http://127.0.0.1:${port}`;
const shotDir = join(process.cwd(), "tmp", "stores-admin");
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
      return (await fetch(`${base}/stores`)).ok;
    } catch {
      return false;
    }
  }, "app");
  page = await browser();
  const text = (value) =>
    until(
      () =>
        page.evaluate(
          `!!document.body&&document.body.innerText.includes(${JSON.stringify(value)})`,
        ),
      value,
    );
  const go = async (path) => {
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
  const setWidth = async (width) => {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  };
  const overflow = () =>
    page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1");
  const setField = async (name, value) => {
    await until(
      () =>
        page.evaluate(
          `Array.from(document.querySelectorAll('[name="${name}"]')).some((item)=>item.checkVisibility()&&!item.disabled)`,
        ),
      name,
    );
    await page.evaluate(
      `(()=>{const el=Array.from(document.querySelectorAll('[name="${name}"]')).find((item)=>item.checkVisibility());const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event("input",{bubbles:true}))})()`,
    );
  };
  const fieldValue = (name) =>
    page.evaluate(
      `(()=>{const el=Array.from(document.querySelectorAll('[name="${name}"]')).find((item)=>item.checkVisibility());return el?el.value:null})()`,
    );
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
  const selectImage = async () => {
    await page.evaluate(
      `(async()=>{const canvas=document.createElement("canvas");canvas.width=20;canvas.height=12;const context=canvas.getContext("2d");context.fillStyle="#5e3363";context.fillRect(0,0,20,12);const blob=await new Promise((resolve)=>canvas.toBlob(resolve,"image/png"));const data=new DataTransfer();data.items.add(new File([blob],"fixture.png",{type:"image/png"}));const input=Array.from(document.querySelectorAll('input[type=file]')).find((item)=>item.checkVisibility());input.files=data.files;input.dispatchEvent(new Event("change",{bubbles:true}))})()`,
    );
    await until(
      () =>
        page.evaluate(
          "document.querySelector('[data-store-image-preview]')?.naturalWidth===20",
        ),
      "preview",
    );
  };
  const touchOk = () =>
    page.evaluate(
      `(()=>{const visible=(item)=>item.checkVisibility();const controls=Array.from(document.querySelectorAll("a,button,textarea,select,input:not([type=checkbox])")).filter(visible);const boxes=Array.from(document.querySelectorAll('input[type=checkbox]')).filter(visible);const tall=(item)=>item.getBoundingClientRect().height>=44;return controls.every(tall)&&boxes.every((item)=>tall(item.closest("label")||item))})()`,
    );
  const session = {
    access_token: token,
    refresh_token: "mock-only",
    user,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  };
  await setWidth(360);
  await page.call("Page.navigate", { url: `${base}/admin/stores` });
  await until(
    () => page.evaluate("location.pathname==='/admin/login'"),
    "logged out",
  );
  await page.call("Network.setCookie", {
    name: "sb-127-auth-token",
    value: "base64-" + encode(session),
    url: base,
    path: "/",
  });
  admin = false;
  await go("/admin/stores");
  await text("관리자 권한이 없어요.");
  admin = true;
  await go("/admin/stores");
  await text("매장 관리");
  assert.equal(await text("총 22건").then(() => true), true);
  await text("같은이름");
  await text("비공개");
  assert.equal(await overflow(), true);
  await screenshot("admin-list-360.png");
  await page.evaluate(
    `Array.from(document.querySelectorAll("a")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="다음").click()`,
  );
  await text("2 / 2");
  await text("채움 18");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('같은이름')"),
    false,
  );
  await page.evaluate(
    `Array.from(document.querySelectorAll("a")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="이전").click()`,
  );
  await text("1 / 2");
  await page.evaluate(
    `(()=>{const select=document.querySelector('select[name=status]');select.value='public';select.form.requestSubmit()})()`,
  );
  await text("총 3건");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('숨긴매장')"),
    false,
  );
  await page.evaluate(
    `(()=>{const select=document.querySelector('select[name=status]');select.value='private';select.form.requestSubmit()})()`,
  );
  await text("총 19건");
  await text("숨긴매장");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('같은이름')"),
    false,
  );
  await go("/admin/stores/new?returnTo=%2Fadmin%2Fstores");
  await text("매장 등록");
  await until(
    () =>
      page.evaluate(
        `Array.from(document.querySelectorAll('[name=name]')).some((item)=>item.checkVisibility()&&!item.disabled)`,
      ),
    "new form",
  );
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll('input[type=checkbox]')).find((item)=>item.checkVisibility()).checked`,
    ),
    false,
  );
  assert.equal(await fieldValue("sort_order"), "0");
  await page.button("저장 전 확인");
  await text("매장명은 앞뒤 공백을 제외하고 1~100자로 입력해 주세요.");
  await setField("name", "신규비공개");
  await setField("description", "첫째 줄\n둘째 줄");
  await setField("address", "더미 신규 주소");
  await setField("hours", "오전\n오후");
  await setField("phone", "02-000-0000");
  await page.button("저장 전 확인");
  await text("비공개");
  await confirm();
  await text("매장을 저장했습니다.");
  const created = stores.find((item) => item.name === "신규비공개");
  assert.equal(created.is_active, false);
  assert.equal(created.slug, created.id);
  assert.match(created.description, /^첫째 줄\r?\n둘째 줄$/);
  assert.match(created.hours, /^오전\r?\n오후$/);
  await page.evaluate(
    `document.querySelector('[data-store-id="${created.id}"] a').click()`,
  );
  await text("매장 편집");
  await setField("name", "임시보관");
  await page.evaluate("history.back()");
  await until(
    () => page.evaluate("location.pathname==='/admin/stores'"),
    "back to list",
  );
  await page.evaluate("history.forward()");
  await until(
    () => page.evaluate(`location.pathname==='/admin/stores/${created.id}'`),
    "forward to editor",
  );
  await text("매장 편집");
  assert.equal(await fieldValue("name"), "임시보관");
  const beforeConsecutive = created.updated_at;
  const traceAt = saveTrace.length;
  await setField("name", "연속저장");
  await page.evaluate(
    `(()=>{const label=Array.from(document.querySelectorAll('label')).find((item)=>item.checkVisibility()&&item.textContent.trim()==='공개');label.querySelector('input').click()})()`,
  );
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  const firstTrace = saveTrace
    .slice(traceAt)
    .find((item) => item.mode === "update");
  assert.equal(firstTrace.sent, beforeConsecutive);
  assert.equal(firstTrace.before, beforeConsecutive);
  assert.equal(created.name, "연속저장");
  assert.equal(created.is_active, true);
  await page.evaluate(
    `document.querySelector('[data-store-id="${created.id}"] a').click()`,
  );
  await text("매장 편집");
  const secondBefore = created.updated_at;
  const secondAt = saveTrace.length;
  await setField("name", "연속다시");
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  const secondTrace = saveTrace
    .slice(secondAt)
    .find((item) => item.mode === "update");
  assert.equal(secondTrace.sent, secondBefore);
  assert.equal(secondTrace.before, secondBefore);
  assert.notEqual(secondTrace.after, secondBefore);
  assert.equal(created.name, "연속다시");
  await page.evaluate(
    `document.querySelector('[data-store-id="${created.id}"] a').click()`,
  );
  await text("매장 편집");
  created.updated_at = stamp();
  await setField("name", "충돌입력");
  await page.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 매장이 변경됐습니다.");
  assert.equal(await fieldValue("name"), "충돌입력");
  assert.equal(created.name, "연속다시");
  await page.button("최신 내용 다시 불러오기");
  await confirm();
  await text("최신 내용을 불러왔습니다.");
  assert.equal(await fieldValue("name"), "연속다시");
  await setField("address", "충돌 후 주소");
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  assert.equal(created.address, "충돌 후 주소");
  await page.evaluate(
    `document.querySelector('[data-store-id="${stores[0].id}"] a').click()`,
  );
  await text("매장 편집");
  loseResponse = true;
  await setField("name", "응답유실");
  await page.button("저장 전 확인");
  await confirm();
  await text("저장 결과를 다시 확인");
  assert.equal(stores[0].name, "응답유실");
  await page.button("저장 결과 다시 확인");
  await text("매장을 저장했습니다.");
  assert.equal(stores[0].name, "응답유실");
  await page.evaluate(
    `document.querySelector('[data-store-id="${stores[1].id}"] a').click()`,
  );
  await text("매장 편집");
  const beforeUpload = deletes.length;
  await selectImage();
  await page.button("선택한 파일 취소");
  await until(
    () =>
      page.evaluate(
        "document.querySelector('[data-store-image-preview]')?.naturalWidth!==20",
      ),
    "selection cancelled",
  );
  assert.equal(deletes.length, beforeUpload);
  assert.equal(stores[1].image_path, sharedPhoto);
  await selectImage();
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  assert.notEqual(stores[1].image_path, sharedPhoto);
  assert.equal(files.has(stores[1].image_path), true);
  assert.equal(files.has(sharedPhoto), true);
  const replaced = stores[1].image_path;
  await page.evaluate(
    `document.querySelector('[data-store-id="${stores[1].id}"] a').click()`,
  );
  await text("매장 편집");
  cleanupFail = true;
  await selectImage();
  await page.button("저장 전 확인");
  await confirm();
  await text("이전 사진 정리가 남았습니다");
  assert.equal(files.has(replaced), true);
  assert.notEqual(stores[1].image_path, replaced);
  cleanupFail = false;
  await page.button("파일 정리만 재시도");
  await text("매장을 저장했습니다.");
  assert.equal(files.has(replaced), false);
  assert.equal(files.has(sharedPhoto), true);
  await page.evaluate(
    `document.querySelector('[data-store-id="${stores[2].id}"] a').click()`,
  );
  await text("매장 편집");
  await page.button("사진 제거");
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  assert.equal(stores[2].image_path, null);
  assert.equal(files.has(sharedPhoto), true);
  await go("/stores");
  await text("매장상담");
  await text("상담사 하나");
  await text("상담사 둘");
  assert.equal(
    await page.evaluate(
      `(()=>{const first=document.querySelector('[data-store-slug="store-a"]');const second=document.querySelector('[data-store-slug="store-b"]');return first.innerText.includes("상담사 하나")&&!first.innerText.includes("상담사 둘")&&second.innerText.includes("상담사 둘")&&!second.innerText.includes("상담사 하나")})()`,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('[data-store-slug="store-a"] a[href^="tel:"]').getAttribute("href")`,
    ),
    "tel:010-0000-0000",
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('[data-store-slug="store-b"] a[href^="tel:"]').getAttribute("href")`,
    ),
    "tel:0530000000",
  );
  assert.equal(
    await page.evaluate("document.body.innerText.includes('숨긴매장')"),
    false,
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('[data-store-slug="store-a"] [aria-label="매장 사진 자리"]')!==null`,
    ),
    true,
  );
  await until(
    () =>
      page.evaluate(
        `document.querySelector('[data-store-slug="store-b"] [data-store-photo]')?.naturalWidth===160`,
      ),
    "store photo",
  );
  await until(
    () =>
      page.evaluate(
        `!!document.querySelector('[data-store-slug="store-long"] [aria-label="매장 사진 자리"]')&&!document.querySelector('[data-store-slug="store-long"] [data-store-photo]')`,
      ),
    "broken store photo",
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('[data-store-slug="store-a"]').innerText.includes("오전")&&document.querySelector('[data-store-slug="store-a"]').innerText.includes("오후")`,
    ),
    true,
  );
  assert.equal(await overflow(), true);
  assert.equal(await touchOk(), true);
  assert.equal(
    await page.evaluate(
      `parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom)>=44`,
    ),
    true,
  );
  await screenshot("customer-stores-360.png");
  for (const width of [768, 1024]) {
    await setWidth(width);
    assert.equal(await overflow(), true, String(width));
    assert.equal(await touchOk(), true, String(width));
    if (width === 1024) await screenshot("customer-stores-1024.png");
  }
  await setWidth(360);
  await go("/admin/stores");
  await text("매장 관리");
  await page.evaluate(
    `document.querySelector('[data-store-id="${stores[0].id}"] a').click()`,
  );
  await text("매장 편집");
  await setField("name", "바꾼이름");
  await page.evaluate(
    `(()=>{const label=Array.from(document.querySelectorAll("label")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="공개");if(label.querySelector("input").checked) label.querySelector("input").click()})()`,
  );
  await page.button("저장 전 확인");
  await confirm();
  await text("매장을 저장했습니다.");
  assert.equal(stores[0].name, "바꾼이름");
  assert.equal(stores[0].is_active, false);
  assert.equal(stores[0].slug, "store-a");
  await go("/stores");
  await text("같은이름");
  assert.equal(
    await page.evaluate("document.body.innerText.includes('바꾼이름')"),
    false,
  );
  assert.equal(
    await page.evaluate("document.body.innerText.includes('상담사 하나')"),
    false,
  );
  assert.equal(
    await page.evaluate(
      `document.querySelector('[data-store-slug="store-b"]').innerText.includes("상담사 둘")`,
    ),
    true,
  );

  await go(
    `/admin/stores/${stores[1].id}?returnTo=${encodeURIComponent("/admin/stores")}`,
  );
  await text("매장 편집");
  await text("공개 매장은 먼저 비공개로 저장해야 삭제할 수 있습니다.");
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll("button")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="매장 삭제").disabled`,
    ),
    true,
  );
  await page.evaluate(
    `(()=>{const label=Array.from(document.querySelectorAll("label")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="공개");label.querySelector("input").click()})()`,
  );
  await text(
    "공개 체크를 끈 것만으로는 삭제할 수 없습니다. 먼저 비공개로 저장해 주세요.",
  );

  await go(
    `/admin/stores/${stores[2].id}?returnTo=${encodeURIComponent("/admin/stores?status=private")}`,
  );
  await text("현재 확인된 연결 상담사: 3명");
  await text(
    "연결된 상담사가 있습니다. 상담사 관리에서 소속을 변경하거나 해제한 뒤 다시 시도해 주세요.",
  );
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll("button")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="매장 삭제").disabled`,
    ),
    true,
  );
  const linkedDeletes = deleteTrace.length;
  await page.button("삭제 조건 다시 확인");
  await text("현재 확인된 연결 상담사: 3명");
  assert.equal(deleteTrace.length, linkedDeletes);

  const cleanupBefore = deleteTrace.length;
  cleanupFail = true;
  await go(
    `/admin/stores/${cleanupStoreId}?returnTo=${encodeURIComponent("/admin/stores?page=2&status=private")}`,
  );
  await page.button("매장 삭제");
  await until(
    () =>
      page.evaluate(
        `document.activeElement?.getAttribute("name")==="confirmed_name"`,
      ),
    "delete confirmation focus",
  );
  for (const width of [360, 768, 1024]) {
    await setWidth(width);
    assert.equal(await overflow(), true, `delete modal ${width}`);
    assert.equal(await touchOk(), true, `delete modal touch ${width}`);
  }
  await setWidth(360);
  await page.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await page.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await until(
    () => page.evaluate("!document.querySelector('dialog[open]')"),
    "delete modal escape",
  );
  assert.equal(
    await page.evaluate(
      `document.activeElement?.textContent.trim()==="매장 삭제"`,
    ),
    true,
  );
  await page.button("매장 삭제");
  await page.fill("confirmed_name", "채움 1");
  await page.button("매장 영구 삭제");
  await text("매장 DB 삭제가 끝났습니다.");
  await text("사진 파일 정리만 남았습니다.");
  assert.equal(deleteTrace.length, cleanupBefore + 1);
  assert.equal(files.has(cleanupPhoto), true);
  cleanupFail = false;
  await page.button("사진 정리만 재시도");
  await text("매장을 삭제했습니다.");
  assert.equal(deleteTrace.length, cleanupBefore + 1);
  assert.equal(files.has(cleanupPhoto), false);
  assert.equal(
    await page.evaluate(
      `location.pathname==="/admin/stores"&&!new URLSearchParams(location.search).has("page")&&new URLSearchParams(location.search).get("status")==="private"`,
    ),
    true,
  );

  await go(
    `/admin/stores/${lostStoreId}?returnTo=${encodeURIComponent("/admin/stores?status=private")}`,
  );
  await page.button("매장 삭제");
  await page.fill("confirmed_name", "채움 2");
  loseDeleteResponse = true;
  await page.button("매장 영구 삭제");
  await text("삭제 결과 다시 확인");
  assert.equal(
    stores.some((item) => item.id === lostStoreId),
    false,
  );
  assert.equal(files.has(lostPhoto), true);
  const lostDeleteCount = deleteTrace.length;
  await page.button("삭제 결과 다시 확인");
  await text("매장을 삭제했습니다.");
  assert.equal(deleteTrace.length, lostDeleteCount);
  assert.equal(files.has(lostPhoto), false);

  await go(
    `/admin/stores/${sharedStoreId}?returnTo=${encodeURIComponent("/admin/stores?status=private")}`,
  );
  await page.button("매장 삭제");
  await page.fill("confirmed_name", "채움 3");
  await page.button("매장 영구 삭제");
  await text("매장을 삭제했습니다.");
  assert.equal(files.has(sharedPhoto), true);

  await go("/admin/stores?status=private");
  await text("매장 관리");
  await page.evaluate(
    `document.querySelector('[data-store-id="${raceStoreId}"] a').click()`,
  );
  await text("매장 편집");
  await selectImage();
  await text("선택 중인 새 사진이 있습니다.");
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll("button")).find((item)=>item.checkVisibility()&&item.textContent.trim()==="매장 삭제").disabled`,
    ),
    true,
  );
  await page.button("선택한 파일 취소");
  await page.button("매장 삭제");
  await until(
    () => page.evaluate("!!document.querySelector('dialog[open]')"),
    "delete modal before activity",
  );
  await page.evaluate("history.back()");
  await until(
    () => page.evaluate("location.pathname==='/admin/stores'"),
    "delete activity back",
  );
  await page.evaluate("history.forward()");
  await until(
    () => page.evaluate(`location.pathname==='/admin/stores/${raceStoreId}'`),
    "delete activity forward",
  );
  await text("매장 편집");
  assert.equal(
    await page.evaluate("!!document.querySelector('dialog[open]')"),
    false,
  );
  assert.equal(await fieldValue("name"), "채움 4");
  await page.button("매장 삭제");
  await page.fill("confirmed_name", "채움 4");
  linkBeforeDelete = true;
  const raceDeletes = deleteTrace.length;
  await page.button("매장 영구 삭제");
  await text(
    "연결된 상담사가 있습니다. 상담사 관리에서 소속을 변경하거나 해제한 뒤 다시 시도해 주세요.",
  );
  assert.equal(deleteTrace.length, raceDeletes + 1);
  assert.equal(
    stores.some((item) => item.id === raceStoreId),
    true,
  );

  await go("/stores");
  assert.equal(
    await page.evaluate(
      `!document.body.innerText.includes("채움 1")&&!document.body.innerText.includes("채움 2")&&!document.body.innerText.includes("채움 3")`,
    ),
    true,
  );
  await page.call("Network.clearBrowserCookies");
  await page.call("Page.navigate", { url: `${base}/admin/stores` });
  await until(
    () => page.evaluate("location.pathname==='/admin/login'"),
    "logged out again",
  );
  console.log("STORE_BROWSER_OK", {
    stores: stores.length,
    deletes: deletes.length,
    shots: shotDir,
  });
} finally {
  if (page) await page.close();
  stop(app);
  fixture.close();
}
