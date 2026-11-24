// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL CHECK 실행 검증은 model 파일이 담당한다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];
const executableSql = (source) =>
  source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const migrationFile =
  "../supabase/migrations/20261124030951_contents_thumbnail_fields.sql";
const preflightFile = "../supabase/tests/contents_thumbnail_preflight.sql";
const rollbackFile = "../supabase/tests/contents_thumbnail_rollback_check.sql";
const modelFile = "./contents-thumbnail-schema.model.mjs";
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
  "supabase/migrations/20261123024258_remove_dummy_counselors.sql",
  "supabase/migrations/20261123031448_class_poster_schema.sql",
  "supabase/migrations/20261124003530_add_class_delivery_mode.sql",
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

test("사전 검사는 콘텐츠 썸네일 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /add column thumbnail_path text/);
  assert.match(migration, /add column thumbnail_alt text/);
  assert.match(migration, /add column posted_on date/);
  assert.match(
    migration,
    /\^contents\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\\\.\(jpg\|jpeg\|png\|webp\)\$/,
  );
  assert.match(migration, /char_length\(thumbnail_alt\) <= 200/);
  assert.match(
    migration,
    /check \(thumbnail_path is null or thumbnail_alt is not null\)/,
  );
});

test("기존 정렬 인덱스를 정확히 확인한 뒤 같은 이름의 새 인덱스로 교체한다", () => {
  const migration = read(migrationFile);

  assert.match(
    migration,
    /contents_published_sort_idx ON public\.contents USING btree \(is_published, sort_order, created_at DESC, id DESC\)/,
  );
  assert.match(migration, /drop index public\.contents_published_sort_idx;/);
  assert.match(
    migration,
    /create index contents_published_sort_idx\s+on public\.contents \(\s*is_published,\s*sort_order asc,\s*posted_on desc nulls last,\s*id desc\s*\);/i,
  );
  assert.ok(
    migration.indexOf("drop index public.contents_published_sort_idx;") <
      migration.indexOf("create index contents_published_sort_idx"),
  );
  assert.doesNotMatch(migration, /create index concurrently/i);
  assert.doesNotMatch(
    migration,
    /\b(?:drop|create)\s+index\s+(?:concurrently\s+)?if\s+(?:not\s+)?exists\b/i,
  );
});

test("마이그레이션은 콘텐츠 스키마와 정렬 인덱스 외 상태를 바꾸지 않는다", () => {
  const migration = read(migrationFile);

  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\./i,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:create|alter|drop)\s+policy\b|\b(?:grant|revoke)\b/i,
  );
  assert.doesNotMatch(migration, /\bstorage\./i);
  assert.doesNotMatch(migration, /\balter table public\.(?!contents\b)/i);
  assert.equal(
    migration.match(/\balter table public\.contents\b/gi)?.length,
    1,
  );
});

test("롤백 확인은 동일 snapshot, null baseline, 기존 인덱스 복원을 고정한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /CONTENTS_THUMBNAIL_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /CONTENTS_THUMBNAIL_ROLLBACK_OK/);
  assert.match(rollback, /기존 contents_published_sort_idx 미복원/);
  assert.doesNotMatch(executableSql(preflight), /\bcommit\s*;/i);
  assert.doesNotMatch(executableSql(rollback), /\bcommit\s*;/i);
});

test("사전 검사는 행·스키마·정책·권한·트리거·인덱스와 Storage 전체를 snapshot한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  for (const component of [
    "contents_rows",
    "contents_existing_columns",
    "contents_existing_constraints",
    "contents_rls",
    "contents_other_indexes",
    "contents_ordering_index",
    "contents_policies",
    "contents_triggers",
    "contents_table_grants",
    "contents_existing_column_grants",
    "public_images_bucket",
    "storage_objects",
    "storage_object_policies",
  ]) {
    assert.match(preflight, new RegExp(component));
  }
  assert.match(preflight, /기존 콘텐츠 썸네일·게시일 NULL 유지/);
  assert.match(preflight, /썸네일·게시일 없는 콘텐츠 등록 허용/);
  assert.match(preflight, /콘텐츠 썸네일 경로 거부/);
  assert.match(preflight, /유효하지 않은 게시일 거부/);
  assert.match(preflight, /sort_order·게시일 NULLS LAST·UUID 역순 정렬/);
  assert.match(preflight, /contents\/를 포함하는 기존 Storage 관리자 정책/);
  assert.match(rollback, /검사 콘텐츠 행 잔존/);

  for (const source of [preflight, rollback]) {
    assert.doesNotMatch(
      executableSql(source),
      /\b(?:insert\s+into|update|delete\s+from)\s+storage\.(?:buckets|objects)\b/i,
    );
    assert.doesNotMatch(
      executableSql(source),
      /\b(?:create|alter|drop)\s+policy\b/i,
    );
  }
});

test("주석 처리된 운영 역방향 SQL은 기존 인덱스를 먼저 복원하고 열을 제거한다", () => {
  const rollback = read(rollbackFile);
  const inverse = rollback.split("-- 운영 역방향 SQL")[1];

  assert.match(inverse, /-- drop index public\.contents_published_sort_idx;/);
  assert.match(
    inverse,
    /-- on public\.contents \(is_published, sort_order, created_at desc, id desc\);/,
  );
  assert.match(inverse, /-- drop constraint contents_thumbnail_path_check,/);
  assert.match(inverse, /-- drop column posted_on,/);
  assert.match(inverse, /-- drop column thumbnail_path;/);
  assert.ok(
    inverse.indexOf("created_at desc") <
      inverse.indexOf("drop column posted_on"),
  );
});

test("실행 모형은 제약·보존·인덱스·원자성·rollback baseline을 고정한다", () => {
  const model = read(modelFile);

  assert.match(model, /MODEL_ATOMIC_FAILURE/);
  assert.match(model, /CONTENTS_THUMBNAIL_ROLLBACK_OK/);
  assert.match(model, /CONTENTS_THUMBNAIL_SCHEMA_ALREADY_EXISTS/);
  assert.match(model, /CONTENTS_THUMBNAIL_SCHEMA_PREREQUISITE_FAILED/);
  assert.match(model, /contents_thumbnail_path_check/);
  assert.match(model, /contents_thumbnail_alt_check/);
  assert.match(model, /contents_thumbnail_requires_alt_check/);
  assert.match(model, /posted_on DESC NULLS LAST/);
  assert.match(model, /wrongIndex/);
  assert.match(model, /storagePolicies/);
});
