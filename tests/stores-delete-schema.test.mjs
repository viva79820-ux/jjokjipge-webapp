// SQL 본문 동기화와 변경 범위만 검사한다. 실제 PostgreSQL FK·RLS 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261113010000_stores_delete_restrict.sql";
const earlierMigrations = [
  "../supabase/migrations/20261102035714_reservations_schema.sql",
  "../supabase/migrations/20261102035715_seed_dummy.sql",
  "../supabase/migrations/20261105010000_customer_support_schema.sql",
  "../supabase/migrations/20261105010001_seed_faq_examples.sql",
  "../supabase/migrations/20261109010000_notices_schema.sql",
  "../supabase/migrations/20261110010000_notices_popup_setting.sql",
  "../supabase/migrations/20261111010000_counselors_admin_schema.sql",
];

test("earlier migrations stay identical to origin/main", () => {
  for (const file of earlierMigrations) {
    const relative = file.replace("../", "");
    assert.equal(
      read(file),
      execFileSync("git", ["show", `origin/main:${relative}`], {
        encoding: "utf8",
      }).replaceAll("\r\n", "\n"),
    );
  }
});

test("preflight embeds the stores delete migration unchanged", () => {
  const migration = read(migrationFile).trimEnd();
  const preflight = read("../supabase/tests/stores_delete_preflight.sql");
  assert.equal(
    between(
      preflight,
      "-- BEGIN EXACT MIGRATION\n",
      "\n-- END EXACT MIGRATION",
    ),
    migration,
  );
  assert.match(migration, /confdeltype <> 'n'/);
  assert.match(migration, /confdeltype = 'r'/);
  assert.match(migration, /on delete restrict/i);
  assert.match(migration, /counselors_store_id_fkey/);
  assert.match(migration, /store_id_attnum/);
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i,
  );
  assert.doesNotMatch(migration, /\b(?:grant|revoke|policy|trigger)\b/i);
  assert.doesNotMatch(migration, /\bstorage\./i);
});

test("rollback repeats the snapshot and keeps a null baseline", () => {
  const preflight = read("../supabase/tests/stores_delete_preflight.sql");
  const rollback = read("../supabase/tests/stores_delete_rollback_check.sql");
  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /stores-delete-preflight-v1/);
  assert.match(preflight, /STORES_DELETE_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /STORES_DELETE_ROLLBACK_OK/);
  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /실제 다중 연결 경쟁 재현은 아님/);
  assert.match(preflight, /실제 Supabase·Storage API·실제 로그인 미검증/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.doesNotMatch(preflight, /\bstorage\./i);
  assert.doesNotMatch(rollback, /\bstorage\./i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles|public\.reservations)\b/i,
  );
});
