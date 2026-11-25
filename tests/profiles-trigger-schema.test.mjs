// SQL 본문 동기화와 보정 범위를 검사한다. 실제 운영 DB 사전 검사를 대체하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261125003421_restore_profile_creation_trigger.sql";
const preflightFile = "../supabase/tests/profiles_trigger_preflight.sql";
const rollbackFile = "../supabase/tests/profiles_trigger_rollback_check.sql";

test("사전 검사는 profile 트리거 마이그레이션 원문을 그대로 실행한다", () => {
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

test("마이그레이션은 트리거 복구와 누락 profile 보정만 수행한다", () => {
  const migration = read(migrationFile);

  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(
    migration,
    /create trigger on_auth_user_created\s+after insert on auth\.users/i,
  );
  assert.match(migration, /on conflict \(id\) do nothing/i);
  assert.match(
    migration,
    /insert into public\.profiles \(id, name\)\s+select[\s\S]+from auth\.users/i,
  );
  assert.doesNotMatch(migration, /\bupdate\s+public\.profiles\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bcommit\s*;/i);
});

test("사전 검사와 롤백 확인은 기존 행과 카탈로그 원본을 비교한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);
  const snapshot = (source) =>
    between(source, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT");

  assert.equal(snapshot(preflight), snapshot(rollback));
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /PROFILES_TRIGGER_PREFLIGHT_OK/);
  assert.match(preflight, /신규 인증 계정 profile 자동 생성/);
  assert.match(preflight, /검사 계정 삭제 시 profile CASCADE 삭제/);
  assert.match(rollback, /PROFILES_TRIGGER_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});
