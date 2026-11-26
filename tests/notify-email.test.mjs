import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  createMemoryDeliveryStore,
  deliverOnce,
} from "../lib/email/deliver-once.ts";
import {
  readCounselorName,
  reservationConfirmedContent,
} from "../lib/email/reservation-confirmed-message.ts";
import { siteConfig } from "../lib/site-config.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadModule(file, adapters) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}

const sendResend = loadModule("../lib/email/send-resend.ts", {
  "server-only": {},
});
const fixtureKey = "fixture-resend-key";
const mail = {
  to: "guest@example.invalid",
  subject: "예약이 확정되었습니다",
  html: "<p>예약이 확정되었습니다</p>",
  text: "예약이 확정되었습니다",
};

function sourceFiles(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "tmp") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) found.push(path);
  }
  return found;
}

test("the Resend key is read only in the send module", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const hits = [];
  for (const folder of ["app", "components", "lib"]) {
    for (const file of sourceFiles(join(root, folder))) {
      if (readFileSync(file, "utf8").includes("RESEND_API_KEY"))
        hits.push(relative(root, file).replaceAll("\\", "/"));
    }
  }
  assert.deepEqual(hits, ["lib/email/send-resend.ts"]);
});

test("missing Resend key does not call the API", async () => {
  let calls = 0;
  for (const env of [{}, { RESEND_API_KEY: "  " }]) {
    const result = await sendResend.sendResendMail(mail, {
      env,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    assert.deepEqual(result, { ok: false, reason: "missing_key" });
  }
  assert.equal(calls, 0);
});

test("Resend API failures stay inside the send module", async () => {
  const bodies = [];
  const rejected = await sendResend.sendResendMail(mail, {
    env: { RESEND_API_KEY: fixtureKey },
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(rejected, { ok: false, reason: "request_failed" });
  const failed = await sendResend.sendResendMail(mail, {
    env: { RESEND_API_KEY: fixtureKey },
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      assert.equal(init.headers.Authorization, `Bearer ${fixtureKey}`);
      return { ok: false, status: 500 };
    },
  });
  assert.deepEqual(failed, { ok: false, reason: "request_failed" });
  assert.equal(
    bodies[0].from,
    "쪽집게천사 운세통 <noreply@mail.angelsaju.com>",
  );
  assert.deepEqual(bodies[0].to, [mail.to]);
  assert.equal(JSON.stringify(failed).includes(fixtureKey), false);
});

test("the same confirmation is not sent twice", async () => {
  const store = createMemoryDeliveryStore();
  let calls = 0;
  const send = async () => {
    calls += 1;
    return true;
  };
  assert.equal(await deliverOnce("reservation:confirmed", store, send), "sent");
  assert.equal(
    await deliverOnce("reservation:confirmed", store, send),
    "skipped",
  );
  assert.equal(calls, 1);
  assert.equal(await deliverOnce("   ", store, send), "failed");
  assert.equal(calls, 1);
});

test("a failed attempt can be retried, and an in-flight send is not duplicated", async () => {
  const store = createMemoryDeliveryStore();
  let calls = 0;
  assert.equal(
    await deliverOnce("reservation:confirmed", store, async () => {
      calls += 1;
      return false;
    }),
    "failed",
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const sending = deliverOnce("reservation:confirmed", store, async () => {
    calls += 1;
    await gate;
    return true;
  });
  assert.equal(
    await deliverOnce("reservation:confirmed", store, async () => {
      calls += 1;
      return true;
    }),
    "skipped",
  );
  release();
  assert.equal(await sending, "sent");
  assert.equal(
    await deliverOnce("reservation:confirmed", store, async () => {
      calls += 1;
      return true;
    }),
    "skipped",
  );
  assert.equal(calls, 2);
});

test("confirmation mail is Korean html and text without markup from the product name", () => {
  const lookupUrl = "https://angelsaju.com/booking/lookup";
  const content = reservationConfirmedContent({
    reservationNo: "R-20261201-0001",
    counselorName: readCounselorName({ name: "상담사 A" }),
    productName: "사주 <30분>",
    when: "2026. 12. 01. 12:00",
    lookupUrl,
    phone: siteConfig.phone,
  });
  assert.equal(content.subject, "[쪽집게천사 운세통] 예약이 확정되었습니다");
  for (const body of [content.html, content.text]) {
    assert.match(body, /예약이 확정되었습니다/);
    assert.match(
      body,
      /예약하신 시간에 상담사가 매장 전화로 고객님께 연락드립니다/,
    );
    assert.match(body, /R-20261201-0001/);
    assert.match(body, /상담사 A/);
    assert.match(body, /사주/);
    assert.match(body, /2026\. 12\. 01\. 12:00/);
    assert.match(body, /https:\/\/angelsaju\.com\/booking\/lookup/);
    assert.match(body, /0507-1498-0232/);
  }
  assert.match(content.html, /&lt;30분&gt;/);
  assert.equal(content.html.includes("<30분>"), false);
  assert.match(content.text, /사주 <30분>/);
  assert.equal(content.html.includes("<html"), true);
  assert.equal(content.text.includes("<html"), false);
  assert.equal(readCounselorName(null), "상담사 정보 없음");
  assert.equal(readCounselorName([{ name: "상담사 B" }]), "상담사 B");
  assert.throws(() =>
    reservationConfirmedContent({
      reservationNo: "R-20261201-0001",
      counselorName: "상담사 A",
      productName: "사주",
      when: "2026. 12. 01. 12:00",
      lookupUrl: "javascript:alert(1)",
      phone: siteConfig.phone,
    }),
  );
});
