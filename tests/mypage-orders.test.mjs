import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const memberId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const orderId = "11111111-1111-4111-8111-111111111111";
const orderNo = "O-20261126-0001";

function load(specifier, adapters) {
  const cache = new Map();
  function resolveFile(name, parent) {
    const raw = name.startsWith("@/")
      ? new URL(`../${name.slice(2)}`, import.meta.url)
      : new URL(name, parent);
    const path = fileURLToPath(raw);
    const found = [path, `${path}.ts`, `${path}.tsx`].find((item) =>
      existsSync(item),
    );
    if (!found) throw new Error(`Missing module: ${name}`);
    return found;
  }
  function instantiate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const commonjs = { exports: {} };
    cache.set(filename, commonjs);
    const parent = new URL(`file:///${filename.replaceAll("\\", "/")}`);
    new Function("require", "exports", "module", compiled)(
      (name) => {
        if (name in adapters) return adapters[name];
        if (name.startsWith(".") || name.startsWith("@/"))
          return instantiate(resolveFile(name, parent));
        throw new Error(`Unexpected dependency: ${name}`);
      },
      commonjs.exports,
      commonjs,
    );
    return commonjs.exports;
  }
  return instantiate(resolveFile(specifier, import.meta.url));
}

function harness(response) {
  const calls = [];
  const query = {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return query;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(response);
    },
    returns() {
      calls.push(["returns"]);
      return Promise.resolve(response);
    },
  };
  const orders = load("../lib/member-auth/orders.ts", {
    "server-only": {},
    "@/lib/supabase/server": {
      createClient: async () => ({
        from(table) {
          calls.push(["from", table]);
          return query;
        },
      }),
    },
  });
  return { ...orders, calls };
}

function summaryRow(patch = {}) {
  return {
    id: orderId,
    user_id: memberId,
    order_no: orderNo,
    created_at: "2026-11-26T00:01:00.000Z",
    status: "pending_payment",
    total: "12000",
    order_items: [{ line_no: 1, product_name: "테스트 카드", quantity: 2 }],
    ...patch,
  };
}

function detailRow(patch = {}) {
  return {
    id: orderId,
    user_id: memberId,
    order_no: orderNo,
    created_at: "2026-11-26T00:01:00.000Z",
    status: "shipping",
    postal_code: "41911",
    address_line1: "대구광역시 중구 테스트로 1",
    address_line2: "테스트 101호",
    subtotal: "12000",
    shipping_fee: "0",
    total: "12000",
    tracking_number: "TRACK-1234",
    order_items: [
      {
        line_no: 1,
        product_name: "테스트 카드",
        unit_price: "6000",
        quantity: 2,
        line_total: "12000",
      },
    ],
    ...patch,
  };
}

test("회원 주문 목록은 세션 회원 ID로만 조회하고 표시값으로 검증한다", async () => {
  const tool = harness({ data: [summaryRow()], error: null });
  const orders = await tool.getMemberOrders(memberId.toUpperCase());
  assert.equal(orders.length, 1);
  assert.equal(orders[0].orderNo, orderNo);
  assert.equal(orders[0].orderedAtLabel, "2026년 11월 26일 09:01");
  assert.equal(orders[0].status, "pending_payment");
  assert.equal(orders[0].total, 12000);
  assert.deepEqual(orders[0].items, [{ name: "테스트 카드", quantity: 2 }]);
  assert.deepEqual(tool.calls, [
    ["from", "orders"],
    [
      "select",
      "id,user_id,order_no,created_at,status,total,order_items(line_no,product_name,quantity)",
    ],
    ["eq", "user_id", memberId],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["returns"],
  ]);
});

test("다른 회원 주문이 섞이면 목록을 보여 주지 않는다", async () => {
  const tool = harness({
    data: [
      summaryRow(),
      summaryRow({ user_id: otherId, order_no: "O-20261126-0002" }),
    ],
    error: null,
  });
  await assert.rejects(
    () => tool.getMemberOrders(memberId),
    (error) => {
      assert.equal(error.message, "주문 내역을 불러오지 못했어요.");
      assert.doesNotMatch(error.message, /SECRET|0002/);
      return true;
    },
  );
});

test("빈 주문 목록은 빈 배열이다", async () => {
  const tool = harness({ data: [], error: null });
  assert.deepEqual(await tool.getMemberOrders(memberId), []);
});

