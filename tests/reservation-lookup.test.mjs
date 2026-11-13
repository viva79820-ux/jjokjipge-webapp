import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function loadModule(file, adapters = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}
const rules = loadModule("../lib/reservations/rules.ts");
const validation = loadModule("../lib/reservations/lookup/validation.ts", {
  "../rules": rules,
});
const display = loadModule("../lib/reservations/lookup/display.ts");
const columns =
  "reservation_no,status,product_name,minutes,price,starts_at,ends_at,payment_method,cancel_reason,counselors(name)";
const email = "test@example.invalid";
const reservationNo = "R-20261102-0001";
function formOf(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
function storedRow(patch = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    counselor_id: "33333333-3333-4333-8333-333333333333",
    product_id: "44444444-4444-4444-8444-444444444444",
    reservation_no: reservationNo,
    customer_name: "테스트비밀이름",
    customer_phone: "010-9999-0000",
    customer_email: email,
    depositor_name: "테스트입금자",
    product_name: "테스트 당시 상품",
    minutes: 30,
    price: 15000,
    starts_at: "2026-11-12T03:00:00.000Z",
    ends_at: "2026-11-12T03:30:00.000Z",
    payment_method: "bank_transfer",
    status: "pending_payment",
    cancel_reason: "테스트 내부 메모",
    confirmed_at: "2026-11-12T00:00:00.000Z",
    counselors: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "테스트 비공개상담사",
      is_active: false,
      approval_status: "rejected",
    },
    consult_products: {
      name: "테스트 현재 상품",
      price: 99000,
      is_active: false,
    },
    ...patch,
  };
}
function harness({
  row = storedRow(),
  error = null,
  throwDb = false,
  throwClient = false,
} = {}) {
  const calls = [];
  let current = [];
  let dbCalls = 0;
  const snapshot = structuredClone(row);
  const query = {
    select(value) {
      calls.push(["select", value]);
      current.push(["select", value]);
      return this;
    },
    eq(key, value) {
      calls.push(["eq", key, value]);
      current.push(["eq", key, value]);
      return this;
    },
    insert() {
      calls.push(["insert"]);
      throw new Error("write");
    },
    update() {
      calls.push(["update"]);
      throw new Error("write");
    },
    delete() {
      calls.push(["delete"]);
      throw new Error("write");
    },
    upsert() {
      calls.push(["upsert"]);
      throw new Error("write");
    },
    ilike() {
      calls.push(["ilike"]);
      throw new Error("pattern");
    },
    or() {
      calls.push(["or"]);
      throw new Error("pattern");
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      const eqs = current.filter((item) => item[0] === "eq");
      current = [];
      if (throwDb) throw new Error(`SECRET_DB ${email}`);
      if (error) return { data: null, error };
      const reservation = eqs.find((item) => item[1] === "reservation_no");
      const mail = eqs.find((item) => item[1] === "customer_email");
      const matches =
        reservation?.[2] === row.reservation_no &&
        mail?.[2] === row.customer_email;
      return { data: matches ? row : null, error: null };
    },
  };
  const actions = loadModule("../lib/reservations/lookup/actions.ts", {
    "server-only": {},
    "./validation": validation,
    "@/lib/supabase/admin": {
      createAdminClient() {
        dbCalls += 1;
        if (throwClient) throw new Error("SECRET_TOKEN");
        return {
          from(table) {
            calls.push(["from", table]);
            current = [];
            return query;
          },
        };
      },
    },
  });
  return {
    ...actions,
    calls,
    dbCalls: () => dbCalls,
    unchanged: () => assert.deepEqual(row, snapshot),
  };
}
function assertPrivate(state) {
  const text = JSON.stringify(state);
  for (const secret of [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "테스트비밀이름",
    "010-9999-0000",
    email,
    "테스트입금자",
    "테스트 현재 상품",
    "99000",
    "테스트 내부 메모",
    "rejected",
    "SECRET",
    "relation",
    "XX000",
  ])
    assert.equal(text.includes(secret), false, secret);
}

test("reservation numbers match the trigger and keep long serials", () => {
  for (const value of [
    reservationNo,
    " r-20261102-0001 ",
    "R-20240229-0001",
    "R-20261102-9999",
    "R-20261102-10000",
    " r-20261102-10000 ",
    "R-20261102-2147483647",
  ])
    assert.equal(validation.isValidReservationNo(value), true, value);
  assert.equal(
    validation.normalizeReservationNo(" r-20261102-10000 "),
    "R-20261102-10000",
  );
  for (const value of [
    "",
    "R-20261102-0000",
    "R-20261102-00001",
    "R-20261102-010000",
    "R-20260229-0001",
    "R-20261131-0001",
    "R-20261301-0001",
    "R-00000101-0001",
    "R-20261102-2147483648",
    "R-20261102-9999999999",
    "11111111-1111-4111-8111-111111111111",
    "R-20261102-00\u000101",
    `R-${"1".repeat(80)}`,
  ])
    assert.equal(validation.isValidReservationNo(value), false, value);
});

