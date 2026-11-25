import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const productId = "20000000-0000-4000-8000-000000000001";
const requestKey = "30000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const orderNo = "O-20261125-0001";

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )((name) => {
    assert.ok(name in adapters, `${file}: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}

const reservationRules = load("lib/reservations/rules.ts");
const orderConfig = {
  orderConfig: {
    maxLines: 30,
    maxQuantity: 99,
    shippingFee: 0,
    shippingFeeConfirmed: false,
  },
};
const types = {};
const rules = load("lib/orders/rules.ts", {
  "@/lib/order-config": orderConfig,
  "@/lib/reservations/rules": reservationRules,
  "./types": types,
});

function validForm(patch = {}) {
  const values = {
    requestKey,
    items: JSON.stringify([{ id: productId, quantity: 2 }]),
    name: "주문자",
    phone: "010-1234-5678",
    email: "BUYER@example.invalid",
    postalCode: "41911",
    addressLine1: "대구광역시 중구 테스트로 1",
    addressLine2: "테스트 101호",
    privacyConsent: "on",
    ...patch,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    form.set(key, String(value));
  return form;
}

function harness({ subject = userId, result, error = null, rpcImpl } = {}) {
  const calls = [];
  const defaultResult = [
    {
      order_number: orderNo,
      subtotal_amount: "24000",
      shipping_fee_amount: "0",
      total_amount: "24000",
      order_status: "pending_payment",
      replayed: false,
    },
  ];
  const actions = load("lib/orders/actions.ts", {
    "@/lib/supabase/admin": {
      createAdminClient() {
        return {
          async rpc(name, payload) {
            calls.push([name, structuredClone(payload)]);
            if (rpcImpl) return rpcImpl(name, payload);
            return { data: result ?? defaultResult, error };
          },
        };
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        return {
          auth: {
            async getClaims() {
              return {
                data: subject ? { claims: { sub: subject } } : null,
                error: null,
              };
            },
          },
        };
      },
    },
    "@/lib/order-config": orderConfig,
    "./rules": rules,
    "./types": types,
  });
  return { ...actions, calls };
}

test("주문 입력은 연락처·배송지와 상품 ID·수량만 정규화한다", () => {
  const parsed = rules.parseOrderForm(validForm());
  assert.deepEqual(parsed.errors, {});
  assert.deepEqual(parsed.values, {
    requestKey,
    name: "주문자",
    phone: "010-1234-5678",
    email: "buyer@example.invalid",
    postalCode: "41911",
    addressLine1: "대구광역시 중구 테스트로 1",
    addressLine2: "테스트 101호",
    lines: [{ productId, quantity: 2 }],
  });
});

test("브라우저가 보낸 가격·합계는 무시하고 RPC에는 상품 ID·수량만 보낸다", async () => {
  const tool = harness();
  const form = validForm({
    price: "1",
    productName: "조작한 상품",
    subtotal: "1",
    shippingFee: "-10000",
    total: "1",
  });
  const state = await tool.createOrder({}, form);
  assert.equal(state.success.orderNo, orderNo);
  assert.deepEqual(state.success, {
    orderNo,
    subtotal: 24000,
    shippingFee: 0,
    total: 24000,
    status: "pending_payment",
    replayed: false,
  });
  assert.equal(tool.calls.length, 1);
  const [name, payload] = tool.calls[0];
  assert.equal(name, "create_shop_order");
  assert.deepEqual(payload.p_items, [{ product_id: productId, quantity: 2 }]);
  assert.equal(payload.p_shipping_fee, 0);
  for (const key of ["price", "product_name", "subtotal", "total"])
    assert.equal(Object.hasOwn(payload, key), false, key);
});

test("판매 중지·비공개 상품 오류는 주문을 성공으로 만들지 않는다", async () => {
  for (const [message, expected] of [
    [
      "ORDER_PRODUCT_SOLD_OUT",
      "품절된 상품이 있어요. 장바구니를 다시 확인해 주세요.",
    ],
    [
      "ORDER_PRODUCT_UNAVAILABLE",
      "판매가 중지되었거나 찾을 수 없는 상품이 있어요. 장바구니를 다시 확인해 주세요.",
    ],
  ]) {
    const tool = harness({
      error: { code: "P0001", message },
      result: [],
    });
    const state = await tool.createOrder({}, validForm());
    assert.equal(state.success, undefined);
    assert.equal(state.message, expected);
  }
});

test("여러 상품 합계가 단일 상품 가격 상한을 넘어도 안전한 정수면 받는다", async () => {
  const tool = harness({
    result: [
      {
        order_number: orderNo,
        subtotal_amount: "6378026431590",
        shipping_fee_amount: "2147483647",
        total_amount: "6380173915237",
        order_status: "pending_payment",
        replayed: false,
      },
    ],
  });
  const state = await tool.createOrder({}, validForm());
  assert.deepEqual(state.success, {
    orderNo,
    subtotal: 6378026431590,
    shippingFee: 2147483647,
    total: 6380173915237,
    status: "pending_payment",
    replayed: false,
  });
});

test("같은 요청 키 재시도는 같은 주문번호를 받고 저장은 한 번만 일어난다", async () => {
  const orders = new Map();
  let inserts = 0;
  const tool = harness({
    rpcImpl(_name, payload) {
      const existing = orders.get(payload.p_request_key);
      if (existing)
        return {
          data: [{ ...existing, replayed: true }],
          error: null,
        };
      inserts += 1;
      const row = {
        order_number: orderNo,
        subtotal_amount: "24000",
        shipping_fee_amount: "0",
        total_amount: "24000",
        order_status: "pending_payment",
        replayed: false,
      };
      orders.set(payload.p_request_key, row);
      return { data: [row], error: null };
    },
  });
  const first = await tool.createOrder({}, validForm());
  const retried = await tool.createOrder({}, validForm());
  assert.equal(first.success.orderNo, orderNo);
  assert.equal(first.success.replayed, false);
  assert.equal(retried.success.orderNo, orderNo);
  assert.equal(retried.success.replayed, true);
  assert.equal(inserts, 1);
});

test("회원 ID는 세션에서만 가져오고 비회원은 null로 저장한다", async () => {
  const member = harness();
  await member.createOrder({}, validForm());
  assert.equal(member.calls[0][1].p_user_id, userId);

  const guest = harness({ subject: null });
  await guest.createOrder({}, validForm());
  assert.equal(guest.calls[0][1].p_user_id, null);
});

test("잘못되거나 중복된 상품 입력은 DB 호출 전에 거부한다", async () => {
  const cases = [
    validForm({ items: "[]" }),
    validForm({
      items: JSON.stringify([
        { id: productId, quantity: 1 },
        { id: productId, quantity: 1 },
      ]),
    }),
    validForm({
      items: JSON.stringify([{ id: productId, quantity: 1, price: 1 }]),
    }),
    validForm({ items: JSON.stringify([{ id: productId, quantity: 100 }]) }),
  ];
  const tool = harness();
  for (const form of cases) {
    const state = await tool.createOrder({}, form);
    assert.equal(state.success, undefined);
    assert.ok(state.errors.items);
  }
  assert.equal(tool.calls.length, 0);
});

test("고객 직접 조회 정책과 가짜 계좌·화면의 가격 전송이 없다", () => {
  const migration = readFileSync(
    new URL("supabase/migrations/20261125004138_orders_schema.sql", root),
    "utf8",
  );
  const config = readFileSync(
    new URL("lib/bank-transfer-config.ts", root),
    "utf8",
  );
  const checkout = readFileSync(
    new URL("components/orders/order-checkout.tsx", root),
    "utf8",
  );
  assert.doesNotMatch(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /orders_select_own|order_items_select_own/);
  assert.match(config, /\[입금 계좌 준비 중\]/);
  assert.doesNotMatch(config, /예시은행|000-0000-0000|쪽집게천사\(예시\)/);
  assert.doesNotMatch(
    checkout,
    /name=["'](?:price|subtotal|shippingFee|total)["']/,
  );
  assert.match(checkout, /name="items"/);
});
