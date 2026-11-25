// SQL 변경 범위와 보안 불변 조건을 검사한다. 실제 SQL 실행은 model 파일이 담당한다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const migrationFile = "../supabase/migrations/20261125004138_orders_schema.sql";
const preflightFile = "../supabase/tests/orders_schema_preflight.sql";
const rollbackFile = "../supabase/tests/orders_schema_rollback.sql";
const earlierMigrations = [
  "supabase/migrations/20261102035714_reservations_schema.sql",
  "supabase/migrations/20261102035715_seed_dummy.sql",
  "supabase/migrations/20261105010000_customer_support_schema.sql",
  "supabase/migrations/20261105010001_seed_faq_examples.sql",
  "supabase/migrations/20261109010000_notices_schema.sql",
  "supabase/migrations/20261110010000_notices_popup_setting.sql",
  "supabase/migrations/20261111010000_counselors_admin_schema.sql",
  "supabase/migrations/20261113010000_stores_delete_restrict.sql",
  "supabase/migrations/20261118010000_classes_contents_schema.sql",
  "supabase/migrations/20261119010000_shop_products_schema.sql",
];

test("모든 선행 마이그레이션은 origin/main과 동일하다", () => {
  for (const file of earlierMigrations) {
    assert.equal(
      read(`../${file}`),
      execFileSync("git", ["show", `origin/main:${file}`], {
        encoding: "utf8",
      }).replaceAll("\r\n", "\n"),
      file,
    );
  }
});

test("주문·주문항목은 금액 스냅샷과 다섯 상태를 고정한다", () => {
  const migration = read(migrationFile);
  assert.match(migration, /create table public\.orders/);
  assert.match(migration, /create table public\.order_items/);
  assert.match(migration, /order_no text unique not null/);
  assert.match(migration, /request_key uuid unique not null/);
  assert.match(migration, /user_id uuid references auth\.users/);
  for (const column of [
    "customer_name",
    "customer_phone",
    "customer_email",
    "postal_code",
    "address_line1",
    "subtotal",
    "shipping_fee",
    "total",
    "product_name",
    "unit_price",
    "quantity",
  ])
    assert.match(migration, new RegExp(`\\b${column}\\b`), column);
  for (const status of [
    "pending_payment",
    "payment_confirmed",
    "shipping",
    "completed",
    "cancelled",
  ])
    assert.match(migration, new RegExp(`'${status}'`), status);
  assert.match(
    migration,
    /line_total numeric generated always as \(unit_price \* quantity\) stored/,
  );
  assert.match(migration, /total = subtotal \+ shipping_fee/);
});

test("서버 전용 RPC가 상품 상태·DB 가격·멱등 키를 원자적으로 처리한다", () => {
  const migration = read(migrationFile);
  assert.match(migration, /create function private\.create_shop_order/);
  assert.match(migration, /for share;/);
  assert.match(migration, /where p\.is_published\s+and not p\.is_sold_out/);
  assert.match(migration, /sum\(p\.price \* \(item->>'quantity'\)::integer\)/);
  assert.match(migration, /ORDER_PRODUCT_SOLD_OUT/);
  assert.match(migration, /ORDER_PRODUCT_UNAVAILABLE/);
  assert.match(migration, /ORDER_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /exception when unique_violation/);
  assert.match(migration, /private\.order_request_matches/);
  assert.doesNotMatch(
    migration,
    /p_(?:price|unit_price|subtotal|total|product_name)\b/,
  );

  const publicFunction = migration
    .split("create function public.create_shop_order")[1]
    .split("create trigger orders_set_order_no")[0];
  assert.doesNotMatch(publicFunction, /security definer/i);
  assert.match(publicFunction, /from private\.create_shop_order/);
});

test("고객 직접 접근은 막고 관리자는 조회와 상태 열만 변경한다", () => {
  const migration = read(migrationFile);
  assert.match(
    migration,
    /alter table public\.orders enable row level security/,
  );
  assert.match(
    migration,
    /alter table public\.order_items enable row level security/,
  );
  assert.match(
    migration,
    /alter table private\.order_counters enable row level security/,
  );
  assert.equal((migration.match(/create policy /g) ?? []).length, 3);
  assert.match(migration, /create policy orders_select_admin/);
  assert.match(migration, /create policy orders_update_status_admin/);
  assert.match(migration, /create policy order_items_select_admin/);
  assert.doesNotMatch(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /for insert to (?:anon|authenticated)/);
  assert.match(
    migration,
    /grant select on public\.orders, public\.order_items to authenticated/,
  );
  assert.match(
    migration,
    /grant update \(status\) on public\.orders to authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_shop_order[\s\S]*to service_role/,
  );
});

test("사전 검사는 충돌·상품 구조·RLS를 확인하고 의도된 예외로 끝난다", () => {
  const preflight = read(preflightFile);
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /ORDERS_PREFLIGHT_OK/);
  assert.match(preflight, /public\.products RLS 비활성/);
  assert.match(preflight, /products_price_check/);
  assert.match(preflight, /is_published/);
  assert.match(preflight, /is_sold_out/);
  assert.match(preflight, /private\.is_admin\(\)/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:public|auth|storage)\./i,
  );
});

test("롤백은 주문이 비었을 때만 주문 객체를 제거하고 상품은 보존한다", () => {
  const rollback = read(rollbackFile);
  assert.match(rollback, /ORDERS_ROLLBACK_REFUSED/);
  assert.match(rollback, /exists \(select 1 from public\.orders\)/);
  assert.match(rollback, /drop table public\.order_items/);
  assert.match(rollback, /drop table public\.orders/);
  assert.match(rollback, /drop table private\.order_counters/);
  assert.match(rollback, /to_regclass\('public\.products'\) is null/);
  assert.match(rollback, /ORDERS_ROLLBACK_OK/);
  assert.match(rollback, /\ncommit;\n/);
});
