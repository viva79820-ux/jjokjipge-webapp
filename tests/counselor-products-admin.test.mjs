import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);

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
    assert.ok(name in adapters, name);
    return adapters[name];
  }, exports);
  return exports;
}

const counselorId = "11111111-1111-4111-8111-111111111111";
const otherCounselorId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const version = "2026-11-11T00:00:00.123456+00:00";
const nextVersion = "2026-11-11T00:00:01.654321+00:00";
const counselorRules = load("lib/counselors/rules.ts");
const rules = load("lib/counselor-products/rules.ts", {
  "@/lib/counselors/rules": counselorRules,
});
const reservationRules = load("lib/reservations/rules.ts");
const support = load("lib/admin/support-rules.ts", {
  "../inquiries/validation": {
    categoryLabels: {
      reservation_payment: "예약·입금",
      cancellation_refund: "취소·환불",
      consultation: "상담 방식",
      shop: "타로샵",
      other: "기타",
    },
  },
});
const adminRules = load("lib/admin/rules.ts", {
  "@/lib/reservations/rules": reservationRules,
});

function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id: productId,
    counselor_id: counselorId,
    version,
    mode: "update",
    name: "  테스트 상품  ",
    minutes: "25",
    price: "0",
    sort_order: "-3",
    is_active: "false",
    slug: "client-slug",
    counselor_name: "클라이언트가 보낸 이름",
    ...extra,
  }))
    data.set(key, value);
  return data;
}

function memory(world) {
  return {
    from(table) {
      const query = {
        table,
        filters: [],
        orders: [],
        range: null,
        kind: "select",
        payload: null,
        single: "",
        count: false,
        head: false,
      };
      world.calls.push(query);
      const api = {
        select(_columns, options = {}) {
          query.count = options.count === "exact";
          query.head = Boolean(options.head);
          return api;
        },
        eq(column, value) {
          query.filters.push(["eq", column, value]);
          return api;
        },
        in(column, value) {
          query.filters.push(["in", column, value]);
          return api;
        },
        lt() {
          return api;
        },
        gt() {
          return api;
        },
        order(column, options = {}) {
          query.orders.push([column, options.ascending !== false]);
          return api;
        },
        range(from, to) {
          query.range = [from, to];
          return api;
        },
        insert(payload) {
          query.kind = "insert";
          query.payload = payload;
          return api;
        },
        update(payload) {
          query.kind = "update";
          query.payload = payload;
          return api;
        },
        delete() {
          query.kind = "delete";
          world.deletes.push(query);
          return api;
        },
        maybeSingle() {
          query.single = "maybe";
          return api;
        },
        single() {
          query.single = "one";
          return api;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => execute(world, query))
            .then(resolve, reject);
        },
      };
      return api;
    },
  };
}

function rowsOf(world, table) {
  if (table === "counselors") return world.counselors;
  if (table === "consult_products") return world.products;
  if (table === "reservations") return world.reservations;
  return [];
}

function same(row, filters) {
  return filters.every(([op, column, value]) => {
    if (op === "eq") return row[column] === value;
    if (op === "in") return value.includes(row[column]);
    return true;
  });
}

function sortRows(rows, orders) {
  return [...rows].sort((left, right) => {
    for (const [column, ascending] of orders) {
      if (left[column] === right[column]) continue;
      const compared = left[column] > right[column] ? 1 : -1;
      return ascending ? compared : -compared;
    }
    return 0;
  });
}

function execute(world, query) {
  if (world.readError && query.kind === "select")
    return { data: null, error: world.readError, count: null };
  if (query.kind === "delete")
    return { data: null, error: { code: "DELETE" }, count: null };
  if (query.kind === "insert") {
    const table = rowsOf(world, query.table);
    if (table.some((row) => row.id && row.id === query.payload.id))
      return { data: null, error: { code: "23505" }, count: null };
    const saved = {
      ...query.payload,
      updated_at: nextVersion,
    };
    if (query.table === "reservations")
      saved.reservation_no = saved.reservation_no || "R-TEST-0001";
    table.push(saved);
    if (world.lose && query.table === "consult_products") {
      world.lose = false;
      throw Error("socket");
    }
    if (world.mutationError) return { data: null, error: world.mutationError };
    return finish(query, [saved], table.length);
  }
  let selected = rowsOf(world, query.table).filter((row) =>
    same(row, query.filters),
  );
  if (query.kind === "update") {
    if (world.mutationError)
      return { data: null, error: world.mutationError, count: null };
    if (world.loseUpdate) selected = [];
    for (const row of selected)
      Object.assign(row, query.payload, { updated_at: nextVersion });
  }
  selected = sortRows(selected, query.orders);
  const total = selected.length;
  if (query.range)
    selected = selected.slice(query.range[0], query.range[1] + 1);
  return finish(query, query.head ? [] : selected, total);
}

