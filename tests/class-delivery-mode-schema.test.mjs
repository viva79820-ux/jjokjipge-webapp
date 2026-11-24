// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL CHECK 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261124003530_add_class_delivery_mode.sql";
const preflightFile = "../supabase/tests/class_delivery_mode_preflight.sql";
const rollbackFile = "../supabase/tests/class_delivery_mode_rollback_check.sql";
const modelFile = "./class-delivery-mode-schema.model.mjs";
const posterFiles = [
  "supabase/migrations/20261123031448_class_poster_schema.sql",
  "supabase/tests/class_poster_preflight.sql",
  "supabase/tests/class_poster_rollback_check.sql",
  "tests/class-poster-schema.model.mjs",
  "tests/class-poster-schema.test.mjs",
];

test("기존 포스터 마이그레이션과 검사는 기준 커밋과 동일하다", () => {
  for (const file of posterFiles) {
    assert.equal(
      read(`../${file}`),
      execFileSync("git", ["show", `6762fd0:${file}`], {
        encoding: "utf8",
      }).replaceAll("\r\n", "\n"),
      file,
    );
  }
});

test("사전 검사는 전달 방식 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /add column is_online boolean not null default true/);
  assert.match(migration, /drop constraint classes_published_video_url_check/);
  assert.match(
    migration,
    /check \(not is_published or not is_online or video_url is not null\)/,
  );
  assert.match(migration, /classes_video_url_check 정의가 예상과 다릅니다/);
  assert.match(
    migration,
    /classes_published_video_url_check 정의가 예상과 다릅니다/,
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
  assert.match(preflight, /CLASS_DELIVERY_MODE_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /CLASS_DELIVERY_MODE_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});

test("마이그레이션은 클래스 전달 방식 외 데이터·정책·Storage를 바꾸지 않는다", () => {
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
  assert.doesNotMatch(migration, /\bposter_(?:path|alt)\b/i);
  assert.equal(migration.match(/\balter table public\.classes\b/gi)?.length, 1);
});

test("사전 검사에는 필수 허용·거부와 보존 증거가 있다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.match(preflight, /기존 클래스 모두 온라인으로 보존/);
  assert.match(preflight, /공개 오프라인 클래스 영상 없이 저장/);
  assert.match(preflight, /공개 온라인 클래스 영상 NULL 거부/);
  assert.match(preflight, /공개 온라인 클래스 비 HTTPS 영상 거부/);
  assert.match(preflight, /공개 온라인 클래스 유효한 HTTPS 영상 저장/);
  assert.match(preflight, /classes_rows/);
  assert.match(preflight, /classes_rls/);
  assert.match(preflight, /classes_policies/);
  assert.match(preflight, /classes_table_grants/);
  assert.match(preflight, /classes_existing_column_grants/);
  assert.match(preflight, /storage_object_policies/);
  assert.match(rollback, /기존 공개 영상 제약 미복원/);
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

test("실행 모형은 선행 포스터·원자성·반복 거부를 고정한다", () => {
  const model = read(modelFile);

  assert.match(model, /20261123031448_class_poster_schema\.sql/);
  assert.match(model, /MODEL_ATOMIC_FAILURE/);
  assert.match(model, /CLASS_DELIVERY_MODE_ROLLBACK_OK/);
  assert.match(model, /classes_published_video_url_check/);
  assert.match(model, /classes_video_url_check/);
  assert.match(model, /CLASS_DELIVERY_MODE_ALREADY_EXISTS/);
  assert.match(model, /poster_path/);
  assert.match(model, /poster_alt/);
});
