import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStorageTime,
  storageAtLeast80,
  storageUsageView,
} from "../lib/lectures/storage-view.ts";

test("사용량과 한도로 사용률을 계산한다", () => {
  const view = storageUsageView(
    { usedBytes: 500_000_000, limitBytes: 1_000_000_000, alerted80At: null },
    null,
  );
  assert.equal(view.percentLabel, "50%");
  assert.equal(view.barPercent, 50);
  assert.equal(view.warn, false);
  assert.equal(view.usedLabel, "500MB");
  assert.equal(view.limitLabel, "1GB");
  assert.equal(view.checkedLabel, "기록 없음");
  assert.equal(view.alertedLabel, null);
});

test("한도가 없으면 사용률과 경고를 만들지 않는다", () => {
  assert.equal(storageAtLeast80(900, null), false);
  const view = storageUsageView(
    { usedBytes: 900, limitBytes: null, alerted80At: null },
    null,
  );
  assert.equal(view.limitLabel, "한도 미설정");
  assert.equal(view.percentLabel, null);
  assert.equal(view.barPercent, null);
  assert.equal(view.warn, false);
  assert.equal(view.limitExactLabel, null);
});

test("80% 경계는 포함이고 그 아래는 경고하지 않는다", () => {
  const below = storageUsageView(
    { usedBytes: 799, limitBytes: 1000, alerted80At: null },
    null,
  );
  const exact = storageUsageView(
    {
      usedBytes: 800,
      limitBytes: 1000,
      alerted80At: "2026-11-27T03:00:00.000Z",
    },
    null,
  );
  assert.equal(storageAtLeast80(799, 1000), false);
  assert.equal(storageAtLeast80(800, 1000), true);
  assert.equal(storageAtLeast80(7, 10), false);
  assert.equal(storageAtLeast80(8, 10), true);
  assert.equal(below.percentLabel, "79.9%");
  assert.equal(below.warn, false);
  assert.equal(exact.percentLabel, "80%");
  assert.equal(exact.barPercent, 80);
  assert.equal(exact.warn, true);
  assert.equal(
    exact.alertedLabel,
    formatStorageTime("2026-11-27T03:00:00.000Z"),
  );
  assert.match(exact.alertedLabel ?? "", /2026/);
  assert.match(exact.alertedLabel ?? "", /12:00/);
});
