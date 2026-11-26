import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);

function load(file, adapters = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, root), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("require", "exports", output)((name) => {
    assert.ok(name in adapters, `${file}: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}

const reservationRules = load("lib/reservations/rules.ts");
const lookupTypes = {};
const lookupValidation = load("lib/orders/lookup/validation.ts", {
  "@/lib/reservations/rules": reservationRules,
  "./types": lookupTypes,
});
const adminRules = load("lib/admin/order-rules.ts");
const orderNo = "O-20261125-0001";
const email = "buyer@example.invalid";
const id = "11111111-1111-4111-8111-111111111111";

function formOf(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function storedOrder(patch = {}) {
  return {
    id,
    request_key: "22222222-2222-4222-8222-222222222222",
    user_id: "33333333-3333-4333-8333-333333333333",
    order_no: orderNo,
    customer_name: "비밀 주문자",
    customer_phone: "010-9999-0000",
    customer_email: email,
    postal_code: "41911",
    address_line1: "대구광역시 중구 테스트로 1",
    address_line2: "테스트 101호",
    subtotal: "24000.00",
    shipping_fee: "3000",
    total: "27000.0",
    status: "shipping",
    tracking_number: "TRACK-1234",
    order_items: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        product_id: "55555555-5555-4555-8555-555555555555",
        line_no: 1,
        product_name: "테스트 카드",
        unit_price: "12000",
        quantity: 2,
        line_total: "24000.00",
      },
    ],
    ...patch,
  };
}

function lookupHarness({ row = storedOrder(), error = null } = {}) {
  const calls = [];
  let dbCalls = 0;
  let conditions = [];
  const query = {
    select(value) {
      calls.push(["select", value]);
      return this;
    },
    eq(key, value) {
      calls.push(["eq", key, value]);
      conditions.push([key, value]);
      return this;
    },
    async maybeSingle() {
      const current = conditions;
      conditions = [];
      if (error) return { data: null, error };
      const matches =
        current.some(
          ([key, value]) => key === "order_no" && value === row.order_no,
        ) &&
        current.some(
          ([key, value]) =>
            key === "customer_email" && value === row.customer_email,
        );
      return { data: matches ? row : null, error: null };
    },
  };
  const action = load("lib/orders/lookup/actions.ts", {
    "server-only": {},
    "@/lib/supabase/admin": {
      createAdminClient() {
        dbCalls += 1;
        return {
          from(table) {
            calls.push(["from", table]);
            return query;
          },
        };
      },
    },
    "./validation": lookupValidation,
    "./types": lookupTypes,
    "../types": {},
  });
  return { ...action, calls, dbCalls: () => dbCalls };
}

test("주문 조회는 주문번호와 이메일을 모두 일치시켜 필요한 정보만 반환한다", async () => {
  const tool = lookupHarness();
  const state = await tool.lookupOrder(
    formOf({ orderNo: ` ${orderNo.toLowerCase()} `, email: ` ${email} ` }),
  );
  assert.deepEqual(
    tool.calls.filter(([name]) => name === "eq"),
    [
      ["eq", "order_no", orderNo],
      ["eq", "customer_email", email],
    ],
  );
  assert.deepEqual(state.result, {
    orderNo,
    status: "shipping",
    items: [
      {
        name: "테스트 카드",
        unitPrice: 12000,
        quantity: 2,
        lineTotal: 24000,
      },
    ],
    subtotal: 24000,
    shippingFee: 3000,
    total: 27000,
    postalCode: "41911",
    addressLine1: "대구광역시 중구 테스트로 1",
    addressLine2: "테스트 101호",
    trackingNumber: "TRACK-1234",
  });
  const serialized = JSON.stringify(state);
  for (const secret of [
    id,
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
    "비밀 주문자",
    "010-9999-0000",
    email,
  ])
    assert.equal(serialized.includes(secret), false, secret);
  assert.doesNotMatch(
    tool.calls.find(([name]) => name === "select")[1],
    /customer_(?:name|phone|email)|request_key|user_id|product_id/,
  );
});

test("타인 이메일과 없는 주문번호는 존재 여부를 감추는 같은 실패 응답이다", async () => {
  const tool = lookupHarness();
  const wrongEmail = await tool.lookupOrder(
    formOf({ orderNo, email: "other@example.invalid" }),
  );
  const missing = await tool.lookupOrder(
    formOf({ orderNo: "O-20261125-0002", email }),
  );
  assert.deepEqual(wrongEmail, missing);
  assert.equal(wrongEmail.message, lookupValidation.orderLookupMismatch);
  assert.equal(wrongEmail.result, undefined);
});

test("잘못된 주문 조회 입력은 DB 접근 전에 거부한다", async () => {
  const tool = lookupHarness();
  for (const form of [
    formOf({ orderNo: "O-20261125-0000", email }),
    formOf({ orderNo, email: "wrong" }),
    formOf({ orderNo: "O-20260229-0001", email }),
  ]) {
    const state = await tool.lookupOrder(form);
    assert.equal(state.result, undefined);
    assert.ok(state.errors);
  }
  assert.equal(tool.dbCalls(), 0);
});

test("주문 상태는 정해진 순서와 진행 중 취소만 허용한다", () => {
  const statuses = Object.keys(adminRules.orderStatusLabels);
  const actions = ["confirm", "ship", "complete", "cancel", "invalid"];
  for (const status of statuses) {
    for (const action of actions) {
      const allowed =
        (status === "pending_payment" &&
          ["confirm", "cancel"].includes(action)) ||
        (status === "payment_confirmed" &&
          ["ship", "cancel"].includes(action)) ||
        (status === "shipping" && ["complete", "cancel"].includes(action));
      const result = adminRules.orderTransitionPatch(
        {
          status,
          tracking_number: status === "shipping" ? "TRACK-1234" : null,
        },
        action,
        " NEW-TRACK ",
      );
      assert.equal(Boolean(result.patch), allowed, `${status}/${action}`);
    }
  }
  assert.equal(
    adminRules.orderTransitionPatch(
      { status: "payment_confirmed", tracking_number: null },
      "ship",
      " ",
    ).patch,
    undefined,
  );
  assert.equal(
    adminRules.orderTransitionPatch(
      { status: "payment_confirmed", tracking_number: null },
      "ship",
      " TRACK-NEW ",
    ).patch.tracking_number,
    "TRACK-NEW",
  );
});

function actionHarness({
  admin = {},
  stored = {
    status: "payment_confirmed",
    tracking_number: null,
    updated_at: "2026-11-25T01:00:00.000Z",
  },
  updateRows = [{ id }],
  updateError = null,
} = {}) {
  let clientCalls = 0;
  const updates = [];
  const conditions = [];
  const invalidations = [];
  let updating = false;
  const query = {
    select() {
      return this;
    },
    eq(...args) {
      conditions.push(args);
      return this;
    },
    returns() {
      return this;
    },
    async maybeSingle() {
      return { data: stored, error: null };
    },
    update(patch) {
      updating = true;
      updates.push(patch);
      return this;
    },
    then(resolve) {
      return Promise.resolve(
        updating
          ? { data: updateRows, error: updateError }
          : { data: stored, error: null },
      ).then(resolve);
    },
  };
  const actions = load("lib/admin/order-actions.ts", {
    "next/cache": {
      revalidatePath(path) {
        invalidations.push(path);
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        clientCalls += 1;
        return { from: () => query };
      },
    },
    "./auth": { requireAdmin: async () => admin },
    "./order-rules": adminRules,
  });
  const form = formOf({
    id,
    action: "ship",
    version: stored.updated_at,
    trackingNumber: " TRACK-NEW ",
  });
  return {
    run: () => actions.changeOrder({}, form),
    form,
    updates,
    conditions,
    invalidations,
    clientCalls: () => clientCalls,
  };
}

test("관리자 아닌 상태 변경 요청은 주문 DB에 접근하지 않는다", async () => {
  const tool = actionHarness({ admin: null });
  const result = await tool.run();
  assert.equal(result.success, false);
  assert.equal(tool.clientCalls(), 0);
});

test("관리자 아닌 목록·상세 조회도 주문 DB에 접근하지 않는다", async () => {
  const orders = load("lib/admin/orders.ts", {
    "server-only": {},
    "@/lib/supabase/server": {
      createClient() {
        throw new Error("must not access DB");
      },
    },
    "./auth": { requireAdmin: async () => null },
    "./order-rules": adminRules,
  });
  assert.equal(
    await orders.getOrderList(adminRules.parseOrderFilters({})),
    null,
  );
  assert.equal(await orders.getOrderDetail(id), null);
});

test("잘못된 상태 전이와 오래된 화면은 변경을 기록하지 않는다", async () => {
  const wrong = actionHarness({
    stored: {
      status: "pending_payment",
      tracking_number: null,
      updated_at: "2026-11-25T01:00:00.000Z",
    },
  });
  assert.equal((await wrong.run()).success, false);
  assert.deepEqual(wrong.updates, []);

  const stale = actionHarness({
    stored: {
      status: "payment_confirmed",
      tracking_number: null,
      updated_at: "2026-11-25T02:00:00.000Z",
    },
  });
  stale.form.set("version", "2026-11-25T01:00:00.000Z");
  assert.equal((await stale.run()).message, adminRules.orderConflictMessage);
  assert.deepEqual(stale.updates, []);
});

test("관리자 배송 처리는 허용 열만 쓰고 목록·상세·고객 조회를 갱신한다", async () => {
  const tool = actionHarness();
  tool.form.set("customer_email", "injected@example.invalid");
  tool.form.set("total", "1");
  const result = await tool.run();
  assert.equal(result.success, true);
  assert.deepEqual(tool.updates, [
    { status: "shipping", tracking_number: "TRACK-NEW" },
  ]);
  assert.ok(
    tool.conditions.some(
      ([key, value]) =>
        key === "updated_at" && value === "2026-11-25T01:00:00.000Z",
    ),
  );
  assert.deepEqual(tool.invalidations, [
    "/admin/orders",
    `/admin/orders/${id}`,
    "/shop/order/lookup",
  ]);
});

test("후속 스키마도 RLS 관리자 정책 아래에서 전이와 송장번호를 제한한다", () => {
  const migration = readFileSync(
    new URL("supabase/migrations/20261125013636_order_lookup_admin.sql", root),
    "utf8",
  );
  assert.match(migration, /add column tracking_number text/);
  assert.match(migration, /create function private\.enforce_order_transition/);
  assert.match(migration, /ORDER_STATUS_TRANSITION_INVALID/);
  assert.match(migration, /ORDER_TRACKING_NUMBER_REQUIRED/);
  assert.match(
    migration,
    /old\.status = 'pending_payment'[\s\S]*new\.status = 'payment_confirmed'/,
  );
  assert.match(
    migration,
    /old\.status = 'payment_confirmed'[\s\S]*new\.status = 'shipping'/,
  );
  assert.match(
    migration,
    /old\.status = 'shipping'[\s\S]*new\.status = 'completed'/,
  );
  assert.match(
    migration,
    /grant update \(tracking_number\) on public\.orders to authenticated/,
  );
  assert.doesNotMatch(migration, /grant [^;]* to anon/i);
});

test("조회와 관리자 화면은 전용 경로와 모바일 안전 클래스를 사용한다", () => {
  const lookup = readFileSync(
    new URL("components/order-lookup/order-lookup.tsx", root),
    "utf8",
  );
  const result = readFileSync(
    new URL("components/order-lookup/order-result.tsx", root),
    "utf8",
  );
  const admin = readFileSync(
    new URL("app/admin/(panel)/orders/page.tsx", root),
    "utf8",
  );
  const controls = readFileSync(
    new URL("components/admin/order-controls.tsx", root),
    "utf8",
  );
  for (const text of [
    "주문 정보 입력",
    "주문 상태 안내",
    "주문 조회하기",
    "O-20261125-0001",
    "h-13",
    "min-w-0",
  ])
    assert.ok(lookup.includes(text), text);
  for (const text of ["주문 상품", "배송 정보", "송장번호", "총 금액"])
    assert.ok(result.includes(text), text);
  assert.match(admin, /name="status"/);
  assert.match(admin, /ORDER_PAGE_SIZE/);
  assert.match(controls, /name="trackingNumber"/);
  assert.match(controls, /입금 확인/);
  assert.match(controls, /배송 중으로 변경/);
  assert.match(controls, /주문 완료/);
  assert.match(controls, /주문 취소/);
  assert.doesNotMatch(
    `${lookup}\n${result}`,
    /localStorage|sessionStorage|document\.cookie|dangerouslySetInnerHTML/,
  );
});