test("조회 오류 내용은 화면에 전달하지 않는다", async () => {
  const tool = harness({
    data: null,
    error: { code: "42501", message: "SECRET permission denied" },
  });
  await assert.rejects(
    () => tool.getMemberOrders(memberId),
    (error) => {
      assert.equal(error.message, "주문 내역을 불러오지 못했어요.");
      assert.doesNotMatch(String(error.message), /SECRET|42501/);
      return true;
    },
  );
});

test("상세는 본인 주문번호만 읽고 다른 회원 행은 없는 주문으로 처리한다", async () => {
  const owned = harness({ data: detailRow(), error: null });
  const order = await owned.getMemberOrder(memberId, orderNo);
  assert.equal(order.trackingNumber, "TRACK-1234");
  assert.equal(order.addressLine2, "테스트 101호");
  assert.equal(order.total, 12000);
  assert.deepEqual(owned.calls.slice(0, 4), [
    ["from", "orders"],
    [
      "select",
      "id,user_id,order_no,created_at,status,postal_code,address_line1,address_line2,subtotal,shipping_fee,total,tracking_number,order_items(line_no,product_name,unit_price,quantity,line_total)",
    ],
    ["eq", "user_id", memberId],
    ["eq", "order_no", orderNo],
  ]);

  const foreign = harness({
    data: detailRow({ user_id: otherId }),
    error: null,
  });
  assert.equal(await foreign.getMemberOrder(memberId, orderNo), null);

  const missingNumber = harness({ data: detailRow(), error: null });
  assert.equal(
    await missingNumber.getMemberOrder(memberId, "R-20261126-0001"),
    null,
  );
  assert.deepEqual(missingNumber.calls, []);
});

test("배송·완료 주문에 송장번호가 없으면 상세를 거절한다", async () => {
  const tool = harness({
    data: detailRow({ tracking_number: null }),
    error: null,
  });
  await assert.rejects(
    () => tool.getMemberOrder(memberId, orderNo),
    /주문 내역을 불러오지 못했어요/,
  );
});

test("마이페이지는 본인 주문 목록·상세와 비회원 조회를 유지한다", () => {
  const page = readFileSync(
    new URL("../app/(site)/mypage/page.tsx", import.meta.url),
    "utf8",
  );
  const detailPage = readFileSync(
    new URL("../app/(site)/mypage/orders/[orderNo]/page.tsx", import.meta.url),
    "utf8",
  );
  const history = readFileSync(
    new URL("../components/member-auth/order-history.tsx", import.meta.url),
    "utf8",
  );
  const detail = readFileSync(
    new URL("../components/member-auth/order-detail.tsx", import.meta.url),
    "utf8",
  );
  const data = readFileSync(
    new URL("../lib/member-auth/orders.ts", import.meta.url),
    "utf8",
  );
  const lookup = readFileSync(
    new URL("../lib/orders/lookup/actions.ts", import.meta.url),
    "utf8",
  );
  const create = readFileSync(
    new URL("../lib/orders/actions.ts", import.meta.url),
    "utf8",
  );
  const badge = readFileSync(
    new URL("../components/order-lookup/status-badge.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /getMemberOrders\(member\.id\)/);
  assert.match(page, /회원 계정으로 주문한 내역만 보여요/);
  assert.match(page, /비회원 주문 조회/);
  assert.match(history, /주문·배송 내역/);
  assert.match(history, /주문번호/);
  assert.match(history, /주문일/);
  assert.match(history, /상품/);
  assert.match(history, /금액/);
  assert.match(history, /회원 계정으로 주문한 내역이 없어요/);
  assert.match(history, /OrderStatusBadge/);
  assert.match(detailPage, /getMemberOrder\(member\.id/);
  assert.match(detail, /배송지/);
  assert.match(detail, /송장번호/);
  assert.match(detail, /입금 안내/);
  assert.match(detail, /배송 시작 후 확인할 수 있어요/);
  assert.match(detail, /BankTransferAccount/);
  for (const label of ["입금 대기", "입금 확인", "배송 중", "완료", "취소"])
    assert.ok(badge.includes(label), label);
  assert.doesNotMatch(data, /createAdminClient|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(data, /customer_(?:name|phone|email)/);
  assert.match(lookup, /createAdminClient/);
  assert.match(lookup, /customer_email/);
  assert.match(create, /p_user_id: userId/);
  assert.doesNotMatch(create, /formData\.get\(["']userId/);
});