function finish(query, rows, total) {
  const count = query.count ? total : null;
  if (query.single === "maybe") {
    if (rows.length > 1)
      return { data: null, error: { code: "PGRST116" }, count: null };
    return { data: rows[0] || null, error: null, count };
  }
  if (query.single === "one") {
    if (rows.length !== 1)
      return { data: null, error: { code: "PGRST116" }, count: null };
    return { data: rows[0], error: null, count };
  }
  return { data: rows, error: null, count };
}

function world(extra = {}) {
  return {
    calls: [],
    deletes: [],
    lose: false,
    loseUpdate: false,
    readError: null,
    mutationError: null,
    counselors: [
      {
        id: counselorId,
        slug: "test-counselor",
        name: "테스트 상담사",
        is_active: true,
        approval_status: "approved",
      },
      {
        id: otherCounselorId,
        slug: "test-other",
        name: "테스트 다른상담사",
        is_active: false,
        approval_status: "pending",
      },
    ],
    products: [
      {
        id: productId,
        counselor_id: counselorId,
        name: "테스트 기존상품",
        minutes: 30,
        price: 10000,
        sort_order: 1,
        is_active: true,
        updated_at: version,
      },
    ],
    reservations: [],
    ...extra,
  };
}

function modules(state, auth) {
  const paths = [];
  let clients = 0;
  const server = {
    createClient: async () => {
      clients += 1;
      if (auth.blockClient) throw Error("client opened");
      return memory(state);
    },
  };
  const actions = load("lib/counselor-products/actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": auth,
    "@/lib/admin/support-rules": support,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  const data = load("lib/counselor-products/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  return { ...actions, ...data, paths, clients: () => clients };
}

const adminAuth = {
  requireAdmin: async () => ({
    userId: counselorId,
    email: "admin@example.invalid",
  }),
  blockClient: false,
};

function reservationModules(state) {
  const bookingTime = load("lib/booking-time.ts", {
    "@/lib/booking-config": load("lib/booking-config.ts"),
  });
  const admin = { createAdminClient: () => memory(state) };
  const availability = load("lib/reservations/availability.ts", {
    "server-only": {},
    "@/lib/supabase/admin": admin,
    "@/lib/booking-time": bookingTime,
  });
  const validation = load("lib/reservations/validation.ts", {
    "./types": {},
    "./availability": availability,
    "./rules": reservationRules,
  });
  const actions = load("lib/reservations/actions.ts", {
    "@/lib/supabase/admin": admin,
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getClaims: async () => ({
            data: null,
            error: { name: "AuthSessionMissingError" },
          }),
        },
      }),
    },
    "@/lib/booking-time": bookingTime,
    "./availability": availability,
    "./validation": validation,
    "./types": {},
    "./rules": reservationRules,
  });
  return { ...availability, ...actions, bookingTime };
}