test("lookup email accepts the same addresses as reservation creation", () => {
  const boundary = `${"a".repeat(242)}@example.com`;
  assert.equal(boundary.length, 254);
  for (const value of [
    email,
    " Test@EXAMPLE.invalid ",
    " Test@EXAMPLE.invalid\n",
    "가@example.com",
    "a..b@example.com",
    "user+tag@sub.example.com",
    boundary,
  ]) {
    assert.equal(rules.isValidEmail(value), true, value);
    assert.equal(validation.isValidLookupEmail(value), true, value);
  }
  assert.equal(
    validation.normalizeLookupEmail(" Test@EXAMPLE.invalid "),
    email,
  );
  for (const value of [
    "",
    "a@localhost",
    "a b@example.com",
    "a\u0001@example.com",
    `${"a".repeat(255)}@example.com`,
    `${"a".repeat(400)}`,
  ])
    assert.equal(validation.isValidLookupEmail(value), false, value);
});

test("malformed lookup fields are rejected before a database call", async () => {
  const tool = harness();
  const missing = formOf({ reservationNo });
  missing.delete("email");
  const duplicated = new FormData();
  duplicated.append("reservationNo", reservationNo);
  duplicated.append("reservationNo", "R-20261102-0002");
  duplicated.append("email", email);
  const file = formOf({ reservationNo });
  file.set("email", new File([email], "email.txt"));
  const cases = [
    formOf({}),
    missing,
    duplicated,
    file,
    formOf({ reservationNo: "R-20261102-0000", email }),
    formOf({ reservationNo, email: "a\u0001@example.com" }),
    formOf({ reservationNo: `R-${"1".repeat(80)}`, email }),
    formOf({ reservationNo, email: `${"a".repeat(300)}@example.com` }),
  ];
  for (const form of cases) {
    const state = await tool.lookupReservation(form);
    assert.equal(state.result, undefined);
    assert.ok(state.errors?.reservationNo || state.errors?.email);
  }
  assert.equal(
    await tool.lookupReservation(null).then((state) => state.result),
    undefined,
  );
  assert.equal(tool.dbCalls(), 0);
  tool.unchanged();
});

test("both filters are applied and private columns stay on the server", async () => {
  const tool = harness();
  const state = await tool.lookupReservation(
    formOf({
      reservationNo: " r-20261102-0001 ",
      email: " Test@EXAMPLE.invalid ",
    }),
  );
  assert.deepEqual(
    tool.calls.filter((item) => item[0] === "eq"),
    [
      ["eq", "reservation_no", reservationNo],
      ["eq", "customer_email", email],
    ],
  );
  assert.deepEqual(
    tool.calls.find((item) => item[0] === "select"),
    ["select", columns],
  );
  assert.equal(tool.calls.filter((item) => item[0] === "from").length, 1);
  assert.equal(
    tool.calls.some((item) => item[0] === "insert"),
    false,
  );
  assert.deepEqual(state.result, {
    reservationNo,
    status: "pending_payment",
    counselorName: "테스트 비공개상담사",
    productName: "테스트 당시 상품",
    startsAt: "2026-11-12T03:00:00.000Z",
    endsAt: "2026-11-12T03:30:00.000Z",
    minutes: 30,
    price: 15000,
    paymentMethod: "bank_transfer",
  });
  assert.equal(Object.hasOwn(state.result, "cancelReason"), false);
  assertPrivate(state);
  tool.unchanged();
});

test("a missing number and a wrong email return the same response", async () => {
  const tool = harness();
  const missing = await tool.lookupReservation(
    formOf({ reservationNo: "R-20261102-0002", email }),
  );
  const wrongEmail = await tool.lookupReservation(
    formOf({ reservationNo, email: "other@example.invalid" }),
  );
  assert.equal(missing.message, validation.lookupMismatch);
  assert.deepEqual(missing, wrongEmail);
  assert.equal(missing.result, undefined);
  assertPrivate(missing);
  assert.deepEqual(
    tool.calls.filter((item) => item[0] === "eq"),
    [
      ["eq", "reservation_no", "R-20261102-0002"],
      ["eq", "customer_email", email],
      ["eq", "reservation_no", reservationNo],
      ["eq", "customer_email", "other@example.invalid"],
    ],
  );
});

test("long serials are queried whole and snapshots survive hidden products", async () => {
  const number = "R-20261102-10000";
  const tool = harness({
    row: storedRow({
      reservation_no: number,
      product_name: "테스트 당시 긴 상품",
      minutes: 60,
      price: 22000,
      ends_at: "2026-11-12T04:00:00.000Z",
      payment_method: "card",
      status: "confirmed",
      cancel_reason: null,
    }),
  });
  const state = await tool.lookupReservation(
    formOf({ reservationNo: number, email }),
  );
  assert.equal(
    tool.calls.find((item) => item[1] === "reservation_no")[2],
    number,
  );
  assert.equal(state.result.reservationNo, number);
  assert.equal(state.result.productName, "테스트 당시 긴 상품");
  assert.equal(state.result.minutes, 60);
  assert.equal(state.result.price, 22000);
  assert.equal(state.result.paymentMethod, "card");
  assert.equal(state.result.counselorName, "테스트 비공개상담사");
  tool.unchanged();
});

