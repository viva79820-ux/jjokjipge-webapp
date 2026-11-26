// SQL 변경 범위와 회원 본인 조회 불변 조건을 검사한다. 실행은 model 파일이 담당한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const migration = read(
  "../supabase/migrations/20261126093000_member_order_select.sql",
);
const preflight = read("../supabase/tests/member_order_select_preflight.sql");
const rollback = read("../supabase/tests/member_order_select_rollback.sql");
const original = read(
  "../supabase/migrations/20261125004138_orders_schema.sql",
);

test("회원 본인 SELECT 정책만 추가하고 쓰기·보안 정의자 권한은 넓히지 않는다", () => {
  assert.match(migration, /create policy orders_select_own/);
  assert.match(migration, /create policy order_items_select_own/);
  assert.match(
    migration,
    /create policy orders_select_own[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(user_id = \(select auth\.uid\(\)\)\)/,
  );
  assert.match(migration, /member_order\.user_id = \(select auth\.uid\(\)\)/);
  assert.equal((migration.match(/create policy /g) ?? []).length, 2);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /\bgrant\b/i);
  assert.doesNotMatch(migration, /for (?:insert|update|delete|all)\b/i);
  assert.doesNotMatch(original, /orders_select_own|order_items_select_own/);
});

test("사전 검사는 기존 주문 구조와 정책 충돌만 확인하고 데이터를 바꾸지 않는다", () => {
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /MEMBER_ORDER_SELECT_PREFLIGHT_OK/);
  assert.match(preflight, /MEMBER_ORDER_SELECT_PREFLIGHT_CONFLICT/);
  assert.match(preflight, /orders_user_created_idx/);
  assert.match(preflight, /orders_select_admin/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:public|auth|storage)\./i,
  );
});

test("롤백은 회원 조회 정책만 지우고 주문 데이터와 관리자 정책은 남긴다", () => {
  assert.match(rollback, /drop policy orders_select_own on public\.orders/);
  assert.match(
    rollback,
    /drop policy order_items_select_own on public\.order_items/,
  );
  assert.match(rollback, /MEMBER_ORDER_SELECT_ROLLBACK_OK/);
  assert.match(rollback, /orders_select_admin/);
  assert.doesNotMatch(rollback, /drop table/i);
  assert.doesNotMatch(rollback, /delete\s+from\s+public\.orders/i);
  assert.match(rollback, /\bcommit\s*;/i);
});