test("product text and integers stay strict", () => {
  const parsed = rules.parseProduct(form());
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.patch.name, "테스트 상품");
  assert.equal(parsed.patch.minutes, 25);
  assert.equal(parsed.patch.price, 0);
  assert.equal(parsed.patch.sort_order, -3);
  assert.equal(parsed.patch.is_active, false);
  for (const minutes of [
    "",
    " ",
    "1.5",
    "1e2",
    "1e+2",
    "30분",
    " 30",
    "30 ",
    "+30",
    "01",
    "0",
    "-1",
    "2147483648",
  ])
    assert.ok(rules.parseProduct(form({ minutes })).errors.minutes, minutes);
  for (const price of ["", "1.0", "1e2", "-1", "10,000", "2147483648"])
    assert.ok(rules.parseProduct(form({ price })).errors.price, price);
  assert.equal(rules.parseProduct(form({ price: "0" })).patch.price, 0);
  assert.equal(rules.parseProduct(form({ minutes: "45" })).patch.minutes, 45);
  assert.equal(
    rules.parseProduct(form({ sort_order: "-2147483648" })).patch.sort_order,
    -2147483648,
  );
  assert.ok(
    rules.parseProduct(form({ sort_order: "-2147483649" })).errors.sort_order,
  );
  assert.ok(rules.parseProduct(form({ sort_order: "" })).errors.sort_order);
  const newline = form({ name: "테스트\n상품" });
  assert.ok(rules.parseProduct(newline).errors.name);
  const control = form({ name: "테스트\u0007상품" });
  assert.ok(rules.parseProduct(control).errors.name);
  assert.equal(
    rules.parseProduct(form({ name: "가".repeat(100) })).patch.name.length,
    100,
  );
  assert.ok(rules.parseProduct(form({ name: "가".repeat(101) })).errors.name);
  assert.ok(rules.parseProduct(form({ name: "   " })).errors.name);
  assert.ok(rules.parseProduct(form({ is_active: "TRUE" })).errors.is_active);
  assert.ok(rules.parseProduct(form({ is_active: "1" })).errors.is_active);
  const duplicated = form();
  duplicated.append("price", "1000");
  assert.ok(rules.parseProduct(duplicated).errors.price);
  const file = form();
  file.set("minutes", new File(["25"], "테스트.txt"));
  assert.ok(rules.parseProduct(file).errors.minutes);
  const filters = rules.productFilters({
    page: "2",
    status: "private",
    counselorReturn: "/admin/counselors?status=public&page=3",
  });
  assert.equal(filters.page, 2);
  assert.equal(filters.status, "private");
  assert.equal(
    filters.counselorReturn,
    "/admin/counselors?page=3&status=public",
  );
  assert.equal(
    rules.productFilters({ counselorReturn: "https://evil.example" })
      .counselorReturn,
    "/admin/counselors",
  );
  assert.equal(rules.productFilters({ status: ["public"] }), null);
  assert.equal(rules.productFilters({ page: "0" }), null);
});

test("logged-out and member sessions cannot save products", async () => {
  function authModule(session, role) {
    return load("lib/admin/auth.ts", {
      "server-only": {},
      "next/headers": {
        headers: async () => ({
          get: () => `/admin/counselors/${counselorId}/products`,
        }),
      },
      "next/navigation": {
        redirect: (url) => {
          throw Object.assign(Error("redirect"), { url });
        },
      },
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: {
            getClaims: async () =>
              session
                ? { data: { claims: session }, error: null }
                : { data: null, error: { message: "missing" } },
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: role ? { role } : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      },
      "./rules": adminRules,
    });
  }
  const state = world();
  const loggedOut = modules(state, authModule(null, null));
  await assert.rejects(
    () => loggedOut.saveProduct(form()),
    (error) => String(error.url).startsWith("/admin/login?next="),
  );
  assert.equal(loggedOut.clients(), 0);
  const member = modules(
    state,
    authModule(
      {
        sub: "55555555-5555-4555-8555-555555555555",
        email: "member@example.invalid",
      },
      "user",
    ),
  );
  const denied = await member.saveProduct(form());
  assert.equal(denied.state, "rejected");
  assert.equal(denied.message, "관리자 권한이 필요합니다.");
  assert.equal(member.clients(), 0);
  assert.equal(
    await member.counselorProductAdminList(counselorId, 1, ""),
    null,
  );
  assert.equal(state.products[0].price, 10000);
});

