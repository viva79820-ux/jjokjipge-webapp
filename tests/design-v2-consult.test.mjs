import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");

function load(file) {
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
  )(() => {
    throw new Error("unexpected import");
  }, exports);
  return exports;
}

const { isCounselorDetailPath } = load("../lib/site-path.ts");
const { consultPriceLabel, lowestPublicProduct } = load(
  "../lib/counselors/display.ts",
);

test("상담사 상세 경로만 공통 메뉴를 숨긴다", () => {
  assert.equal(isCounselorDetailPath("/consult/gayeon"), true);
  assert.equal(isCounselorDetailPath("/consult/book"), true);
  assert.equal(isCounselorDetailPath("/consult/gayeon/"), true);
  assert.equal(isCounselorDetailPath("/consult"), false);
  assert.equal(isCounselorDetailPath("/consult/"), false);
  assert.equal(isCounselorDetailPath("/consult/gayeon/book"), false);
  assert.equal(isCounselorDetailPath("/consult/gayeon/book/"), false);
  assert.equal(isCounselorDetailPath("/consult/gayeon/book?product=1"), false);
  assert.equal(isCounselorDetailPath("/stores"), false);
  assert.equal(isCounselorDetailPath("/"), false);
  assert.equal(isCounselorDetailPath(""), false);
  assert.equal(isCounselorDetailPath(null), false);
});

test("목록 가격은 조회된 상품 중 최저가의 이름과 금액만 쓴다", () => {
  const products = [
    { name: "기본 상담", price: 30000 },
    { name: "짧은 상담", price: 5000 },
    { name: "같은 최저가", price: 5000 },
  ];
  assert.equal(lowestPublicProduct(products)?.name, "짧은 상담");
  assert.equal(consultPriceLabel(products), "짧은 상담 5,000원~");
  assert.equal(
    consultPriceLabel([{ name: "사주 30분", price: 30000 }]),
    "사주 30분 30,000원",
  );
  assert.equal(consultPriceLabel([]), null);
});
