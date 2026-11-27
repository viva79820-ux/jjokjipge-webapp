import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const counselorId = "10000000-0000-4000-8000-0000000000aa";
const productId = "20000000-0000-4000-8000-0000000000bb";
const now = Date.parse("2026-11-27T03:00:00.000Z");
const cronValue = "cron-test-value";

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

const expiry = loadTree("../lib/reservations/deposit-expiry.ts");
const { bookingConfig } = loadTree("../lib/booking-config.ts");
const auth = loadTree("../lib/reservations/cron-auth.ts");
const { bookingDates, calculateSlots } = loadTree("../lib/booking-time.ts");
const guard = loadTree("../lib/reservations/abuse-guard.ts");

function compare(left, right) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function matches(row, filters) {
  return filters.every((filter) => {
    const value = row[filter.column];
    if (filter.op === "eq") return value === filter.value;
    const delta = compare(value, filter.value);
    if (filter.op === "lt") return delta < 0;
    if (filter.op === "gt") return delta > 0;
    if (filter.op === "gte") return delta >= 0;
    return false;
  });
}

function memoryDb(rows) {
  const calls = [];
  const client = {
    from(table) {
      const query = { table, filters: [], patch: null, selected: false };
      const api = {
        update(patch) {
          query.patch = patch;
          return api;
        },
        select() {
          query.selected = true;
          return api;
        },
        eq(column, value) {
          query.filters.push({ op: "eq", column, value });
          return api;
        },
        lt(column, value) {
          query.filters.push({ op: "lt", column, value });
          return api;
        },
        gt(column, value) {
          query.filters.push({ op: "gt", column, value });
          return api;
        },
        gte(column, value) {
          query.filters.push({ op: "gte", column, value });
          return api;
        },
        in(column, value) {
          query.filters.push({ op: "in", column, value });
          return api;
        },
        maybeSingle() {
          calls.push(query);
          return Promise.resolve(read(query));
        },
        then(resolve, reject) {
          calls.push(query);
          return Promise.resolve(read(query)).then(resolve, reject);
        },
      };
      return api;
    },
  };
  function read(query) {
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
    const matched = rows.filter((row) => matches(row, query.filters));
    if (!query.patch) return { data: matched, error: null };
    for (const row of matched) Object.assign(row, structuredClone(query.patch));
    return {
      data: query.selected ? matched.map((row) => ({ id: row.id })) : null,
      error: null,
    };
  }
  return { client, calls };
}