test("writes only allowed columns and rejects another counselor's product", async () => {
  const state = world();
  const api = modules(state, adminAuth);
  const saved = await api.saveProduct(
    form({ mode: "create", id: attemptId, is_active: "false" }),
  );
  assert.equal(saved.state, "saved");
  const inserted = state.calls.find((call) => call.kind === "insert");
  assert.deepEqual(Object.keys(inserted.payload).sort(), [
    "counselor_id",
    "id",
    "is_active",
    "minutes",
    "name",
    "price",
    "sort_order",
  ]);
  assert.equal(inserted.payload.counselor_id, counselorId);
  assert.equal(inserted.payload.is_active, false);
  assert.equal(inserted.payload.price, 0);
  assert.equal(inserted.payload.minutes, 25);
  assert.equal(Object.hasOwn(inserted.payload, "slug"), false);
  assert.ok(api.paths.includes("/consult/test-counselor"));
  assert.ok(api.paths.includes("/consult/test-counselor/book"));
  assert.equal(api.paths.includes("/consult/client-slug"), false);
  const changed = await api.saveProduct(
    form({ name: "테스트 수정상품", price: "12000", is_active: "true" }),
  );
  assert.equal(changed.state, "saved");
  const updated = state.calls.find((call) => call.kind === "update");
  assert.deepEqual(Object.keys(updated.payload).sort(), [
    "is_active",
    "minutes",
    "name",
    "price",
    "sort_order",
  ]);
  assert.equal(
    updated.filters.some(
      (filter) =>
        filter[0] === "eq" &&
        filter[1] === "counselor_id" &&
        filter[2] === counselorId,
    ),
    true,
  );
  const foreign = world({
    products: [
      {
        id: productId,
        counselor_id: otherCounselorId,
        name: "테스트 타인상품",
        minutes: 30,
        price: 10000,
        sort_order: 1,
        is_active: true,
        updated_at: version,
      },
    ],
  });
  const foreignApi = modules(foreign, adminAuth);
  const rejected = await foreignApi.saveProduct(form());
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.message, "이 상담사의 상품이 아닙니다.");
  assert.equal(
    foreign.calls.some(
      (call) => call.kind === "update" || call.kind === "insert",
    ),
    false,
  );
  assert.equal(foreign.products[0].name, "테스트 타인상품");
  const missing = await foreignApi.counselorProductAdminContext(
    counselorId,
    productId,
  );
  assert.equal(missing.missing, true);
});

test("conflict, lost response, and permission failure do not pretend success", async () => {
  const conflicted = world();
  conflicted.products[0].updated_at = nextVersion;
  const conflictApi = modules(conflicted, adminAuth);
  const conflictResult = await conflictApi.saveProduct(
    form({ name: "테스트 덮어쓰기" }),
  );
  assert.equal(conflictResult.state, "conflict");
  assert.equal(conflicted.products[0].name, "테스트 기존상품");
  assert.equal(conflicted.deletes.length, 0);
  const lost = world({ products: [] });
  const lostApi = modules(lost, adminAuth);
  lost.lose = true;
  const first = await lostApi.saveProduct(
    form({ mode: "create", id: attemptId, name: "테스트 재시도" }),
  );
  assert.equal(first.state, "unknown");
  assert.equal(lost.products.length, 1);
  const second = await lostApi.saveProduct(
    form({ mode: "create", id: attemptId, name: "테스트 재시도" }),
  );
  assert.equal(second.state, "saved");
  assert.equal(lost.products.length, 1);
  assert.equal(lost.products[0].name, "테스트 재시도");
  const different = await lostApi.saveProduct(
    form({ mode: "create", id: attemptId, name: "테스트 다른내용" }),
  );
  assert.equal(different.state, "conflict");
  assert.equal(lost.products[0].name, "테스트 재시도");
  assert.equal(lost.products.length, 1);
  const deniedWrite = world();
  deniedWrite.mutationError = { code: "42501" };
  const deniedApi = modules(deniedWrite, adminAuth);
  const denied = await deniedApi.saveProduct(form({ name: "테스트 권한만료" }));
  assert.equal(denied.state, "rejected");
  assert.equal(deniedWrite.products[0].name, "테스트 기존상품");
  const broken = world();
  broken.readError = { code: "XX000" };
  const brokenApi = modules(broken, adminAuth);
  assert.equal((await brokenApi.saveProduct(form())).state, "unknown");
  assert.equal(broken.products[0].name, "테스트 기존상품");
});

