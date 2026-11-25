// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL CHECK 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261123031448_class_poster_schema.sql";
const preflightFile = "../supabase/tests/class_poster_preflight.sql";
const rollbackFile = "../supabase/tests/class_poster_rollback_check.sql";
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

test("사전 검사는 포스터 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /alter table public\.classes/);
  assert.match(migration, /add column poster_path text/);
  assert.match(migration, /add column poster_alt text/);
  assert.match(
    migration,
    /\^classes\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\\\.\(jpg\|jpeg\|png\|webp\)\$/,
  );
  assert.match(migration, /char_length\(poster_alt\) <= 200/);
  assert.match(
    migration,
    /check \(poster_path is null or poster_alt is not null\)/,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\./i,
  );
  assert.doesNotMatch(migration, /\bstorage\./i);
  assert.doesNotMatch(migration, /\b(?:video_url|is_published)\b/i);
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
  assert.match(preflight, /CLASS_POSTER_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /CLASS_POSTER_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});

test("사전 검사는 기존 행·NULL 허용·경로 거부와 Storage 보존을 고정한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.match(preflight, /기존 클래스 포스터 NULL 유지/);
  assert.match(preflight, /포스터 없는 클래스 등록 허용/);
  assert.match(preflight, /포스터 없는 클래스 편집 허용/);
  assert.match(preflight, /클래스 포스터 경로 거부/);
  assert.match(preflight, /classes\/를 포함하는 기존 Storage 관리자 정책/);
  assert.match(preflight, /public_images_bucket/);
  assert.match(preflight, /storage_objects/);
  assert.match(preflight, /storage_object_policies/);
  assert.match(rollback, /포스터 열 또는 제약 잔존/);
  assert.match(rollback, /검사 클래스 행 잔존/);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+storage\.(?:buckets|objects)\b/i,
  );
  assert.doesNotMatch(
    rollback,
    /\b(?:insert\s+into|update|delete\s+from)\s+storage\.(?:buckets|objects)\b/i,
  );
});