test("입금 기한은 예약 설정의 24시간이고 그 시각은 아직 기한 안이다", () => {
  const hours = bookingConfig.depositHours * 60 * 60 * 1000;
  assert.equal(bookingConfig.depositHours, 24);
  assert.equal(
    expiry.pendingWindowStart(now),
    new Date(now - hours).toISOString(),
  );
  assert.equal(guard.pendingWindowStart(now), expiry.pendingWindowStart(now));
  const cutoff = expiry.pendingWindowStart(now);
  assert.equal(expiry.isPastDepositDeadline(cutoff, now), false);
  assert.equal(
    expiry.isPastDepositDeadline(
      new Date(Date.parse(cutoff) + 1).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    expiry.isPastDepositDeadline(
      new Date(Date.parse(cutoff) - 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    expiry.isPastDepositDeadline("2026-11-26T12:00:00+09:00", now),
    false,
  );
  assert.equal(
    expiry.isPastDepositDeadline("2026-11-26T11:59:59+09:00", now),
    true,
  );
  assert.deepEqual(expiry.depositExpiryPatch(now), {
    status: "cancelled",
    cancelled_at: "2026-11-27T03:00:00.000Z",
    cancel_reason: "입금 기한 경과",
  });
});

test("기한 경과 취소만 입금 기한 경과로 취소라고 보여 준다", () => {
  assert.equal(expiry.depositExpiredStatusLabel, "입금 기한 경과로 취소");
  assert.equal(
    expiry.cancellationStatusLabel(
      "cancelled",
      expiry.depositExpiredReason,
      "취소",
    ),
    "입금 기한 경과로 취소",
  );
  assert.equal(
    expiry.cancellationStatusLabel(
      "cancelled",
      expiry.depositExpiredReason,
      "예약 취소",
    ),
    "입금 기한 경과로 취소",
  );
  assert.equal(
    expiry.cancellationStatusLabel("cancelled", "고객 요청", "취소"),
    "취소",
  );
  assert.equal(
    expiry.cancellationStatusLabel(
      "confirmed",
      expiry.depositExpiredReason,
      "확정",
    ),
    "확정",
  );
  assert.equal(
    expiry.cancellationStatusLabel("pending_payment", null, "입금 대기"),
    "입금 대기",
  );
});

test("빈 시간 계산은 기한이 지난 입금 대기만 빼고 확정 예약은 남긴다", async () => {
  const clock = new Date(now);
  const date = bookingDates(clock)[1];
  const slot = calculateSlots(date, 30, [], clock).find(
    (item) => item.available,
  );
  assert.ok(slot);
  const cutoff = expiry.pendingWindowStart(now);
  const rows = [];
  const db = memoryDb(rows);
  const { getAvailableSlots, getAvailabilityCalendar } = loadTree(
    "../lib/reservations/availability.ts",
    { "@/lib/supabase/admin": { createAdminClient: () => db.client } },
  );
  function hold(createdAt, status = "pending_payment") {
    return {
      counselor_id: counselorId,
      status,
      created_at: createdAt,
      starts_at: slot.startsAt,
      ends_at: new Date(Date.parse(slot.startsAt) + 30 * 60000).toISOString(),
    };
  }
  async function open() {
    const slots = await getAvailableSlots(
      "counselor-a",
      productId,
      date,
      clock,
    );
    return slots.find((item) => item.startsAt === slot.startsAt)?.available;
  }
  rows.push(hold(new Date(Date.parse(cutoff) - 1).toISOString()));
  assert.equal(await open(), true);
  rows.splice(0, rows.length, hold(cutoff));
  assert.equal(await open(), false);
  rows.splice(
    0,
    rows.length,
    hold(new Date(Date.parse(cutoff) + 1).toISOString()),
  );
  assert.equal(await open(), false);
  rows.splice(
    0,
    rows.length,
    hold(new Date(Date.parse(cutoff) - 1).toISOString(), "confirmed"),
  );
  assert.equal(await open(), false);

  const pending = db.calls.filter(
    (query) =>
      query.table === "reservations" &&
      query.filters.some(
        (filter) =>
          filter.op === "eq" &&
          filter.column === "status" &&
          filter.value === "pending_payment",
      ),
  );
  const confirmed = db.calls.filter(
    (query) =>
      query.table === "reservations" &&
      query.filters.some(
        (filter) =>
          filter.op === "eq" &&
          filter.column === "status" &&
          filter.value === "confirmed",
      ),
  );
  assert.ok(pending.length >= 4);
  assert.ok(
    pending.every((query) =>
      query.filters.some(
        (filter) =>
          filter.op === "gte" &&
          filter.column === "created_at" &&
          filter.value === cutoff,
      ),
    ),
  );
  assert.ok(confirmed.length >= 4);
  assert.ok(
    confirmed.every(
      (query) =>
        !query.filters.some((filter) => filter.column === "created_at"),
    ),
  );
  const before = Date.now();
  await getAvailabilityCalendar("counselor-a", productId);
  const after = Date.now();
  const hours = bookingConfig.depositHours * 60 * 60 * 1000;
  const calendarPending = db.calls.filter(
    (query) =>
      query.table === "reservations" &&
      query.filters.some(
        (filter) =>
          filter.value === "pending_payment" && filter.column === "status",
      ),
  );
  const latest = calendarPending.at(-1);
  const created = latest.filters.find(
    (filter) => filter.column === "created_at",
  );
  assert.equal(created.op, "gte");
  assert.ok(Date.parse(created.value) + hours >= before);
  assert.ok(Date.parse(created.value) + hours <= after);
});

function sampleRows() {
  const cutoff = expiry.pendingWindowStart(now);
  return [
    {
      id: "before",
      status: "pending_payment",
      created_at: new Date(Date.parse(cutoff) - 1).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "exact",
      status: "pending_payment",
      created_at: cutoff,
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "inside",
      status: "pending_payment",
      created_at: new Date(Date.parse(cutoff) + 1).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "confirmed",
      status: "confirmed",
      created_at: new Date(Date.parse(cutoff) - 1).toISOString(),
      confirmed_at: "2026-11-26T04:00:00.000Z",
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "completed",
      status: "completed",
      created_at: new Date(Date.parse(cutoff) - 1).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "already",
      status: "cancelled",
      created_at: new Date(Date.parse(cutoff) - 1).toISOString(),
      cancel_reason: "고객 요청",
      cancelled_at: "2026-11-26T01:00:00.000Z",
    },
  ];
}

test("기한이 지난 입금 대기만 취소하고 다시 실행해도 예약은 그대로다", async () => {
  const rows = sampleRows();
  const db = memoryDb(rows);
  const { cancelExpiredDeposits, handleDepositExpiryRequest } = loadTree(
    "../lib/reservations/expire-reservations.ts",
    { "@/lib/supabase/admin": { createAdminClient: () => db.client } },
  );
  assert.equal(await cancelExpiredDeposits(db.client, now), 1);
  assert.equal(rows.find((row) => row.id === "before").status, "cancelled");
  assert.equal(
    rows.find((row) => row.id === "before").cancel_reason,
    "입금 기한 경과",
  );
  assert.equal(
    rows.find((row) => row.id === "before").cancelled_at,
    "2026-11-27T03:00:00.000Z",
  );
  for (const id of ["exact", "inside"]) {
    assert.equal(rows.find((row) => row.id === id).status, "pending_payment");
    assert.equal(rows.find((row) => row.id === id).cancel_reason, null);
  }
  assert.equal(rows.find((row) => row.id === "confirmed").status, "confirmed");
  assert.equal(
    rows.find((row) => row.id === "confirmed").confirmed_at,
    "2026-11-26T04:00:00.000Z",
  );
  assert.equal(rows.find((row) => row.id === "completed").status, "completed");
  assert.equal(
    rows.find((row) => row.id === "already").cancel_reason,
    "고객 요청",
  );
  assert.equal(
    rows.find((row) => row.id === "already").cancelled_at,
    "2026-11-26T01:00:00.000Z",
  );
  const snapshot = structuredClone(rows);
  const again = await handleDepositExpiryRequest(
    `Bearer ${cronValue}`,
    cronValue,
    now,
  );
  assert.deepEqual(again, { status: 200, count: 0 });
  assert.deepEqual(rows, snapshot);
  assert.equal(
    db.calls.filter((query) => query.patch).every((query) => query.selected),
    true,
  );
  assert.ok(
    db.calls
      .filter((query) => query.patch)
      .every((query) => Object.keys(query.patch).length === 3),
  );
});

test("비밀값이 없거나 다르면 예약을 바꾸지 않고 401이다", async () => {
  const rows = sampleRows();
  const db = memoryDb(rows);
  let clients = 0;
  const { handleDepositExpiryRequest } = loadTree(
    "../lib/reservations/expire-reservations.ts",
    {
      "@/lib/supabase/admin": {
        createAdminClient() {
          clients += 1;
          return db.client;
        },
      },
    },
  );
  const snapshot = structuredClone(rows);
  for (const [header, secret] of [
    [null, undefined],
    ["Bearer cron-test-value", undefined],
    ["Bearer cron-test-value", ""],
    [null, cronValue],
    ["Bearer wrong-value", cronValue],
    ["Bearer cron-test-value-extra", cronValue],
    ["Bearer cron-test-valu", cronValue],
    ["bearer cron-test-value", cronValue],
  ]) {
    assert.equal(auth.authorizationMatches(header, secret), false);
    assert.deepEqual(await handleDepositExpiryRequest(header, secret, now), {
      status: 401,
    });
  }
  assert.equal(clients, 0);
  assert.deepEqual(rows, snapshot);
  assert.equal(
    auth.authorizationMatches(`Bearer ${cronValue}`, cronValue),
    true,
  );
});

test("크론 경로는 맞는 비밀값에만 처리 건수를 반환하고 반복해도 상태가 같다", async () => {
  const clock = Date.now();
  const rows = [
    {
      id: "old",
      status: "pending_payment",
      created_at: new Date(clock - 48 * 60 * 60 * 1000).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "fresh",
      status: "pending_payment",
      created_at: new Date(clock - 60 * 1000).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
    {
      id: "confirmed",
      status: "confirmed",
      created_at: new Date(clock - 48 * 60 * 60 * 1000).toISOString(),
      confirmed_at: new Date(clock - 47 * 60 * 60 * 1000).toISOString(),
      cancel_reason: null,
      cancelled_at: null,
    },
  ];
  const db = memoryDb(rows);
  function NextResponse(body, init = {}) {
    this.status = init.status ?? 200;
    this.body = body;
    this.headers = init.headers ?? {};
  }
  NextResponse.json = (data, init = {}) => {
    const response = new NextResponse(JSON.stringify(data), init);
    response.data = data;
    return response;
  };
  const { GET } = loadTree("../app/api/cron/expire-reservations/route.ts", {
    "next/server": { NextResponse },
    "@/lib/supabase/admin": { createAdminClient: () => db.client },
  });
  const previous = process.env.CRON_SECRET;
  const url = "http://localhost/api/cron/expire-reservations";
  try {
    delete process.env.CRON_SECRET;
    const missing = await GET(new Request(url));
    assert.equal(missing.status, 401);
    assert.equal(db.calls.length, 0);
    process.env.CRON_SECRET = "";
    const empty = await GET(
      new Request(url, {
        headers: { authorization: "Bearer cron-test-value" },
      }),
    );
    assert.equal(empty.status, 401);
    assert.equal(db.calls.length, 0);
    process.env.CRON_SECRET = cronValue;
    const mismatch = await GET(
      new Request(url, { headers: { authorization: "Bearer wrong-value" } }),
    );
    assert.equal(mismatch.status, 401);
    assert.equal(mismatch.body, null);
    assert.equal(db.calls.length, 0);
    const first = await GET(
      new Request(url, {
        headers: { authorization: `Bearer ${cronValue}` },
      }),
    );
    assert.equal(first.status, 200);
    assert.deepEqual(first.data, { count: 1 });
    assert.deepEqual(Object.keys(first.data), ["count"]);
    assert.equal(first.headers["Cache-Control"], "no-store");
    assert.equal(rows.find((row) => row.id === "old").status, "cancelled");
    assert.equal(
      rows.find((row) => row.id === "old").cancel_reason,
      "입금 기한 경과",
    );
    assert.equal(
      rows.find((row) => row.id === "fresh").status,
      "pending_payment",
    );
    assert.equal(
      rows.find((row) => row.id === "confirmed").status,
      "confirmed",
    );
    const snapshot = structuredClone(rows);
    const second = await GET(
      new Request(url, {
        headers: { authorization: `Bearer ${cronValue}` },
      }),
    );
    assert.equal(second.status, 200);
    assert.deepEqual(second.data, { count: 0 });
    assert.deepEqual(rows, snapshot);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("처리 실패는 예약 내용 없이 500이고 화면은 같은 문구를 쓴다", async () => {
  const { handleDepositExpiryRequest } = loadTree(
    "../lib/reservations/expire-reservations.ts",
    {
      "@/lib/supabase/admin": {
        createAdminClient() {
          throw new Error("database password unavailable");
        },
      },
    },
  );
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  try {
    assert.deepEqual(
      await handleDepositExpiryRequest(`Bearer ${cronValue}`, cronValue, now),
      { status: 500 },
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(logged, [["Reservation deposit expiry failed"]]);
  const files = [
    "../components/admin/reservation-cards.tsx",
    "../app/admin/(panel)/reservations/[id]/page.tsx",
    "../components/booking-lookup/status-badge.tsx",
    "../components/booking-lookup/reservation-result.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /cancellationStatusLabel/);
  }
  const result = readFileSync(
    new URL(
      "../components/booking-lookup/reservation-result.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(result, /cancelReason=\{result\.cancelReason\}/);
  const vercel = JSON.parse(
    readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.ok(
    vercel.crons.some(
      (cron) =>
        cron.path === "/api/cron/expire-reservations" &&
        cron.schedule === "0 * * * *",
    ),
  );
  assert.deepEqual(vercel.regions, ["icn1"]);
  const guardSource = readFileSync(
    new URL("../lib/reservations/abuse-guard.ts", import.meta.url),
    "utf8",
  );
  const availabilitySource = readFileSync(
    new URL("../lib/reservations/availability.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    guardSource,
    /export \{ pendingWindowStart \} from "\.\/deposit-expiry"/,
  );
  assert.match(availabilitySource, /pendingWindowStart\(now\.getTime\(\)\)/);
  assert.doesNotMatch(availabilitySource, /depositHours/);
});
