import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import * as rules from "../lib/admin/reservation-rules.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
// Exercise the actual server modules with isolated session/DB adapters; no live data.
function loadModule(file, adapters) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}
const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-11-04T03:00:00Z");
const row = {
  status: "pending_payment",
  payment_method: "bank_transfer",
  starts_at: "2026-11-05T03:00:00Z",
  ends_at: "2026-11-05T03:30:00Z",
  updated_at: "2026-11-04T01:00:00+00:00",
};

test("Korean date boundaries include the entire end date", () => {
  assert.equal(rules.dayStart("2026-11-04"), "2026-11-03T15:00:00.000Z");
  assert.equal(rules.dayEndExclusive("2026-11-04"), "2026-11-04T15:00:00.000Z");
  assert.equal(rules.koreanDay(new Date("2026-11-03T15:00:00Z")), "2026-11-04");
  assert.equal(rules.koreanDay(new Date("2026-11-03T14:59:59Z")), "2026-11-03");
});
test("invalid filters and unsafe return links are rejected", () => {
  for (const search of [
    { status: "__proto__" },
    { status: "unknown" },
    { from: "2026-02-30" },
    { from: "2026-11-05", to: "2026-11-04" },
    { page: "0" },
    { page: "1.5" },
    { page: ["1", "2"] },
    { counselor: "bad" },
    { exclude_cancelled: "true" },
  ])
    assert.equal(rules.parseFilters(search), null);
  const filters = rules.parseFilters({
    status: "confirmed",
    from: "2026-11-04",
    counselor: id,
    page: "2",
  });
  assert.equal(filters.page, 2);
  assert.equal(
    rules.safeReturn(rules.listUrl(filters)),
    rules.listUrl(filters),
  );
  for (const value of [
    "https://evil.example/admin/reservations",
    "//evil.example/admin/reservations",
    "/admin/reservations?status=bad",
    "/admin/reservations?page=1&page=2",
  ])
    assert.equal(rules.safeReturn(value), "/admin/reservations");
});
test("only allowed state transitions pass, with server time constraints", () => {
  for (const status of Object.keys(rules.statusLabels))
    for (const action of ["confirm", "complete", "cancel", "invalid"]) {
      const current = { ...row, status, ends_at: now.toISOString() };
      const allowed =
        (status === "pending_payment" &&
          ["confirm", "cancel"].includes(action)) ||
        (status === "confirmed" && ["complete", "cancel"].includes(action));
      assert.equal(
        Boolean(rules.transitionPatch(current, action, "사유", now).patch),
        allowed,
        `${status}/${action}`,
      );
    }
  assert.ok(
    rules.transitionPatch(
      { ...row, starts_at: now.toISOString() },
      "confirm",
      "",
      now,
    ).error,
  );
  assert.ok(
    rules.transitionPatch(
      { ...row, payment_method: "card" },
      "confirm",
      "",
      now,
    ).error,
  );
  assert.ok(
    rules.transitionPatch({ ...row, status: "confirmed" }, "complete", "", now)
      .error,
  );
  assert.ok(
    rules.transitionPatch(
      { ...row, status: "confirmed", ends_at: now.toISOString() },
      "complete",
      "",
      now,
    ).patch,
  );
});
test("cancellation reasons are trimmed and limited", () => {
  for (const reason of ["", "  ", "가".repeat(501)])
    assert.ok(rules.transitionPatch(row, "cancel", reason, now).error);
  assert.equal(
    rules.transitionPatch(row, "cancel", "  고객 요청  ", now).patch
      .cancel_reason,
    "고객 요청",
  );
  assert.ok(rules.transitionPatch(row, "cancel", "가".repeat(500), now).patch);
});

