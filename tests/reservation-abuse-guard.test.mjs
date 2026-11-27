import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const counselorId = "10000000-0000-4000-8000-0000000000aa";
const productId = "20000000-0000-4000-8000-0000000000bb";
const generalError =
  "예약 중 문제가 생겼어요. 잠시 후 다시 시도하거나 매장으로 연락해 주세요.";
const limitMessage =
  "입금 대기 중인 예약이 2건 있어요. 입금하거나 기존 예약을 정리한 뒤 다시 예약해 주세요. 문의 0507-1498-0232";

function loadTree(specifier, adapters = {}) {
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
        if (name === "server-only") return {};
        if (name.startsWith("node:")) return require(name);
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

const guard = loadTree("../lib/reservations/abuse-guard.ts");
const { bookingConfig } = loadTree("../lib/booking-config.ts");
const { bookingDates, calculateSlots } = loadTree("../lib/booking-time.ts");
const state = { rows: [], inserts: [], cutoff: "" };

function answer(query) {
  if (query.table === "counselors")
    return { data: { id: counselorId, name: "상담사 A" }, error: null };
  if (query.table === "consult_products")
    return {
      data: {
        id: productId,
        name: "테스트 상담 30분",
        minutes: 30,
        price: 30000,
      },
      error: null,
    };
  if (query.table === "reservations" && query.insert) {
    state.inserts.push(structuredClone(query.insert));
    return {
      data: {
        reservation_no: "R-20261127-0001",
        product_name: query.insert.product_name,
        starts_at: query.insert.starts_at,
        ends_at: query.insert.ends_at,
        price: query.insert.price,
      },
      error: null,
    };
  }
  if (query.table === "reservations" && query.columns.includes("starts_at"))
    return { data: [], error: null };
  if (query.table !== "reservations")
    return { data: null, error: { code: "XX000", message: query.table } };
  const status = query.filters.find(
    (filter) => filter.op === "eq" && filter.column === "status",
  );
  const created = query.filters.find(
    (filter) => filter.op === "gte" && filter.column === "created_at",
  );
  if (created) state.cutoff = created.value;
  return {
    data: state.rows.filter((row) => {
      if (status && row.status !== status.value) return false;
      if (created && row.created_at < created.value) return false;
      return true;
    }),
    error: null,
  };
}

function createAdminClient() {
  return {
    from(table) {
      const query = { table, columns: "", filters: [], insert: null };
      const api = {
        select(columns = "") {
          query.columns = columns;
          return api;
        },
        insert(payload) {
          query.insert = payload;
          return api;
        },
        eq(column, value) {
          query.filters.push({ op: "eq", column, value });
          return api;
        },
        in() {
          return api;
        },
        lt() {
          return api;
        },
        gt() {
          return api;
        },
        gte(column, value) {
          query.filters.push({ op: "gte", column, value });
          return api;
        },
        maybeSingle() {
          return Promise.resolve(answer(query));
        },
        single() {
          return Promise.resolve(answer(query));
        },
        then(resolve, reject) {
          return Promise.resolve(answer(query)).then(resolve, reject);
        },
      };
      return api;
    },
  };
}

const { createReservation } = loadTree("../lib/reservations/actions.ts", {
  "@/lib/supabase/admin": { createAdminClient },
  "@/lib/supabase/server": {
    async createClient() {
      return {
        auth: {
          async getClaims() {
            return {
              data: null,
              error: { name: "AuthSessionMissingError" },
            };
          },
        },
      };
    },
  },
});

const start = bookingDates(new Date())
  .slice(1)
  .flatMap((date) => calculateSlots(date, 30, []))
  .find((slot) => slot.available)?.startsAt;
assert.ok(start, "예약 테스트에 쓸 빈 시간이 있어야 한다");

function reservation(patch = {}) {
  return {
    status: "pending_payment",
    created_at: new Date().toISOString(),
    customer_phone: "010-1234-5678",
    customer_email: "guest@example.invalid",
    ...patch,
  };
}

function form(patch = {}) {
  const values = {
    counselorSlug: "counselor-a",
    productId,
    startsAt: start,
    paymentMethod: "bank_transfer",
    name: "테스트",
    phone: "010-1234-5678",
    email: "guest@example.invalid",
    depositor: "테스트",
    refundConsent: "on",
    privacyConsent: "on",
    [guard.openedAtField]: String(Date.now() - 10_000),
    [guard.honeypotField]: "",
    ...patch,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values))
    data.set(key, String(value));
  return data;
}

function reset(rows = []) {
  state.rows = rows;
  state.inserts = [];
  state.cutoff = "";
}

async function reserve(patch) {
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const result = await createReservation({}, form(patch));
    assert.deepEqual(logged, []);
    return result;
  } finally {
    console.error = original;
  }
}

test("한도 숫자와 안내 문구는 예약 설정에서 온다", () => {
  assert.equal(bookingConfig.maxPendingPerContact, 2);
  assert.equal(bookingConfig.minSubmitSeconds, 3);
  assert.equal(bookingConfig.depositHours, 24);
  assert.equal(guard.pendingLimitMessage(), limitMessage);
});

test("휴대폰은 하이픈을 빼고, 이메일은 소문자로 같은 연락처인지 본다", () => {
  assert.equal(
    guard.samePendingContact(
      { customer_phone: "01012345678", customer_email: "a@example.invalid" },
      "010-1234-5678",
      "guest@example.invalid",
    ),
    true,
  );
  assert.equal(
    guard.samePendingContact(
      {
        customer_phone: "010-0000-1111",
        customer_email: "Guest@Example.invalid",
      },
      "010-1234-5678",
      "guest@example.invalid",
    ),
    true,
  );
  assert.equal(
    guard.samePendingContact(
      {
        customer_phone: "010-9999-8888",
        customer_email: "other@example.invalid",
      },
      "010-1234-5678",
      "guest@example.invalid",
    ),
    false,
  );
});

