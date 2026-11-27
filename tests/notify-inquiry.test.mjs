import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { inquiryAnsweredContent } from "../lib/email/inquiry-answered-message.ts";
import { isValidEmail } from "../lib/reservations/rules.ts";
import { siteConfig } from "../lib/site-config.ts";
import { productionOrigin } from "../lib/site-origin.ts";
import * as deliverOnce from "../lib/email/deliver-once.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const fixtureKey = "fixture-resend-key";
const lookupUrl = "https://angelsaju.com/support/lookup";

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

function loadNotify() {
  return loadModule("../lib/email/notify-inquiry.ts", {
    "server-only": {},
    "next/headers": {
      headers: async () => ({
        get() {
          return null;
        },
      }),
    },
    "@/lib/member-auth/redirect": {
      resolveTrustedOrigin() {
        return null;
      },
    },
    "@/lib/reservations/rules": { isValidEmail },
    "@/lib/site-config": { siteConfig },
    "@/lib/site-origin": { productionOrigin },
    "./deliver-once": deliverOnce,
    "./inquiry-answered-message": { inquiryAnsweredContent },
    "./send-resend": sendResend,
  });
}

const notify = loadNotify().notifyInquiryAnswered;

async function withResendKey(value, run) {
  const had = Object.prototype.hasOwnProperty.call(
    process.env,
    "RESEND_API_KEY",
  );
  const previous = process.env.RESEND_API_KEY;
  if (value === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = value;
  try {
    return await run();
  } finally {
    if (!had) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous;
  }
}

test("inquiry answer mail is Korean html and text with only the lookup link and store phone", () => {
  const content = inquiryAnsweredContent({
    lookupUrl,
    phone: siteConfig.phone,
  });
  const text = [
    "문의하신 내용에 답변이 등록됐어요",
    "문의 조회에서 답변을 확인해 주세요.",
    "",
    `문의 조회: ${lookupUrl}`,
    `대표번호: ${siteConfig.phone}`,
  ].join("\n");
  assert.equal(
    content.subject,
    "[쪽집게천사 운세통] 문의하신 내용에 답변이 등록됐어요",
  );
  assert.equal(content.text, text);
  assert.match(content.html, /<html lang="ko">/);
  assert.match(content.html, /문의하신 내용에 답변이 등록됐어요/);
  assert.match(content.html, /문의 조회에서 답변을 확인해 주세요\./);
  assert.match(
    content.html,
    /href="https:\/\/angelsaju\.com\/support\/lookup"/,
  );
  assert.match(content.html, /0507-1498-0232/);
  assert.equal(content.text.includes("<html"), false);
  for (const secret of [
    "비밀 답변",
    "비밀 문의 본문",
    "홍길동",
    "010-1111-2222",
    "guest@example.invalid",
  ]) {
    assert.equal(content.html.includes(secret), false);
    assert.equal(content.text.includes(secret), false);
    assert.equal(content.subject.includes(secret), false);
  }
  const escaped = inquiryAnsweredContent({
    lookupUrl,
    phone: `0507<script>`,
  });
  assert.match(escaped.html, /0507&lt;script&gt;/);
  assert.equal(escaped.html.includes("<script>"), false);
  assert.throws(() =>
    inquiryAnsweredContent({
      lookupUrl: "javascript:alert(1)",
      phone: siteConfig.phone,
    }),
  );
});

test("first answer sends once, a missing key skips the API, and API failures stay failed", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true };
  };
  try {
    await withResendKey(undefined, async () => {
      assert.equal(
        await notify({
          id: "inquiry-missing-key",
          email: "guest@example.invalid",
        }),
        "failed",
      );
    });
    await withResendKey("   ", async () => {
      assert.equal(
        await notify({
          id: "inquiry-blank-key",
          email: "guest@example.invalid",
        }),
        "failed",
      );
    });
    assert.equal(calls.length, 0);
    const sent = await withResendKey(fixtureKey, () =>
      notify({ id: "inquiry-first", email: " Guest@Example.invalid " }),
    );
    assert.equal(sent, "sent");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].to, ["guest@example.invalid"]);
    assert.equal(
      calls[0].subject,
      "[쪽집게천사 운세통] 문의하신 내용에 답변이 등록됐어요",
    );
    assert.match(calls[0].text, /https:\/\/angelsaju\.com\/support\/lookup/);
    assert.match(calls[0].html, /0507-1498-0232/);
    assert.equal(calls[0].text.includes("guest@example.invalid"), false);
    assert.equal(calls[0].html.includes("guest@example.invalid"), false);
    assert.equal(
      await notify({ id: "inquiry-first", email: "guest@example.invalid" }),
      "skipped",
    );
    assert.equal(calls.length, 1);
    assert.equal(
      await notify({ id: "inquiry-bad-email", email: "not-an-email" }),
      "failed",
    );
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => {
      calls.push({ failed: true });
      return { ok: false, status: 500 };
    };
    assert.equal(
      await withResendKey(fixtureKey, () =>
        notify({ id: "inquiry-api-status", email: "guest@example.invalid" }),
      ),
      "failed",
    );
    globalThis.fetch = async () => {
      calls.push({ failed: true });
      throw new Error("network down");
    };
    assert.equal(
      await withResendKey(fixtureKey, () =>
        notify({ id: "inquiry-api-throw", email: "guest@example.invalid" }),
      ),
      "failed",
    );
    assert.equal(calls.length, 3);
    assert.equal(JSON.stringify(calls).includes(fixtureKey), false);
  } finally {
    globalThis.fetch = original;
  }
});