function actionHarness({
  admin = {},
  stored = row,
  updateRows = [{ id }],
  error = null,
} = {}) {
  let clientCalls = 0;
  const conditions = [],
    invalidations = [],
    updates = [];
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
      updates.push(patch);
      return this;
    },
    then(resolve) {
      return Promise.resolve({ data: updateRows, error }).then(resolve);
    },
  };
  const actionModule = loadModule("../lib/admin/reservation-actions.ts", {
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "./auth": { requireAdmin: async () => admin },
    "@/lib/supabase/server": {
      createClient: async () => {
        clientCalls++;
        return { from: () => query };
      },
    },
    "./reservation-rules": rules,
  });
  const form = new FormData();
  form.set("id", id);
  form.set("action", "cancel");
  form.set("version", row.updated_at);
  form.set("reason", " 고객 요청 ");
  return {
    run: () => actionModule.changeReservation({}, form),
    form,
    conditions,
    invalidations,
    updates,
    clientCalls: () => clientCalls,
  };
}
test("non-admin action never accesses reservation data", async () => {
  const h = actionHarness({ admin: null });
  assert.equal((await h.run()).success, false);
  assert.equal(h.clientCalls(), 0);
});
test("malformed action input stops before DB access", async () => {
  for (const [key, value] of [
    ["id", "bad"],
    ["action", "delete"],
    ["version", "bad"],
  ]) {
    const h = actionHarness();
    h.form.set(key, value);
    assert.equal((await h.run()).success, false);
    assert.equal(h.clientCalls(), 0);
  }
});
test("stale browser versions and zero-row concurrent updates fail", async () => {
  const stale = actionHarness({
    stored: { ...row, updated_at: "2026-11-04T02:00:00Z" },
  });
  assert.equal((await stale.run()).message, rules.conflictMessage);
  assert.equal(stale.updates.length, 0);
  const concurrent = actionHarness({ updateRows: [] });
  assert.equal((await concurrent.run()).message, rules.conflictMessage);
  assert.equal(concurrent.invalidations.length, 0);
});
test("successful mutation writes only allowed fields and refreshes all views", async () => {
  const h = actionHarness();
  h.form.set("price", "1");
  h.form.set("customer_name", "injected");
  assert.equal((await h.run()).success, true);
  assert.deepEqual(Object.keys(h.updates[0]).sort(), [
    "cancel_reason",
    "cancelled_at",
    "status",
  ]);
  assert.equal(h.updates[0].cancel_reason, "고객 요청");
  assert.ok(
    h.conditions.some((c) => c[0] === "updated_at" && c[1] === row.updated_at),
  );
  assert.ok(h.conditions.some((c) => c[0] === "status" && c[1] === row.status));
  assert.deepEqual(h.invalidations, [
    "/admin",
    "/admin/reservations",
    `/admin/reservations/${id}`,
  ]);
});
test("database errors are sanitized and missing reservations are distinct", async () => {
  assert.equal(
    (
      await actionHarness({ error: { message: "secret customer data" } }).run()
    ).message.includes("secret"),
    false,
  );
  assert.equal((await actionHarness({ stored: null }).run()).success, false);
});
test("data access functions stop on null admin", async () => {
  const adapters = {
    "server-only": {},
    "./auth": { requireAdmin: async () => null },
    "@/lib/supabase/server": {
      createClient: () => {
        throw new Error("must not access DB");
      },
    },
    "./reservation-rules": rules,
    "./reservations": {},
  };
  const reservations = loadModule("../lib/admin/reservations.ts", adapters);
  assert.equal(
    await reservations.getReservationList(rules.parseFilters({})),
    null,
  );
  assert.equal(await reservations.getReservationDetail(id), null);
  const dashboard = loadModule("../lib/admin/dashboard.ts", adapters);
  assert.equal(await dashboard.getDashboard(), null);
});

