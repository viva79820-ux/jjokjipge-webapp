// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL RLS 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261125120000_lectures_schema.sql";
const preflightFile = "../supabase/tests/lectures_preflight.sql";
const rollbackFile = "../supabase/tests/lectures_rollback_check.sql";
const earlierMigrations = [
  "supabase/migrations/20261118010000_classes_contents_schema.sql",
  "supabase/migrations/20261125002731_reviews_schema.sql",
  "supabase/migrations/20261125003421_restore_profile_creation_trigger.sql",
];

test("기존 관련 마이그레이션은 origin/main과 동일하다", () => {
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

test("사전 검사는 강의 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /create table public\.teachers/);
  assert.match(migration, /create table public\.lectures/);
  assert.match(migration, /create table public\.lecture_upload_consents/);
  assert.doesNotMatch(migration, /alter table public\.classes/i);
  assert.doesNotMatch(migration, /profiles\.role/i);
  assert.doesNotMatch(
    migration,
    /\bcreate\s+(?:table|index|trigger|policy|function)\s+if\s+not\s+exists\b/i,
  );
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles|public\.classes)\b/i,
  );
});

test("선생님·동의·강의 열과 고객 비공개가 고정되어 있다", () => {
  const migration = read(migrationFile);

  assert.match(
    migration,
    /user_id uuid primary key references public\.profiles\(id\) on delete cascade/,
  );
  assert.match(
    migration,
    /granted_by uuid not null references public\.profiles\(id\) on delete restrict/,
  );
  assert.match(migration, /statement = '본인이 권리를 가진 영상만 올린다'/);
  assert.match(migration, /field in \('saju', 'tarot'\)/);
  assert.match(migration, /view_count integer not null default 0/);
  assert.match(migration, /new\.view_count := 0/);
  assert.match(migration, /LECTURE_ADMIN_UNPUBLISH_ONLY/);
  assert.doesNotMatch(migration, /to anon/);
  assert.doesNotMatch(migration, /grant select on public\.lectures to anon/);
});

test("세 역할의 권한 검사와 롤백 원본이 고정되어 있다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /선생님 A는 자신의 권한만 본다/);
  assert.match(preflight, /일반 회원은 선생님 권한·강의·동의를 보지 못한다/);
  assert.match(preflight, /관리자 강제 비공개/);
  assert.match(preflight, /관리자 제목 변경 차단/);
  assert.match(preflight, /다른 선생님 강의 수정 0행/);
  assert.match(preflight, /비로그인 공개 강의 조회 차단/);
  assert.match(preflight, /권한 회수 후 강의 작성 차단/);
  assert.match(preflight, /실제 로그인·Auth 세션 검증 아님/);
  assert.match(preflight, /LECTURES_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(rollback, /LECTURES_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.classes\b/i,
  );
  assert.doesNotMatch(
    preflight,
    /\b(?:update|delete\s+from)\s+public\.profiles\b/i,
  );
  assert.match(preflight, /insert into auth\.users \(id, email\)/);
  assert.match(preflight, /lectures-teacher-a@example\.invalid/);
  assert.match(preflight, /lectures-teacher-b@example\.invalid/);
  assert.match(preflight, /lectures-member-c@example\.invalid/);
  assert.match(rollback, /lectures-teacher-a@example\.invalid/);
  assert.match(rollback, /임시 사용자·profile 잔존/);
});