test("화면을 연 지 설정한 초보다 짧으면 너무 빠른 제출이다", () => {
  const now = 10_000_000;
  const minMs = bookingConfig.minSubmitSeconds * 1000;
  const fast = new FormData();
  fast.set(guard.openedAtField, String(now - minMs + 1));
  assert.equal(guard.isSubmitTooFast(fast, now), true);
  const ready = new FormData();
  ready.set(guard.openedAtField, String(now - minMs));
  assert.equal(guard.isSubmitTooFast(ready, now), false);
  assert.equal(guard.isSubmitTooFast(new FormData(), now), true);
  const honeypot = new FormData();
  honeypot.set(guard.honeypotField, " https://spam.example ");
  assert.equal(guard.isHoneypotTripped(honeypot), true);
  assert.equal(guard.isHoneypotTripped(new FormData()), false);
});

test("같은 연락처의 입금 대기가 1건이면 예약한다", async () => {
  reset([
    reservation({
      customer_phone: "01012345678",
      customer_email: "other@example.invalid",
    }),
    reservation({ status: "confirmed" }),
  ]);
  const result = await reserve();
  assert.equal(result.success.reservationNo, "R-20261127-0001");
  assert.equal(result.message, undefined);
  assert.equal(state.inserts.length, 1);
  assert.equal(state.inserts[0].customer_phone, "010-1234-5678");
  assert.equal(state.inserts[0].customer_email, "guest@example.invalid");
  assert.equal(Object.hasOwn(state.inserts[0], guard.honeypotField), false);
  assert.equal(Object.hasOwn(state.inserts[0], guard.openedAtField), false);
});

test("같은 연락처의 입금 대기가 2건이면 세 번째 예약은 거절한다", async () => {
  reset([
    reservation({
      customer_phone: "01012345678",
      customer_email: "a@example.invalid",
    }),
    reservation({
      customer_phone: "010-1234-5678",
      customer_email: "b@example.invalid",
    }),
  ]);
  const byPhone = await reserve();
  assert.equal(byPhone.success, undefined);
  assert.equal(byPhone.message, limitMessage);
  assert.equal(state.inserts.length, 0);

  reset([
    reservation({
      customer_phone: "010-0000-1111",
      customer_email: "Guest@Example.invalid",
    }),
    reservation({
      customer_phone: "010-0000-2222",
      customer_email: "guest@example.invalid",
    }),
  ]);
  const byEmail = await reserve();
  assert.equal(byEmail.success, undefined);
  assert.equal(byEmail.message, limitMessage);
  assert.equal(state.inserts.length, 0);
});

test("다른 번호와 이메일의 입금 대기는 한도에 넣지 않는다", async () => {
  reset([
    reservation({
      customer_phone: "010-9999-8888",
      customer_email: "other-a@example.invalid",
    }),
    reservation({
      customer_phone: "01099998888",
      customer_email: "other-b@example.invalid",
    }),
  ]);
  const result = await reserve();
  assert.equal(result.success.reservationNo, "R-20261127-0001");
  assert.equal(state.inserts.length, 1);
});

test("입금 기한이 지난 입금 대기는 세지 않는다", async () => {
  const expired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  reset([
    reservation({ created_at: expired }),
    reservation({
      created_at: expired,
      customer_email: "guest@example.invalid",
    }),
  ]);
  const result = await reserve();
  assert.equal(result.success.reservationNo, "R-20261127-0001");
  assert.equal(state.inserts.length, 1);
  const age = Date.now() - Date.parse(state.cutoff);
  assert.ok(Math.abs(age - bookingConfig.depositHours * 60 * 60 * 1000) < 5000);
});

test("허니팟에 값이 있으면 저장하지 않고 일반 오류를 반환한다", async () => {
  reset();
  const result = await reserve({
    [guard.honeypotField]: "https://spam.example",
  });
  assert.equal(result.success, undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.message, generalError);
  assert.equal(state.inserts.length, 0);
});

test("화면을 연 지 3초 안에 제출하면 저장하지 않고 일반 오류를 반환한다", async () => {
  reset();
  const result = await reserve({
    [guard.openedAtField]: String(Date.now()),
  });
  assert.equal(result.success, undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.message, generalError);
  assert.equal(state.inserts.length, 0);

  const missing = form();
  missing.delete(guard.openedAtField);
  const omitted = await createReservation({}, missing);
  assert.equal(omitted.message, generalError);
  assert.equal(omitted.success, undefined);
  assert.equal(state.inserts.length, 0);
});

test("예약 화면은 입력값을 지우는 대신 보이지 않는 칸만 추가한다", () => {
  const source = readFileSync(
    new URL("../components/booking/booking-form.tsx", import.meta.url),
    "utf8",
  );
  const callback = source.slice(
    source.indexOf("useActionState"),
    source.indexOf("const [contact"),
  );
  assert.equal(callback.includes("setContact"), false);
  assert.equal(callback.includes("setConsent"), false);
  assert.match(source, /value=\{contact\.phone\}/);
  assert.match(source, /value=\{contact\[field\.name\]\}/);
  assert.match(source, /value=\{contact\.depositor\}/);
  const honeypot = source.slice(source.indexOf('aria-hidden="true"'));
  assert.match(honeypot, /tabIndex=\{-1\}/);
  assert.match(honeypot, /name=\{honeypotField\}/);
  assert.match(source, /name=\{openedAtField\}/);
  assert.match(source, /openedAt\.current = String\(Date\.now\(\)\)/);
  assert.match(source, /defaultValue=""/);
});