test("all four statuses and a plain-text cancellation reason", async () => {
  for (const status of ["pending_payment", "confirmed", "completed"]) {
    const tool = harness({ row: storedRow({ status, cancel_reason: null }) });
    const state = await tool.lookupReservation(
      formOf({ reservationNo, email }),
    );
    assert.equal(state.result.status, status);
    assert.equal(state.result.cancelReason, undefined);
  }
  const reason = "테스트 취소 사유\n<b>일반 텍스트</b>";
  const cancelled = harness({
    row: storedRow({ status: "cancelled", cancel_reason: `  ${reason}  ` }),
  });
  const state = await cancelled.lookupReservation(
    formOf({ reservationNo, email }),
  );
  assert.equal(state.result.status, "cancelled");
  assert.equal(state.result.cancelReason, reason);
  const hidden = harness({
    row: storedRow({ status: "confirmed", cancel_reason: "테스트 내부 메모" }),
  });
  const confirmed = await hidden.lookupReservation(
    formOf({ reservationNo, email }),
  );
  assert.equal(JSON.stringify(confirmed).includes("테스트 내부 메모"), false);
});

test("database failures and corrupt rows do not leak or invent a status", async () => {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const broken = harness({
      error: {
        message: "SECRET_DB relation reservations",
        details: email,
        code: "XX000",
      },
    });
    const failed = await broken.lookupReservation(
      formOf({ reservationNo, email }),
    );
    const thrown = harness({ throwDb: true });
    const exploded = await thrown.lookupReservation(
      formOf({ reservationNo, email }),
    );
    const client = harness({ throwClient: true });
    const blocked = await client.lookupReservation(
      formOf({ reservationNo, email }),
    );
    for (const state of [failed, exploded, blocked]) {
      assert.equal(state.message, validation.lookupFailure);
      assert.equal(state.result, undefined);
      assertPrivate(state);
    }
    for (const patch of [
      { status: "refunded" },
      { price: "15000" },
      { minutes: 45 },
      { payment_method: "cash" },
      { counselors: { name: "  " } },
      { counselors: null },
      { starts_at: "not-a-date" },
    ]) {
      const tool = harness({ row: storedRow(patch) });
      const state = await tool.lookupReservation(
        formOf({ reservationNo, email }),
      );
      assert.equal(
        state.message,
        validation.lookupFailure,
        JSON.stringify(patch),
      );
      assert.equal(state.result, undefined);
    }
    assert.deepEqual(logs, []);
  } finally {
    console.error = original;
  }
});

test("Seoul schedule labels and customer-facing status text", () => {
  assert.deepEqual(
    display.formatSchedule(
      "2026-11-12T03:00:00.000Z",
      "2026-11-12T03:30:00.000Z",
    ),
    {
      date: "2026년 11월 12일 목",
      startTime: "12:00",
      endTime: "12:30",
    },
  );
  assert.equal(
    display.formatSchedule(
      "2026-11-12T14:30:00.000Z",
      "2026-11-12T15:30:00.000Z",
    ).date,
    "2026년 11월 12일 목 ~ 2026년 11월 13일 금",
  );
  assert.deepEqual(display.statusLabels, {
    pending_payment: "입금 대기",
    confirmed: "예약 확정",
    completed: "상담 완료",
    cancelled: "예약 취소",
  });
  assert.deepEqual(display.paymentLabels, {
    bank_transfer: "무통장입금",
    card: "카드결제",
  });
});

test("lookup files stay inside the reservation module and do not cache personal data", () => {
  const action = readFileSync(
    new URL("../lib/reservations/lookup/actions.ts", import.meta.url),
    "utf8",
  );
  const form = readFileSync(
    new URL(
      "../components/booking-lookup/reservation-lookup.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const result = readFileSync(
    new URL(
      "../components/booking-lookup/reservation-result.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const page = readFileSync(
    new URL("../app/(site)/booking/lookup/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(action, /createAdminClient/);
  assert.match(action, /server-only/);
  assert.doesNotMatch(
    action,
    /select\(\s*["']\*["']|ilike|localStorage|cookies\(/,
  );
  assert.doesNotMatch(
    action,
    /SUPABASE_SECRET_KEY|createPublicClient|consult_products/,
  );
  assert.match(result, /bookingConfig/);
  assert.doesNotMatch(result, /000-0000-0000|예시은행|자동 취소|메일을 보냈/);
  assert.doesNotMatch(
    `${form}\n${result}\n${page}`,
    /localStorage|sessionStorage|document\.cookie|searchParams|dangerouslySetInnerHTML/,
  );
});