test("lists by sort order and keeps reservation snapshots", async () => {
  const state = world({ products: [] });
  state.products.push(
    {
      id: "66666666-6666-4666-8666-666666666662",
      counselor_id: counselorId,
      name: "테스트 나중",
      minutes: 30,
      price: 1000,
      sort_order: 1,
      is_active: true,
      updated_at: version,
    },
    {
      id: "66666666-6666-4666-8666-666666666661",
      counselor_id: counselorId,
      name: "테스트 먼저",
      minutes: 20,
      price: 0,
      sort_order: 1,
      is_active: false,
      updated_at: version,
    },
  );
  for (let index = 0; index < 20; index += 1)
    state.products.push({
      id: `77777777-7777-4777-8777-${String(index + 1).padStart(12, "0")}`,
      counselor_id: counselorId,
      name: `테스트 목록 ${index + 1}`,
      minutes: 30,
      price: 1000,
      sort_order: 10 + index,
      is_active: true,
      updated_at: version,
    });
  const api = modules(state, adminAuth);
  const page = await api.counselorProductAdminList(counselorId, 1, "");
  assert.equal(page.count, 22);
  assert.equal(page.data.length, 20);
  assert.equal(page.data[0].name, "테스트 먼저");
  assert.equal(page.data[1].name, "테스트 나중");
  const privatePage = await api.counselorProductAdminList(
    counselorId,
    1,
    "private",
  );
  assert.equal(privatePage.count, 1);
  assert.equal(privatePage.data[0].name, "테스트 먼저");
  const empty = world({
    products: [],
    counselors: [
      {
        id: counselorId,
        slug: "test-empty",
        name: "테스트 빈상담사",
        is_active: true,
        approval_status: "approved",
      },
    ],
  });
  const emptyApi = modules(empty, adminAuth);
  const none = await emptyApi.counselorProductAdminList(counselorId, 1, "");
  assert.deepEqual(none.data, []);
  assert.equal(none.count, 0);
  assert.equal("error" in none, false);
  const failed = world();
  failed.readError = { code: "XX000" };
  const failedApi = modules(failed, adminAuth);
  assert.equal(
    (await failedApi.counselorProductAdminList(counselorId, 1, "")).error,
    true,
  );
  await assert.rejects(() => api.counselorProductAdminList(counselorId, 0, ""));

  const bookingWorld = world();
  const booking = reservationModules(bookingWorld);
  const now = new Date();
  const date = booking.bookingTime.bookingDates(now).at(-1);
  const slot = booking.bookingTime
    .calculateSlots(date, 30, [], now)
    .find((item) => item.available);
  const bookingForm = new FormData();
  for (const [key, value] of Object.entries({
    name: "테스트손님",
    phone: "01012345678",
    email: "guest@example.invalid",
    depositor: "테스트손님",
    counselorSlug: "test-counselor",
    productId,
    startsAt: slot.startsAt,
    paymentMethod: "bank_transfer",
    refundConsent: "on",
    privacyConsent: "on",
  }))
    bookingForm.set(key, value);
  const created = await booking.createReservation(undefined, bookingForm);
  assert.equal(created.success.price, 10000);
  assert.equal(created.success.productName, "테스트 기존상품");
  assert.equal(bookingWorld.reservations.length, 1);
  const snapshot = { ...bookingWorld.reservations[0] };
  const productApi = modules(bookingWorld, adminAuth);
  const updated = await productApi.saveProduct(
    form({
      name: "테스트 수정상품",
      minutes: "25",
      price: "0",
      is_active: "false",
    }),
  );
  assert.equal(updated.state, "saved");
  assert.deepEqual(bookingWorld.reservations[0], snapshot);
  assert.equal(snapshot.product_name, "테스트 기존상품");
  assert.equal(snapshot.minutes, 30);
  assert.equal(snapshot.price, 10000);
  assert.equal(
    bookingWorld.products.find((item) => item.id === productId).price,
    0,
  );
  assert.equal(
    await booking.getBookingProduct("test-counselor", productId),
    null,
  );
  const blocked = await booking.createReservation(undefined, bookingForm);
  assert.equal(blocked.success, undefined);
  assert.equal(bookingWorld.reservations.length, 1);
  assert.equal(await booking.getBookingProduct("test-other", productId), null);
  assert.equal(bookingWorld.deletes.length, 0);
  const source = readFileSync(
    new URL("lib/counselor-products/actions.ts", root),
    "utf8",
  );
  assert.equal(source.includes("createAdminClient"), false);
  assert.equal(source.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(source.includes(".delete("), false);
  const policy = readFileSync(
    new URL("supabase/migrations/20261102035714_reservations_schema.sql", root),
    "utf8",
  );
  assert.match(
    policy,
    /consult_products_select_active_or_admin[\s\S]*is_active and exists[\s\S]*c\.is_active and c\.approval_status = 'approved'/,
  );
  const customer = readFileSync(
    new URL("lib/data/counselors.ts", root),
    "utf8",
  );
  assert.match(customer, /\.eq\("is_active", true\)/);
  assert.match(customer, /\.eq\("approval_status", "approved"\)/);
});