function queryHarness(responses) {
  const calls = [];
  const db = {
    from(table) {
      const index = calls.length;
      const steps = [["from", table]];
      calls.push(steps);
      const query = {};
      for (const method of [
        "select",
        "eq",
        "neq",
        "gte",
        "gt",
        "lt",
        "order",
        "range",
        "limit",
        "returns",
      ])
        query[method] = (...args) => {
          steps.push([method, ...args]);
          return query;
        };
      query.then = (resolve) => Promise.resolve(responses[index]).then(resolve);
      query.maybeSingle = async () => responses[index];
      return query;
    },
  };
  const adapters = {
    "server-only": {},
    "./auth": { requireAdmin: async () => ({}) },
    "@/lib/supabase/server": { createClient: async () => db },
    "./reservation-rules": rules,
    "./reservations": {
      summaryColumns:
        "id,reservation_no,starts_at,customer_name,status,product_name,price,counselors(name)",
    },
  };
  return {
    calls,
    reservations: loadModule("../lib/admin/reservations.ts", adapters),
    dashboard: loadModule("../lib/admin/dashboard.ts", adapters),
  };
}
test("list queries use snapshots, date bounds, stable order and server pagination", async () => {
  const h = queryHarness([
    { data: [{ id, name: "상담사" }], error: null },
    { data: [], error: null, count: 25 },
  ]);
  const result = await h.reservations.getReservationList(
    rules.parseFilters({
      status: "confirmed",
      from: "2026-11-04",
      to: "2026-11-04",
      counselor: id,
      page: "2",
    }),
  );
  assert.equal(result.count, 25);
  const steps = h.calls[1];
  assert.ok(steps.some((s) => s[0] === "range" && s[1] === 20 && s[2] === 39));
  assert.ok(
    steps.some((s) => s[0] === "gte" && s[2] === "2026-11-03T15:00:00.000Z"),
  );
  assert.ok(
    steps.some((s) => s[0] === "lt" && s[2] === "2026-11-04T15:00:00.000Z"),
  );
  assert.deepEqual(
    steps.filter((s) => s[0] === "order").map((s) => s[1]),
    ["starts_at", "id"],
  );
  assert.match(steps.find((s) => s[0] === "select")[1], /product_name,price/);
});
test("unknown counselors, empty data, missing detail and query errors are distinct", async () => {
  const unknown = queryHarness([{ data: [], error: null }]);
  assert.equal(
    (
      await unknown.reservations.getReservationList(
        rules.parseFilters({ counselor: id }),
      )
    ).invalid,
    true,
  );
  assert.equal(unknown.calls.length, 1);
  const empty = queryHarness([
    { data: [], error: null },
    { data: [], count: 0, error: null },
  ]);
  assert.equal(
    (await empty.reservations.getReservationList(rules.parseFilters({}))).count,
    0,
  );
  const failed = queryHarness([
    { data: [], error: null },
    { data: null, count: null, error: {} },
  ]);
  await assert.rejects(
    () => failed.reservations.getReservationList(rules.parseFilters({})),
    /예약 목록/,
  );
  const detail = queryHarness([{ data: null, error: null }]);
  assert.equal(await detail.reservations.getReservationDetail("invalid"), null);
  assert.equal(detail.calls.length, 0);
  assert.equal(await detail.reservations.getReservationDetail(id), null);
});
test("dashboard never queries inquiries, limits summaries and surfaces count errors", async () => {
  const responses = [
    { count: 2, error: null },
    { count: 3, error: null },
    { data: [], error: null },
    { data: [], error: null },
  ];
  const h = queryHarness(responses);
  const data = await h.dashboard.getDashboard();
  assert.equal(data.daily, 2);
  assert.equal(data.pending, 3);
  assert.ok(h.calls.every((c) => c[0][1] === "reservations"));
  assert.ok(h.calls[0].some((s) => s[0] === "neq" && s[2] === "cancelled"));
  assert.ok(h.calls[2].some((s) => s[0] === "limit" && s[1] === 5));
  assert.ok(h.calls[3].some((s) => s[0] === "limit" && s[1] === 5));
  const failed = queryHarness([
    { count: null, error: {} },
    ...responses.slice(1),
  ]);
  await assert.rejects(() => failed.dashboard.getDashboard(), /대시보드/);
});
