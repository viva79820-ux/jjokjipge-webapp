// Isolated HTTP DB/Storage only. No real Supabase credentials or resources.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  browser,
  server,
  stop,
  until,
  delay,
} from "./notices-browser-tools.mjs";
const uid = "11111111-1111-4111-8111-111111111111",
  rows = [],
  files = new Map(),
  imageDimensions = new Map(),
  issues = [];
let admin = true,
  seq = 0,
  cleanupFail = false,
  loseResponse = false,
  loseUploadResponse = false,
  readFail = false,
  writes = 0;
const noticeReads = [];
const stamp = () =>
  `2026-11-09T01:00:00.${String(++seq).padStart(6, "0")}+00:00`;
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.invalid",
};
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const jwtHead = encode({ alg: "HS256", typ: "JWT" }),
  jwtBody = encode({
    ...user,
    sub: uid,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
const token = `${jwtHead}.${jwtBody}.${createHmac("sha256", "mock-only").update(`${jwtHead}.${jwtBody}`).digest("base64url")}`;
const fixture = createServer((req, res) =>
  handle(req, res).catch(() => {
    issues.push("fixture failure");
    res.writeHead(500);
    res.end("{}");
  }),
);
async function handle(req, res) {
  const u = new URL(req.url, "http://fixture.invalid");
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
  if (u.pathname === "/auth/v1/user") {
    res.end(JSON.stringify(user));
    return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const rawBuffer = Buffer.concat(chunks);
  const raw = rawBuffer.toString();
  if (u.pathname.startsWith("/storage/v1/")) {
    if (u.pathname.includes("/object/info/")) {
      const path = u.pathname.split("/public-images/")[1];
      if (!files.has(path)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          size: Buffer.isBuffer(files.get(path))
            ? files.get(path).length
            : files.get(path),
          content_type: "image/png",
        }),
      );
      return;
    }
    if (
      req.method === "GET" &&
      u.pathname.includes("/object/public/public-images/")
    ) {
      const path = u.pathname.split("/public-images/")[1];
      const image = files.get(path);
      const dimensions = imageDimensions.get(path);
      if (!Buffer.isBuffer(image)) {
        res.writeHead(404);
        res.end("{}");
        return;
      }
      if (dimensions) {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"><rect width="100%" height="100%" fill="#5e3363"/><rect width="25%" height="25%" fill="#f2c775"/></svg>`,
        );
      } else {
        res.setHeader("Content-Type", "image/png");
        res.end(image);
      }
      return;
    }
    if (req.method === "POST") {
      assert.equal(req.headers.authorization, `Bearer ${token}`);
      const path = u.pathname.split("/public-images/")[1];
      if (files.has(path)) {
        res.writeHead(409);
        res.end(
          JSON.stringify({
            statusCode: "409",
            error: "Duplicate",
            message: "Object already exists",
          }),
        );
        return;
      }
      files.set(path, rawBuffer);
      if (loseUploadResponse) {
        loseUploadResponse = false;
        req.socket.destroy();
        return;
      }
      res.end(JSON.stringify({ Key: "public-images/" + path }));
      return;
    }
    if (req.method === "DELETE") {
      if (cleanupFail) {
        res.writeHead(400);
        res.end("{}");
        return;
      }
      for (const path of JSON.parse(raw).prefixes) files.delete(path);
      res.end("[]");
      return;
    }
    res.end("{}");
    return;
  }
  const table = u.pathname.split("/").at(-1);
  if (table === "profiles") {
    res.end(JSON.stringify({ role: admin ? "admin" : "user" }));
    return;
  }
  if (["counselors", "faqs", "stores"].includes(table)) {
    res.setHeader("Content-Range", "0-0/0");
    res.end("[]");
    return;
  }
  if (table === "reservations" || table === "inquiries") {
    res.setHeader("Content-Range", "0-0/0");
    res.end("[]");
    return;
  }
  assert.equal(table, "notices");
  if (req.method === "GET")
    noticeReads.push({
      auth: req.headers.authorization || "",
      search: u.searchParams.toString(),
    });
  if (readFail && req.method === "GET") {
    res.writeHead(400);
    res.end("{}");
    return;
  }
  let selected = rows.filter((row) =>
    [...u.searchParams].every(
      ([k, v]) => !v.startsWith("eq.") || String(row[k]) === v.slice(3),
    ),
  );
  if (["POST", "PATCH", "DELETE"].includes(req.method)) {
    assert.equal(admin, true);
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    writes++;
    if (req.method === "POST") {
      const input = JSON.parse(raw);
      assert.ok(!rows.some((r) => r.id === input.id));
      const row = { ...input, created_at: stamp(), updated_at: stamp() };
      rows.push(row);
      selected = [row];
    }
    if (req.method === "PATCH")
      for (const row of selected)
        Object.assign(row, JSON.parse(raw), { updated_at: stamp() });
    if (req.method === "DELETE")
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
    if (loseResponse) {
      loseResponse = false;
      req.socket.destroy();
      return;
    }
  }
  const order = u.searchParams.get("order");
  if (order)
    selected.sort((a, b) => {
      for (const part of order.split(",")) {
        const [column, direction] = part.split(".");
        if (a[column] === b[column]) continue;
        if (a[column] == null) return 1;
        if (b[column] == null) return -1;
        const cmp = a[column] > b[column] ? 1 : -1;
        return direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  const count = selected.length;
  const offset = Number(u.searchParams.get("offset") || 0),
    limit = Number(u.searchParams.get("limit") || 20);
  selected = selected.slice(offset, offset + limit);
  res.setHeader(
    "Content-Range",
    `0-${Math.max(0, selected.length - 1)}/${count}`,
  );
  const columns = u.searchParams.get("select")?.split(",");
  let result = selected.map((row) =>
    columns ? Object.fromEntries(columns.map((k) => [k, row[k]])) : row,
  );
  if (req.headers.accept?.includes("object+json")) result = result[0] || null;
  res.end(JSON.stringify(result));
}
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const port = 4327,
  base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${fixture.address().port}`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public",
};
let app, b;
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
      return (await fetch(base + "/category")).ok;
    } catch {
      return false;
    }
  }, "app");
  b = await browser();
  const text = (s) =>
    until(
      () =>
        b.evaluate(`document.body.innerText.includes(${JSON.stringify(s)})`),
      s,
    );
  const go = async (path) => {
    console.log("MOCK_OPEN", path);
    await b.go(base + path);
  };
  const screenshot = async (name) => {
    const directory = process.env.NOTICES_SCREENSHOT_DIR;
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    const { data } = await b.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    writeFileSync(join(directory, name), Buffer.from(data, "base64"));
  };
  const confirm = async () => {
    await until(
      () => b.evaluate("!!document.querySelector('dialog[open]')"),
      "modal opened",
    );
    assert.ok(
      await b.evaluate(
        "(()=>{const d=document.querySelector('dialog[open]');const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()",
      ),
    );
    await b.button("확인 후 처리");
    await until(
      () => b.evaluate("!document.querySelector('dialog[open]')"),
      "modal closed",
    );
    await delay(300);
  };
  const session = {
    access_token: token,
    refresh_token: "mock-only",
    user,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
  };
  await b.call("Network.setCookie", {
    name: "sb-127-auth-token",
    value: "base64-" + encode(session),
    url: base,
    path: "/",
  });
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/notices/new");
  assert.equal(
    await b.evaluate(
      "document.querySelector('[data-notice-image-preview]')===null",
    ),
    true,
  );
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='첨부 제거')",
    ),
    false,
  );
  await text("첨부 이미지");
  await b.fill("title", "모의 공지");
  await b.fill("body", "긴본문".repeat(100));
  await b.button("저장 전 확인");
  await b.button("돌아가기");
  assert.equal(writes, 0);
  await b.button("저장 전 확인");
  loseResponse = true;
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.equal(rows.length, 1);
  const id = rows[0].id;
  assert.equal(rows[0].image_path, null);
  const selectImage = async (width = 20, height = 30, name = "fixture.png") => {
    await b.evaluate(
      `(async()=>{const c=document.createElement('canvas');c.width=${width};c.height=${height};const x=c.getContext('2d');x.fillStyle='#5e3363';x.fillRect(0,0,c.width,c.height);x.fillStyle='#f2c775';x.fillRect(0,0,Math.max(1,c.width/4),Math.max(1,c.height/4));const blob=await new Promise(r=>c.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));const el=Array.from(document.querySelectorAll('input[type=file]')).find(e=>e.checkVisibility());el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await b.fill("image_alt", "모의 이미지");
    await until(
      () =>
        b.evaluate(
          `(()=>{const image=document.querySelector('[data-notice-image-preview]');return image?.src.startsWith('blob:')&&image.naturalWidth===${width}&&image.naturalHeight===${height}})()`,
        ),
      "selected image preview",
    );
    return b.evaluate(
      "document.querySelector('[data-notice-image-preview]').src",
    );
  };
  await go("/notices");
  await text("등록된 공지사항이 없습니다.");
  await go("/admin/notices/new");
  await b.fill("title", "");
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('[name=body]')).find(e=>e.checkVisibility()).value",
    ),
    "",
  );
  await go("/admin/notices/" + id);
  await b.evaluate(
    "(()=>{const label=Array.from(document.querySelectorAll('label')).find(e=>e.checkVisibility()&&e.textContent.trim()==='공개');label.querySelector('input').click()})()",
  );
  await selectImage(240, 1200, "세로-포스터.png");
  await b.button("저장 전 확인");
  await confirm();
  assert.equal(rows[0].is_published, true);
  assert.equal(files.size, 1);
  imageDimensions.set(rows[0].image_path, { width: 240, height: 1200 });
  await go("/notices");
  await text("모의 공지");
  const longTitle =
    "모바일에서도 자연스럽게 여러 줄로 표시되는 긴 공지사항 제목입니다";
  const longBody =
    "첫째 줄에는 공지 내용을 읽기 쉽게 적습니다.\n\n둘째 줄은 줄바꿈을 유지합니다.\n" +
    "띄어쓰기없는긴문자열".repeat(20);
  rows[0].title = longTitle;
  rows[0].body = longBody;
  rows[0].is_pinned = true;
  await go("/notices/" + id);
  await text("첫째 줄");
  await until(
    () =>
      b.evaluate(
        "document.querySelector('[data-notice-detail-image]')?.naturalHeight===1200",
      ),
    "customer notice image",
  );
  const detailLayout = await b.evaluate(
    `(()=>{
      const title=document.querySelector('article h1');
      const body=document.querySelector('article>p.whitespace-pre-wrap');
      const image=document.querySelector('[data-notice-detail-image]');
      const header=document.querySelector('article header');
      const imageArea=image.parentElement.parentElement;
      const titleRect=title.getBoundingClientRect();
      const bodyRect=body.getBoundingClientRect();
      const imageRect=image.getBoundingClientRect();
      return {
        titleSize:parseFloat(getComputedStyle(title).fontSize),
        bodySize:parseFloat(getComputedStyle(body).fontSize),
        titleLines:Math.round(titleRect.height/parseFloat(getComputedStyle(title).lineHeight)),
        headerBottom:header.getBoundingClientRect().bottom,
        bodyTop:bodyRect.top,
        bodyBottom:bodyRect.bottom,
        imageTop:imageArea.getBoundingClientRect().top,
        imageWidth:imageRect.width,
        imageHeight:imageRect.height,
        naturalWidth:image.naturalWidth,
        naturalHeight:image.naturalHeight,
      };
    })()`,
  );
  assert.ok(detailLayout.titleSize > detailLayout.bodySize);
  assert.ok(detailLayout.titleLines >= 2);
  assert.ok(detailLayout.bodyTop > detailLayout.headerBottom);
  assert.ok(detailLayout.imageTop > detailLayout.bodyBottom);
  assert.ok(detailLayout.imageHeight > 320);
  assert.ok(
    Math.abs(
      detailLayout.imageWidth / detailLayout.imageHeight -
        detailLayout.naturalWidth / detailLayout.naturalHeight,
    ) < 0.01,
  );
  assert.deepEqual(
    await b.evaluate(
      `(()=>{const a=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.includes('원본 이미지'));return {target:a.target,rel:a.rel}})()`,
    ),
    { target: "_blank", rel: "noopener noreferrer" },
  );
  await screenshot("customer-notice-detail-360.png");
  for (const width of [360, 768, 1024]) {
    await b.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.ok(
      await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),
    );
  }
  imageDimensions.set(rows[0].image_path, { width: 1200, height: 240 });
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/notices/" + id);
  await until(
    () =>
      b.evaluate(
        "document.querySelector('[data-notice-detail-image]')?.naturalWidth===1200",
      ),
    "wide customer notice image",
  );
  const wideDetail = await b.evaluate(
    `(()=>{const image=document.querySelector('[data-notice-detail-image]');const rect=image.getBoundingClientRect();return {width:rect.width,height:rect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,overflow:document.documentElement.scrollWidth>innerWidth}})()`,
  );
  assert.equal(wideDetail.overflow, false);
  assert.ok(wideDetail.width > wideDetail.height);
  assert.ok(
    Math.abs(
      wideDetail.width / wideDetail.height -
        wideDetail.naturalWidth / wideDetail.naturalHeight,
    ) < 0.01,
  );
  rows[0].title = "모의 공지";
  rows[0].body = "긴본문".repeat(100);
  rows[0].is_pinned = false;
  imageDimensions.set(rows[0].image_path, { width: 240, height: 1200 });
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 768,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/admin/notices/" + id);
  await until(
    () =>
      b.evaluate(
        "document.querySelector('[data-notice-image-preview]')?.naturalHeight===1200",
      ),
    "existing image preview",
  );
  const previewLayout = async () =>
    b.evaluate(
      `(()=>{
        const image=document.querySelector('[data-notice-image-preview]');
        const rect=image.getBoundingClientRect();
        const section=image.closest('section').getBoundingClientRect();
        return {
          width:rect.width,
          height:rect.height,
          naturalWidth:image.naturalWidth,
          naturalHeight:image.naturalHeight,
          withinSection:rect.left>=section.left&&rect.right<=section.right,
        };
      })()`,
    );
  const checkPreview = async ({ small = false } = {}) => {
    const layout = await previewLayout();
    assert.ok(layout.height <= 320);
    assert.ok(layout.withinSection);
    assert.ok(
      Math.abs(
        layout.width / layout.height -
          layout.naturalWidth / layout.naturalHeight,
      ) < 0.01,
    );
    if (small) {
      assert.ok(layout.width <= layout.naturalWidth);
      assert.ok(layout.height <= layout.naturalHeight);
    }
  };
  await checkPreview();
  for (const width of [360, 1024, 768]) {
    await b.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await checkPreview();
    assert.equal(
      await b.evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&Array.from(document.querySelectorAll('button')).filter(e=>e.checkVisibility()).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})`,
      ),
      true,
    );
  }
  const existingLink = await b.evaluate(
    `(()=>{const a=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.trim()==='이미지 크게 보기');return {href:a.href,target:a.target,rel:a.rel}})()`,
  );
  assert.equal(existingLink.target, "_blank");
  assert.equal(existingLink.rel, "noopener noreferrer");
  assert.ok(existingLink.href.includes("/storage/v1/object/public/"));
  let writesBeforePreview = writes;
  await b.evaluate(
    `(()=>{const a=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.trim()==='이미지 크게 보기');a.addEventListener('click',e=>e.preventDefault(),{once:true});a.click()})()`,
  );
  await delay(200);
  assert.equal(writes, writesBeforePreview);
  await screenshot("admin-notice-editor-768.png");

  const tallBlob = await selectImage(200, 1000, "새-세로.png");
  await checkPreview();
  const blobLink = await b.evaluate(
    `(()=>{const a=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.trim()==='이미지 크게 보기');return {href:a.href,target:a.target,rel:a.rel}})()`,
  );
  assert.equal(blobLink.href, tallBlob);
  assert.equal(blobLink.target, "_blank");
  assert.equal(blobLink.rel, "noopener noreferrer");
  writesBeforePreview = writes;
  await b.evaluate(
    `(()=>{const a=Array.from(document.querySelectorAll('a')).find(e=>e.textContent.trim()==='이미지 크게 보기');a.addEventListener('click',e=>e.preventDefault(),{once:true});a.click()})()`,
  );
  await delay(200);
  assert.equal(writes, writesBeforePreview);

  const wideBlob = await selectImage(1000, 200, "새-가로.png");
  assert.notEqual(wideBlob, tallBlob);
  await checkPreview();
  await until(
    () =>
      b.evaluate(`fetch(${JSON.stringify(tallBlob)}).then(()=>false,()=>true)`),
    "old object URL revoked",
  );
  await selectImage(40, 30, "작은-이미지.png");
  await checkPreview({ small: true });

  // A -> B: DB succeeds, response is lost, failed read must preserve both.
  const a = rows[0].image_path;
  await selectImage();
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  const imageB = rows[0].image_path;
  assert.notEqual(imageB, a);
  assert.ok(files.has(a) && files.has(imageB));
  readFail = true;
  await b.button("저장 결과 다시 확인");
  await until(
    () =>
      b.evaluate(
        "Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='저장 결과 다시 확인'&&!e.disabled)",
      ),
    "result read finished",
  );
  await text("결과를 확인하지 못했습니다.");
  assert.ok(files.has(a) && files.has(imageB));
  readFail = false;
  admin = false;
  await b.button("저장 결과 다시 확인");
  await text("관리자 권한이 필요합니다.");
  assert.ok(files.has(a) && files.has(imageB));
  assert.ok(await b.evaluate("document.querySelector('fieldset').disabled"));
  admin = true;
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.ok(!files.has(a) && files.has(imageB));
  console.log(
    "PASS replacement lost-response recovery and failed-read preservation",
  );
  await go("/admin/notices/" + id);
  // Keep an image referenced by another notice, even after replacement.
  const shared = {
    ...rows[0],
    id: "33333333-3333-4333-8333-333333333333",
    title: "참조 보존 모형",
  };
  rows.push(shared);
  await selectImage();
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.ok(files.has(imageB));
  rows.splice(rows.indexOf(shared), 1);
  files.delete(imageB); // Fixture-only teardown of the reference fixture.
  await go("/admin/notices/" + id);
  // Retain the original regression: response loss while keeping the same image.
  const keptImage = rows[0].image_path;
  await b.fill("title", "이미지 유지 복구");
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.equal(rows[0].image_path, keptImage);
  assert.ok(files.has(keptImage));
  await go("/admin/notices/" + id);
  // Cleanup failure remains visible; retry never repeats DB writes.
  const beforeReplace = rows[0].image_path;
  await selectImage();
  cleanupFail = true;
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  await b.button("저장 결과 다시 확인");
  await text("파일 정리만 재시도");
  assert.ok(files.has(beforeReplace) && files.has(rows[0].image_path));
  let countBeforeRetry = writes;
  cleanupFail = false;
  await b.button("파일 정리만 재시도");
  await text("공지를 저장했습니다.");
  assert.equal(writes, countBeforeRetry);
  assert.ok(!files.has(beforeReplace));
  await go("/admin/notices/" + id);
  const beforeRemove = rows[0].image_path;
  await b.button("첨부 제거");
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.equal(rows[0].image_path, null);
  assert.ok(!files.has(beforeRemove));
  console.log(
    "PASS reference guard, cleanup-only retry and attachment removal recovery",
  );
  await go("/admin/notices/" + id);
  // Upload persists but loses its response, and cleanup is initially unavailable.
  await selectImage();
  cleanupFail = true;
  loseUploadResponse = true;
  countBeforeRetry = writes;
  await b.button("저장 전 확인");
  await confirm();
  await text("이번 업로드 파일 정리만 재시도");
  assert.equal(writes, countBeforeRetry);
  assert.equal(files.size, 1);
  cleanupFail = false;
  await b.button("이번 업로드 파일 정리만 재시도");
  await text("이번 업로드 파일의 정리·참조 확인을 마쳤습니다.");
  assert.equal(files.size, 0);
  assert.equal(writes, countBeforeRetry);
  await b.button("저장 전 확인");
  await confirm();
  await text("공지를 저장했습니다.");
  await go("/admin/notices/" + id);
  await b.fill("body", "유지할 충돌 초안");
  const previous = rows[0].image_path;
  const latestPath = "notices/44444444-4444-4444-8444-444444444444.png";
  files.set(latestPath, 100);
  rows[0].image_path = latestPath;
  files.delete(previous); // Simulate a separate successful editor's cleanup.
  rows[0].updated_at = stamp();
  await b.button("저장 전 확인");
  await b.button("확인 후 처리");
  await text("다른 작업으로 공지가 변경됐습니다.");
  await until(
    () =>
      b.evaluate(
        "document.activeElement?.textContent.includes('최신 내용 다시 불러오기')",
      ),
    "conflict reload focus",
  );
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('[name=body]')).find(e=>e.checkVisibility()).value",
    ),
    "유지할 충돌 초안",
  );
  await b.button("최신 내용 다시 불러오기");
  await text("작성 중인 입력");
  await confirm();
  // Recovery must use the reloaded original's image and exact version.
  await selectImage();
  await b.fill("title", "응답 유실 저장");
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(files.size, 2);
  await b.button("저장 결과 다시 확인");
  await text("공지를 저장했습니다.");
  assert.ok(!files.has(latestPath) && files.has(rows[0].image_path));
  await go("/admin/notices/" + id);
  // A second explicit reload changes the original again before DELETE recovery.
  const beforeDelete = rows[0].image_path;
  const deletePath = "notices/55555555-5555-4555-8555-555555555555.png";
  files.set(deletePath, 100);
  rows[0].image_path = deletePath;
  rows[0].updated_at = stamp();
  files.delete(beforeDelete);
  await b.button("저장 전 확인");
  await b.button("확인 후 처리");
  await text("다른 작업으로 공지가 변경됐습니다.");
  await b.button("최신 내용 다시 불러오기");
  await confirm();
  cleanupFail = true;
  loseResponse = true;
  await b.button("공지 삭제");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  assert.equal(files.size, 1);
  await b.button("저장 결과 다시 확인");
  await text("파일 정리만 재시도");
  assert.equal(rows.length, 0);
  const before = writes;
  cleanupFail = false;
  await b.button("파일 정리만 재시도");
  await text("공지를 저장했습니다.");
  assert.equal(writes, before);
  assert.equal(files.size, 0);
  console.log(
    "PASS upload response-loss cleanup retry and reloaded-original replacement/delete recovery",
  );
  const setChecked = async (label, checked) => {
    await b.evaluate(
      `(()=>{const label=Array.from(document.querySelectorAll('label')).find(e=>e.checkVisibility()&&e.textContent.trim()===${JSON.stringify(label)});const input=label.querySelector('input');if(input.checked!==${checked})input.click()})()`,
    );
  };
  const popupOpen = () =>
    b.evaluate(
      "!!document.querySelector('dialog[open]')&&document.body.innerText.includes('공지 자세히 보기')",
    );
  const popupSettled = () =>
    b.evaluate(
      "document.querySelector('[data-notice-popup-ready=\"yes\"]')!==null",
    );
  const expectHomePopup = async (open) => {
    await until(popupSettled, open ? "popup ready" : "popup stayed closed");
    if (open) await until(popupOpen, "popup dialog");
    else assert.equal(await popupOpen(), false);
  };
  const seoulToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  for (const width of [360, 768, 1024]) {
    await b.call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await go("/category");
    const card = await b.evaluate(
      `(()=>{
        const notice=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/notices');
        const support=Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/support');
        const caption=notice.querySelectorAll('p')[1];
        const icon=notice.querySelector('svg');
        const chevron=notice.querySelectorAll('svg')[1];
        const cap=caption.getBoundingClientRect();
        const ch=chevron.getBoundingClientRect();
        const ir=icon.getBoundingClientRect();
        return {
          title:notice.querySelector('p').textContent,
          caption:caption.textContent,
          icon:Math.round(ir.width),
          color:getComputedStyle(icon).color,
          hidden:icon.getAttribute('aria-hidden'),
          above:notice.getBoundingClientRect().bottom<=support.getBoundingClientRect().top+1,
          gap:ch.left-cap.right,
          inside:ch.right<=notice.getBoundingClientRect().right+1,
          overflow:document.documentElement.scrollWidth>innerWidth,
          height:notice.getBoundingClientRect().height,
          support:support.getAttribute('href'),
        };
      })()`,
    );
    assert.equal(card.title, "공지사항");
    assert.equal(card.caption, "매장 소식 · 운영시간 · 이용 안내");
    assert.equal(card.icon, 28);
    assert.equal(card.color, "rgb(201, 162, 39)");
    assert.equal(card.hidden, "true");
    assert.equal(card.above, true);
    assert.equal(card.support, "/support");
    assert.ok(card.gap > 0);
    assert.equal(card.inside, true);
    assert.equal(card.overflow, false);
    assert.ok(card.height >= 96);
    if (width === 360) await screenshot("category-notice-card-360.png");
  }
  await b.evaluate(
    "Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/notices').click()",
  );
  await text("등록된 공지사항이 없습니다.");
  await go("/category");
  await b.evaluate(
    "Array.from(document.querySelectorAll('a')).find(a=>a.getAttribute('href')==='/support').click()",
  );
  await text("자주 묻는 질문");
  await b.call("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  const t1 = "2026-11-09T00:00:00.000000+00:00";
  const t2 = "2026-11-10T00:00:00.000000+00:00";
  const t3 = "2026-11-11T00:00:00.000000+00:00";
  const tieLow = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tieHigh = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const addNotice = (partial) => {
    const row = {
      image_path: null,
      image_alt: null,
      is_pinned: false,
      is_published: false,
      is_popup: false,
      published_at: null,
      body: "본문",
      created_at: stamp(),
      updated_at: stamp(),
      ...partial,
    };
    rows.push(row);
    return row;
  };
  addNotice({
    id: "10000000-0000-4000-8000-000000000001",
    title: "고정 이전 팝업",
    is_pinned: true,
    is_published: true,
    is_popup: true,
    published_at: t1,
  });
  addNotice({
    id: "20000000-0000-4000-8000-000000000002",
    title: "비공개 최신",
    is_published: false,
    is_popup: true,
    published_at: t3,
  });
  addNotice({
    id: "30000000-0000-4000-8000-000000000003",
    title: "공개만 최신",
    is_published: true,
    is_popup: false,
    is_pinned: true,
    published_at: t3,
  });
  addNotice({
    id: tieLow,
    title: "동률 낮은 아이디",
    is_published: true,
    is_popup: true,
    published_at: t2,
  });
  const winner = addNotice({
    id: tieHigh,
    title: "동률 최신 아이디",
    is_published: true,
    is_popup: true,
    published_at: t2,
    body: "첫 줄\n둘째 줄" + "가".repeat(400),
  });
  const beforeReads = noticeReads.length;
  await go("/");
  await expectHomePopup(true);
  await text("동률 최신 아이디");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('비공개 최신')"),
    false,
  );
  assert.equal(
    await b.evaluate("document.body.innerText.includes('공개만 최신')"),
    false,
  );
  assert.equal(
    await b.evaluate("document.body.innerText.includes('고정 이전 팝업')"),
    false,
  );
  assert.equal(
    await b.evaluate("document.body.innerText.includes('동률 낮은 아이디')"),
    false,
  );
  assert.equal(
    await b.evaluate("document.body.innerText.includes('끝표시')"),
    false,
  );
  winner.body = "첫 줄\n둘째 줄" + "가".repeat(290) + "끝표시";
  const homeQuery = noticeReads
    .slice(beforeReads)
    .find((q) => q.search.includes("is_popup"));
  assert.ok(homeQuery);
  assert.notEqual(homeQuery.auth, `Bearer ${token}`);
  const query = decodeURIComponent(homeQuery.search);
  assert.ok(query.includes("is_published=eq.true"));
  assert.ok(query.includes("is_popup=eq.true"));
  assert.ok(query.includes("published_at.desc"));
  assert.ok(query.includes("id.desc"));
  assert.ok(query.includes("limit=1"));
  assert.ok(query.includes("select=id,title,body,image_path,image_alt"));
  assert.equal(query.includes("is_pinned"), false);
  const popupFrame = async () =>
    b.evaluate(
      `(()=>{
        const dialog=document.querySelector('dialog[open]');
        const tab=document.querySelector('nav[aria-label="하단 메뉴"]');
        const buttons=[...dialog.querySelectorAll('button')];
        const marked=dialog.querySelector('[data-notice-popup-image]');
        const image=marked?.tagName==='IMG'?marked:marked?.querySelector('img');
        const tabTop=tab.getBoundingClientRect().top;
        const box=dialog.getBoundingClientRect();
        return {
          title:dialog.querySelector('h2').textContent,
          lines:dialog.innerText.includes('첫 줄')&&dialog.innerText.includes('둘째 줄'),
          buttons:buttons.map(e=>e.textContent.trim()),
          buttonOk:buttons.every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.top>=box.top&&r.bottom<=box.bottom+1&&r.bottom<=tabTop+1&&r.left>=0&&r.right<=innerWidth}),
          dialogBottom:box.bottom,
          tabTop,
          overflow:document.documentElement.scrollWidth>innerWidth,
          image:image?{width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight}:null,
          failed:dialog.innerText.includes('이미지를 불러오지 못했습니다.'),
        };
      })()`,
    );
  let frame = await popupFrame();
  assert.equal(frame.title, "공지사항");
  assert.equal(frame.lines, true);
  assert.equal(frame.image, null);
  assert.equal(frame.failed, false);
  assert.deepEqual(frame.buttons, [
    "공지 자세히 보기",
    "오늘 하루 보지 않기",
    "닫기",
  ]);
  assert.equal(frame.buttonOk, true);
  assert.ok(frame.dialogBottom <= frame.tabTop);
  assert.equal(frame.overflow, false);
  assert.equal(
    await b.evaluate(
      "document.activeElement?.closest('dialog')===document.querySelector('dialog[open]')",
    ),
    true,
  );
  const imagePath = "notices/66666666-6666-4666-8666-666666666666.png";
  files.set(imagePath, Buffer.from("fixture"));
  winner.image_path = imagePath;
  winner.image_alt = "팝업 이미지";
  const checkImage = async (size, { small = false } = {}) => {
    imageDimensions.set(imagePath, size);
    await go("/");
    await expectHomePopup(true);
    await until(
      () =>
        b.evaluate(
          `document.querySelector('[data-notice-popup-image]')?.naturalWidth===${size.width}`,
        ),
      "popup image decoded",
    );
    frame = await popupFrame();
    assert.equal(frame.failed, false);
    assert.equal(frame.buttonOk, true);
    assert.ok(frame.dialogBottom <= frame.tabTop);
    assert.ok(
      Math.abs(
        frame.image.width / frame.image.height -
          frame.image.naturalWidth / frame.image.naturalHeight,
      ) < 0.02,
    );
    if (small) {
      assert.ok(frame.image.width <= frame.image.naturalWidth + 1);
      assert.ok(frame.image.height <= frame.image.naturalHeight + 1);
    }
  };
  await checkImage({ width: 240, height: 1200 });
  assert.ok((await popupFrame()).image.height <= 270);
  assert.equal(
    await b.evaluate("document.body.innerText.includes('끝표시')"),
    false,
  );
  await screenshot("home-notice-popup-360.png");
  await checkImage({ width: 1200, height: 240 });
  await checkImage({ width: 40, height: 30 }, { small: true });
  imageDimensions.delete(imagePath);
  files.delete(imagePath);
  await go("/");
  await expectHomePopup(true);
  await text("이미지를 불러오지 못했습니다.");
  frame = await popupFrame();
  assert.equal(frame.failed, true);
  assert.equal(frame.buttonOk, true);
  assert.equal(frame.lines, true);
  winner.image_path = null;
  winner.image_alt = null;
  await go("/");
  await expectHomePopup(true);
  assert.equal((await popupFrame()).image, null);
  await b.call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await until(async () => !(await popupOpen()), "escape closed popup");
  assert.equal(await b.evaluate("document.activeElement?.id"), "home-start");
  assert.equal(
    await b.evaluate(
      "sessionStorage.getItem('jjokjipge:notice-popup:session')",
    ),
    tieHigh,
  );
  assert.equal(
    await b.evaluate("localStorage.getItem('jjokjipge:notice-popup:today')"),
    null,
  );
  await go("/category");
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  await b.evaluate(
    "sessionStorage.removeItem('jjokjipge:notice-popup:session')",
  );
  await go("/");
  await expectHomePopup(true);
  await b.button("닫기");
  await until(async () => !(await popupOpen()), "close button");
  await go("/");
  await expectHomePopup(false);
  await b.evaluate(
    "sessionStorage.removeItem('jjokjipge:notice-popup:session')",
  );
  await go("/");
  await expectHomePopup(true);
  await b.button("오늘 하루 보지 않기");
  await until(async () => !(await popupOpen()), "today hide");
  const todayRecord = JSON.parse(
    await b.evaluate("localStorage.getItem('jjokjipge:notice-popup:today')"),
  );
  assert.deepEqual(todayRecord, { id: tieHigh, date: seoulToday });
  assert.equal(
    await b.evaluate(
      "sessionStorage.getItem('jjokjipge:notice-popup:session')",
    ),
    null,
  );
  await go("/");
  await expectHomePopup(false);
  await b.evaluate(
    "localStorage.setItem('jjokjipge:notice-popup:today', JSON.stringify({id:'ffffffff-ffff-4fff-8fff-ffffffffffff', date:'1999-01-01'}))",
  );
  await go("/");
  await expectHomePopup(true);
  await b.evaluate(
    `localStorage.setItem('jjokjipge:notice-popup:today', JSON.stringify({id:'ffffffff-ffff-4fff-8fff-ffffffffffff', date:${JSON.stringify(seoulToday)}}));window.dispatchEvent(new StorageEvent('storage',{key:'jjokjipge:notice-popup:today'}))`,
  );
  await until(async () => !(await popupOpen()), "other tab today hide");
  await b.evaluate("localStorage.removeItem('jjokjipge:notice-popup:today')");
  await go("/");
  await expectHomePopup(true);
  await b.button("공지 자세히 보기");
  await text("동률 최신 아이디");
  assert.equal(
    await b.evaluate(
      "sessionStorage.getItem('jjokjipge:notice-popup:session')",
    ),
    tieHigh,
  );
  await go("/");
  await expectHomePopup(false);
  await b.evaluate(
    "sessionStorage.setItem('jjokjipge:notice-popup:session','ffffffff-ffff-4fff-8fff-ffffffffffff');localStorage.setItem('jjokjipge:notice-popup:today','{');localStorage.setItem('jjokjipge:notice-popup:other','keep')",
  );
  const newer = addNotice({
    id: "99999999-9999-4999-8999-999999999999",
    title: "새 팝업 공지",
    is_published: true,
    is_popup: true,
    published_at: "2026-11-12T00:00:00.000000+00:00",
    body: "새 본문",
  });
  await go("/");
  await expectHomePopup(true);
  await text("새 팝업 공지");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('동률 최신 아이디')"),
    false,
  );
  assert.equal(
    await b.evaluate("localStorage.getItem('jjokjipge:notice-popup:other')"),
    "keep",
  );
  await b.button("닫기");
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('동률 최신 아이디')"),
    false,
  );
  assert.equal(
    await b.evaluate("document.body.innerText.includes('동률 낮은 아이디')"),
    false,
  );
  newer.is_published = false;
  readFail = true;
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('Application error')"),
    false,
  );
  readFail = false;
  await go("/notices");
  await delay(300);
  assert.equal(await popupOpen(), false);
  await go("/admin/notices");
  await delay(300);
  assert.equal(await popupOpen(), false);
  await go("/");
  await expectHomePopup(true);
  await b.evaluate(`(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(String(key).startsWith('jjokjipge:notice-popup'))throw Error('denied');
      return original.call(this,key,value);
    };
  })()`);
  await b.button("닫기");
  await until(async () => !(await popupOpen()), "memory close");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('Application error')"),
    false,
  );
  await go("/");
  await expectHomePopup(true);
  rows.length = 0;
  files.clear();
  imageDimensions.clear();
  await b.evaluate("sessionStorage.clear();localStorage.clear()");
  await go("/admin/notices/new");
  await b.fill("title", "팝업 초안");
  await b.fill("body", "비공개 팝업 초안");
  await setChecked("홈 팝업으로 표시", true);
  assert.equal(
    await b.evaluate(
      "(()=>{const value=(label)=>Array.from(document.querySelectorAll('label')).find(e=>e.textContent.trim()===label).querySelector('input').checked;return value('상단 고정')===false&&value('공개')===false&&value('홈 팝업으로 표시')===true})()",
    ),
    true,
  );
  await b.button("저장 전 확인");
  await confirm();
  await text("공지를 저장했습니다.");
  const draft = rows.find((row) => row.title === "팝업 초안");
  assert.equal(draft.is_popup, true);
  assert.equal(draft.is_published, false);
  assert.equal(draft.is_pinned, false);
  assert.equal(draft.published_at, null);
  await go("/admin/notices");
  await text("팝업 대상");
  assert.equal(
    await b.evaluate("document.body.innerText.includes('현재 표시 중')"),
    false,
  );
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  await go("/admin/notices/" + draft.id);
  await setChecked("공개", true);
  await b.button("저장 전 확인");
  await confirm();
  const publishedAt = draft.published_at;
  assert.ok(publishedAt);
  assert.equal(draft.is_popup, true);
  await go("/");
  await expectHomePopup(true);
  await text("팝업 초안");
  await go("/admin/notices/" + draft.id);
  await setChecked("홈 팝업으로 표시", false);
  await b.button("저장 전 확인");
  await confirm();
  assert.equal(draft.published_at, publishedAt);
  assert.equal(draft.is_popup, false);
  await go("/");
  await expectHomePopup(false);
  await go("/admin/notices/" + draft.id);
  await setChecked("홈 팝업으로 표시", true);
  await b.button("저장 전 확인");
  await confirm();
  assert.equal(draft.published_at, publishedAt);
  await go("/");
  await expectHomePopup(true);
  await go("/admin/notices/" + draft.id);
  await setChecked("공개", false);
  await b.button("저장 전 확인");
  await confirm();
  assert.equal(draft.published_at, publishedAt);
  await go("/");
  await expectHomePopup(false);
  await go("/admin/notices/" + draft.id);
  await b.fill("body", "팝업 체크 초안");
  await setChecked("홈 팝업으로 표시", true);
  draft.updated_at = stamp();
  await b.button("저장 전 확인");
  await confirm();
  await text("다른 작업으로 공지가 변경됐습니다.");
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('[name=body]')).find(e=>e.checkVisibility()).value",
    ),
    "팝업 체크 초안",
  );
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('label')).find(e=>e.textContent.trim()==='홈 팝업으로 표시').querySelector('input').checked",
    ),
    true,
  );
  await b.button("최신 내용 다시 불러오기");
  await confirm();
  await setChecked("홈 팝업으로 표시", true);
  await setChecked("공개", true);
  loseResponse = true;
  await b.button("저장 전 확인");
  await confirm();
  await text("결과를 확인하지 못했습니다.");
  draft.is_popup = false;
  await b.button("저장 결과 다시 확인");
  await text("현재 저장 내용과 일치하지 않습니다.");
  assert.equal(
    await b.evaluate(
      "Array.from(document.querySelectorAll('label')).find(e=>e.textContent.trim()==='홈 팝업으로 표시').querySelector('input').checked",
    ),
    true,
  );
  await b.button("최신 내용 다시 불러오기");
  await confirm();
  await b.button("공지 삭제");
  await confirm();
  await until(
    () =>
      b.evaluate(
        "document.body.innerText.includes('공지를 삭제했습니다.')||document.body.innerText.includes('공지를 저장했습니다.')",
      ),
    "notice deleted",
  );
  assert.equal(rows.length, 0);
  await go("/");
  await expectHomePopup(false);
  await text("추천 상담사");
  console.log(
    "PASS home popup query, dismissal, images, category card, admin popup setting",
  );
  admin = false;
  await go("/admin/notices");
  await text("관리자 권한");
  assert.deepEqual(issues, []);
  console.log(
    "PASS mock notice CRUD, private/public, image upload, CAS draft preservation, lost-response recovery, cleanup-only retry, 360/768/1024",
  );
} finally {
  try {
    await b?.close();
  } finally {
    stop(app);
    fixture.closeAllConnections();
    await new Promise((r) => fixture.close(r));
  }
}
