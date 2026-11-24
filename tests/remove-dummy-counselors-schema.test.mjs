// SQL 본문 동기화와 삭제 안전장치만 검사한다. 실제 운영 DB 사전 점검을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261123024258_remove_dummy_counselors.sql";
const preflightFile = "../supabase/tests/remove_dummy_counselors_preflight.sql";
const rollbackFile =
  "../supabase/tests/remove_dummy_counselors_rollback_check.sql";

test("기존 더미 시드는 origin/main과 같고 삭제 마이그레이션만 추가한다", () => {
  const relative = "supabase/migrations/20261102035715_seed_dummy.sql";
  assert.equal(
    read(`../${relative}`),
    execFileSync("git", ["show", `origin/main:${relative}`], {
      encoding: "utf8",
    }).replaceAll("\r\n", "\n"),
  );
});

test("사전 점검은 삭제 마이그레이션 원문을 그대로 실행한다", () => {
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
});

test("slug와 이름 6쌍 및 시드 상담상품 12개만 대상으로 삼는다", () => {
  const migration = read(migrationFile);

  for (const [slug, name] of [
    ["a", "상담사 A"],
    ["b", "상담사 B"],
    ["c", "상담사 C"],
    ["d", "상담사 D"],
    ["e", "상담사 E"],
    ["f", "상담사 F"],
  ]) {
    assert.match(migration, new RegExp(`\\('${slug}', '${name}'\\)`));
  }

  assert.equal(
    [
      ...migration.matchAll(
        /\('[a-f]', '(?:타로|사주) 상담 (?:20|30)분', (?:20|30), [01]\)/g,
      ),
    ].length,
    12,
  );
  assert.match(migration, /matched_counselor_count not in \(0, 6\)/);
  assert.match(migration, /actual\.row_count <> 1/);
  assert.doesNotMatch(migration, /actual\.price = expected\.price/);
  assert.doesNotMatch(migration, /구정미|가연/);
});

test("예약 참조 검사와 잠금이 삭제보다 먼저 실행된다", () => {
  const migration = read(migrationFile);
  const reservationCheck = migration.indexOf(
    "REMOVE_DUMMY_COUNSELORS_RESERVATIONS_FOUND",
  );
  const deletion = migration.indexOf("delete from public.counselors");

  assert.match(
    migration,
    /lock table\s+public\.reservations,\s+public\.consult_products,\s+public\.counselors\s+in share row exclusive mode;/i,
  );
  assert.match(migration, /counselor_reference_count/);
  assert.match(migration, /product_reference_count/);
  assert.match(migration, /reservation_reference_count/);
  assert.ok(reservationCheck >= 0 && reservationCheck < deletion);
  assert.doesNotMatch(
    migration,
    /(?:delete\s+from|update)\s+public\.reservations/i,
  );
  assert.doesNotMatch(migration, /delete\s+from\s+public\.consult_products/i);
});

test("비대상 행 보존과 트랜잭션 롤백 확인 형식이 고정된다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /remove-dummy-counselors-preflight-v1/);
  assert.match(preflight, /REMOVE_DUMMY_COUNSELORS_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /REMOVE_DUMMY_COUNSELORS_ROLLBACK_OK/);
  assert.match(preflight, /other_counselors/);
  assert.match(preflight, /other_products/);
  assert.match(preflight, /reservations_rows/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.doesNotMatch(preflight, /\bstorage\./i);
  assert.doesNotMatch(rollback, /\bstorage\./i);
});
