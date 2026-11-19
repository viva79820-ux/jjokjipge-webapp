// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL CHECK·RLS 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261119010000_shop_products_schema.sql";
const preflightFile = "../supabase/tests/shop_products_preflight.sql";
const rollbackFile = "../supabase/tests/shop_products_rollback_check.sql";
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
];

test("기존 마이그레이션은 origin/main과 동일하다", () => {
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

test("사전 검사는 상품 마이그레이션 전체를 그대로 포함한다", () => {
  const migration = read(migrationFile).trimEnd();
  const preflight = read(preflightFile);

  assert.equal(
    between(
      preflight,
      "-- BEGIN EXACT MIGRATION\n",
      "\n-- END EXACT MIGRATION",
    ),
    migration,
  );
  assert.match(migration, /create table public\.products/);
  assert.match(migration, /private\.set_updated_at\(\)/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.doesNotMatch(
    migration,
    /\bcreate\s+(?:table|index|trigger|policy|function)\s+if\s+not\s+exists\b/i,
  );
  assert.doesNotMatch(migration, /create or replace/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /-- pg-delta: transaction=false/i);
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\./i,
  );
  assert.doesNotMatch(migration, /\bstorage\./i);
  assert.doesNotMatch(
    migration,
    /\b(?:orders|order_items|stock|inventory|sku|shipping|option)\b/i,
  );
});

test("롤백 확인은 동일 snapshot과 null baseline을 유지한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /SHOP_PRODUCTS_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /SHOP_PRODUCTS_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});

test("검사는 계정·profile·Storage 객체를 변경하지 않는다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /existing_user/);
  assert.match(preflight, /profileless/);
  assert.match(preflight, /실제 일반 회원 로그인·Auth 세션 검증 아님/);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles|storage\.(?:buckets|objects))\b/i,
  );
  assert.doesNotMatch(
    rollback,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles|storage\.(?:buckets|objects))\b/i,
  );
});

test("단일 상품 제약·정렬·RLS·최소 권한 검사가 고정되어 있다", () => {
  const migration = read(migrationFile);
  const preflight = read(preflightFile);

  assert.match(migration, /price numeric not null/);
  assert.match(migration, /price >= 1/);
  assert.match(migration, /price <= 2147483647/);
  assert.match(migration, /price = trunc\(price\)/);
  assert.match(migration, /is_published boolean not null default false/);
  assert.match(migration, /is_sold_out boolean not null default false/);
  assert.match(
    migration,
    /\^products\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\\\.\(jpg\|jpeg\|png\|webp\)\$/,
  );
  assert.match(
    migration,
    /on public\.products \(is_published, sort_order, created_at desc, id desc\)/i,
  );
  assert.equal(
    (migration.match(/for update to authenticated/g) ?? []).length,
    1,
  );
  assert.match(
    migration,
    /using \(\(select private\.is_admin\(\)\)\)\s+with check \(\(select private\.is_admin\(\)\)\)/,
  );
  assert.match(
    migration,
    /revoke all on public\.products\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(preflight, /values \('상품', '설명', 1\.5\)/);
  assert.match(preflight, /공개와 품절 네 조합 독립 저장/);
  assert.match(preflight, /'TRUNCATE'/);
  assert.match(preflight, /기존 10개 업무 테이블/);
  assert.match(preflight, /products\/를 포함하는 기존 Storage 관리자 정책/);
  assert.match(preflight, /후속 주문 차단 미검증/);
});
