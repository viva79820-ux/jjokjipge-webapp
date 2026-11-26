import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261125032020_review_write_policies.sql";
const preflightFile = "../supabase/tests/review_write_preflight.sql";
const rollbackFile = "../supabase/tests/review_write_rollback_check.sql";

test("사전 검사는 작성 정책 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(
      read(rollbackFile),
      "-- BEGIN EXACT SNAPSHOT\n",
      "\n-- END EXACT SNAPSHOT",
    ),
  );
});

test("완료된 본인 예약만 쓰고 상품 후기 열은 그대로 둔다", () => {
  const migration = read(migrationFile);
  assert.match(migration, /publish_consent boolean/);
  assert.match(migration, /hidden_by_admin boolean not null default false/);
  assert.match(migration, /reservation\.status = 'completed'/);
  assert.match(migration, /reservation\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /product_id is null/);
  assert.match(migration, /create policy reviews_insert_own_completed/);
  assert.match(migration, /create policy reviews_update_own/);
  assert.match(migration, /create policy reviews_delete_own/);
  assert.match(
    migration,
    /grant execute on function public\.list_my_reviews\(\)/,
  );
  assert.doesNotMatch(migration, /grant insert \([\s\S]*product_id/);
  assert.doesNotMatch(migration, /drop column product_id/);
  assert.doesNotMatch(
    migration,
    /^\s*(?:insert into|delete from) public\.reviews\b/im,
  );
});

test("사전 검사는 자격 없는 예약·타인 예약·비회원 예약·중복 작성을 거부한다", () => {
  const preflight = read(preflightFile);
  for (const label of [
    "자격 없는 확정 예약 거부",
    "자격 없는 입금 대기 예약 거부",
    "자격 없는 취소 예약 거부",
    "타인 예약 거부",
    "비회원 예약 거부",
    "같은 예약 중복 작성 거부",
    "관리자 숨김은 회원 목록에 숨김으로 남음",
    "관리자 ID는 역할 전환 전에 임시 actor 테이블에 보관한다",
  ]) {
    assert.match(preflight, new RegExp(label));
  }
  assert.match(rollbackFileContent(rollbackFile), /baseline jsonb := null/);
});

function rollbackFileContent(file) {
  return read(file);
}
