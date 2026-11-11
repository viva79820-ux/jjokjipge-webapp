// SQL 본문 동기화만 검사한다. SQLSTATE/RLS/CHECK의 실행 검증을 대체하지 않는다.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261111010000_counselors_admin_schema.sql";
const earlierMigrations = [
  "../supabase/migrations/20261102035714_reservations_schema.sql",
  "../supabase/migrations/20261102035715_seed_dummy.sql",
  "../supabase/migrations/20261105010000_customer_support_schema.sql",
  "../supabase/migrations/20261105010001_seed_faq_examples.sql",
  "../supabase/migrations/20261109010000_notices_schema.sql",
  "../supabase/migrations/20261110010000_notices_popup_setting.sql",
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

test("preflight embeds the counselors admin migration unchanged", () => {
  const migration = read(migrationFile).trimEnd();
  const preflight = read("../supabase/tests/counselors_admin_preflight.sql");
  assert.equal(
    between(
      preflight,
      "-- BEGIN EXACT MIGRATION\n",
      "\n-- END EXACT MIGRATION",
    ),
    migration,
  );
  assert.doesNotMatch(migration, /가연|legacy\.jpg|storage\.|commit\s*;/i);
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles|public\.reservations|public\.consult_products)\b/i,
  );
});

test("rollback repeats the preflight snapshot and keeps a null baseline", () => {
  const preflight = read("../supabase/tests/counselors_admin_preflight.sql");
  const rollback = read(
    "../supabase/tests/counselors_admin_rollback_check.sql",
  );
  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /COUNSELORS_ADMIN_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /COUNSELORS_ADMIN_ROLLBACK_OK/);
  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /auth\.uid\(\) = \(/);
  assert.match(preflight, /not \(select private\.is_admin\(\)\)/);
  assert.match(preflight, /gen_random_uuid\(\)/);
  assert.match(
    preflight,
    /기존 일반 회원 ID를 사용한 DB 역할\/RLS 검사\(실제 로그인 검증 아님\)/,
  );
  assert.match(
    preflight,
    /프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사\(실제 일반 회원 로그인·Auth 세션 검증 아님\)/,
  );
  assert.match(
    preflight,
    /실제 Storage API·파일 존재·MIME·크기·실제 로그인 미검증/,
  );
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.doesNotMatch(preflight, /\bstorage\./i);
  assert.doesNotMatch(rollback, /\bstorage\./i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles)\b/i,
  );
  assert.doesNotMatch(preflight, /가연/);
  assert.doesNotMatch(rollback, /가연/);
});
