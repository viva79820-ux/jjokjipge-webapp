import assert from "node:assert/strict";
import test from "node:test";
import { storePriceConfig } from "../lib/store-price-config.ts";

test("매장 참고 가격은 고객 확정 전 자료이고 전화상담 상품과 분리된다", () => {
  assert.equal(storePriceConfig.status, "unconfirmed-reference");
  assert.match(storePriceConfig.source, /1호점 가격판/);
  assert.match(storePriceConfig.excludedUse, /consult_products/);
  const byKey = Object.fromEntries(
    storePriceConfig.items.map((item) => [item.key, item]),
  );
  assert.deepEqual(
    byKey.saju.amounts.map((item) => [item.label, item.amount]),
    [
      ["일반", 30000],
      ["중고등", 20000],
    ],
  );
  assert.deepEqual(
    byKey["tarot-one-shuffle"].amounts.map((item) => [item.label, item.amount]),
    [
      ["일반", 5000],
      ["중고등", 5000],
    ],
  );
  assert.deepEqual(
    byKey["couple-fortune"].amounts.map((item) => item.amount),
    [10000, 15000],
  );
  assert.equal(byKey.physiognomy.amounts[0].amount, 10000);
  assert.equal(byKey.palmistry.amounts[0].amount, 10000);
  assert.equal(byKey.naming.amounts[0].amount, 300000);
  assert.equal(
    storePriceConfig.items.some(
      (item) => "minutes" in item || "productId" in item,
    ),
    false,
  );
});
