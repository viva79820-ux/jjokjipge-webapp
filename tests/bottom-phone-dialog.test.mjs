import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const ts = createRequire(import.meta.url)("typescript");

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )((name) => {
    assert.ok(name in adapters, name);
    return adapters[name];
  }, exports);
  return exports;
}

test("대표번호는 승인된 안심번호이고 빈 매장만 그 번호로 돌아간다", () => {
  const config = load("../lib/site-config.ts");
  const rules = load("../lib/stores/rules.ts", {
    "@/lib/site-config": config,
  });
  assert.equal(config.siteConfig.phone, "0507-1498-0232");
  assert.equal(
    `tel:${config.siteConfig.phone.replace(/\D/g, "")}`,
    "tel:050714980232",
  );
  assert.equal(rules.storeTelHref(""), "tel:0507-1498-0232");
  assert.equal(rules.storeTelHref("053-000-1111"), "tel:0530001111");
  assert.equal(rules.storeTelHref("0507-1498-0232"), "tel:050714980232");
});

test("하단 전화하기는 모달을 열고 전화 연결에서만 대표번호로 건다", () => {
  const bottom = read("components/bottom-tabs.tsx");
  const store = read("components/store/store-card.tsx");
  assert.match(bottom, /from "@\/components\/ui\/modal"/);
  assert.match(bottom, /title="쪽집게천사에 전화하기"/);
  assert.match(bottom, /\{siteConfig\.phone\}/);
  assert.match(bottom, />\s*닫기\s*</);
  assert.match(bottom, />\s*전화 연결\s*</);
  assert.match(bottom, /href=\{representativeCallHref\}/);
  assert.match(
    bottom,
    /const representativeCallHref = `tel:\$\{siteConfig\.phone\.replace\(\/\\D\/g, ""\)\}`;/,
  );
  assert.match(bottom, /id=\{phoneButtonId\}/);
  assert.match(bottom, /restoreFocusId=\{phoneButtonId\}/);
  assert.match(bottom, /type="button"/);
  assert.equal(bottom.includes("href: `tel:${siteConfig.phone}`"), false);
  assert.match(bottom, /kind: "phone"/);
  assert.match(bottom, /href: "\/"/);
  assert.match(bottom, /href: "\/category"/);
  assert.match(bottom, /href: "\/booking\/lookup"/);
  assert.match(store, /href=\{storeTelHref\(store\.phone\)\}/);
  assert.equal(store.includes("Modal"), false);
});
