import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const memberId = "22222222-2222-4222-8222-222222222222";

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
    async returns() {
      calls.push(["returns"]);
      return response;
    },
  };
  const reservationsModule = load("../lib/member-auth/reservations.ts", {
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
  return { ...reservationsModule, calls };
}

test("member reservations select only display fields and filter by session member id", async () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    reservation_no: "R-20261125-0001",
    status: "confirmed",
    starts_at: "2026-11-25T03:00:00.000Z",
    ends_at: "2026-11-25T03:30:00.000Z",
    product_name: "테스트 상담",
    counselors: { name: "상담사 A" },
  };
  const h = harness({ data: [row], error: null });

  assert.deepEqual(await h.getMemberReservations(memberId), [row]);
  assert.deepEqual(h.calls, [
    ["from", "reservations"],
    [
      "select",
      "id,reservation_no,status,starts_at,ends_at,product_name,counselors(name)",
    ],
    ["eq", "user_id", memberId],
    ["order", "starts_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["returns"],
  ]);
});

test("member reservation failures stay generic", async () => {
  const h = harness({
    data: null,
    error: { code: "42501", details: "private" },
  });
  await assert.rejects(
    () => h.getMemberReservations(memberId),
    /회원 예약 내역을 불러오지 못했습니다/,
  );
});

test("mypage renders status, schedule, counselor, product and an empty state", () => {
  const page = readFileSync(
    new URL("../app/(site)/mypage/page.tsx", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL(
      "../components/member-auth/reservation-history.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const data = readFileSync(
    new URL("../lib/member-auth/reservations.ts", import.meta.url),
    "utf8",
  );
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20261102035714_reservations_schema.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(page, /getMemberReservations\(member\.id\)/);
  assert.match(page, /회원 계정으로 예약한 내역만 보여요/);
  assert.match(component, /예약·상담 내역/);
  assert.match(component, /StatusBadge/);
  assert.match(component, /상담사/);
  assert.match(component, /상담 상품/);
  assert.match(component, /상담 일시/);
  assert.match(component, /회원 계정으로 예약한 내역이 없어요/);
  assert.doesNotMatch(data, /createAdminClient|SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(
    data,
    /customer_(?:name|phone|email)|depositor_name|cancel_reason/,
  );
  assert.match(
    migration,
    /create policy reservations_select_own_or_admin on public\.reservations for select to authenticated using \(user_id = \(select auth\.uid\(\)\) or \(select private\.is_admin\(\)\)\);/,
  );
});
