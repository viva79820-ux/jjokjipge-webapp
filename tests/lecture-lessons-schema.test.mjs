// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL RLS 실행 검증을 대체하지 않는다.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261127100219_lecture_lessons.sql";
const preflightFile = "../supabase/tests/lecture_lessons_preflight.sql";
const rollbackFile = "../supabase/tests/lecture_lessons_rollback_check.sql";
const stepOneFile = "supabase/migrations/20261125120000_lectures_schema.sql";

test("1단계 강의 마이그레이션은 그대로다", () => {
  // 1단계 브랜치는 운영 main에 합쳐진 뒤 없다. 원본은 origin/main과 같아야 한다.
  assert.equal(
    read(`../${stepOneFile}`),
    execFileSync("git", ["show", `origin/main:${stepOneFile}`], {
      encoding: "utf8",
    }).replaceAll("\r\n", "\n"),
  );
});

test("사전 검사는 차시 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /create table public\.lecture_lessons/);
  assert.match(migration, /create table public\.lecture_webhook_events/);
  assert.match(migration, /create table public\.lecture_storage_state/);
  assert.match(migration, /create table public\.lecture_progress/);
  assert.match(migration, /drop policy lectures_delete_owner/);
  assert.match(
    migration,
    /grant select, insert, update, delete on public\.lectures to service_role;/,
  );
  assert.match(
    migration,
    /grant select, insert, update, delete on public\.lecture_lessons to service_role;/,
  );
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(
    migration,
    /\bcreate\s+(?:table|index|trigger|policy|function)\s+if\s+not\s+exists\b/i,
  );
  assert.doesNotMatch(migration, /create table public\.teachers/);
});

test("롤백 원본과 네 역할 검사가 고정되어 있다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /1단계 스키마/);
  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /set local role service_role;/i);
  assert.match(preflight, /선생님 A 차시 작성과 서버 칸 기본값/);
  assert.match(preflight, /선생님 A 상태 변경 차단/);
  assert.match(preflight, /선생님 A provider 변경 차단/);
  assert.match(preflight, /선생님 A 용량 변경 차단/);
  assert.match(preflight, /선생님 A 강의 삭제 차단/);
  assert.match(preflight, /선생님 B의 A 차시 수정 0행/);
  assert.match(preflight, /일반 회원은 공개 강의의 ready 차시만 본다/);
  assert.match(preflight, /비로그인은 공개 강의의 ready 차시만 본다/);
  assert.match(preflight, /service_role 다섯 테이블 읽기 쓰기/);
  assert.match(
    preflight,
    /service_role 차시 상태·용량 기록과 비공개 강의 조회/,
  );
  assert.match(
    preflight,
    /실제 로그인·Auth 세션·Data API·Bunny 호출 검증이 아니다/,
  );
  assert.match(preflight, /LECTURE_LESSONS_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(rollback, /LECTURE_LESSONS_ROLLBACK_OK/);
  assert.match(
    rollback,
    /1단계 스키마\(teachers, lectures, lecture_upload_consents\)는 적용된 채 남아 있다/,
  );
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
  assert.doesNotMatch(
    preflight,
    /\b(?:update|delete\s+from)\s+public\.profiles\b/i,
  );
  assert.doesNotMatch(preflight, /delete\s+from\s+storage\.objects/i);
  assert.doesNotMatch(preflight, /선생님이 아닌 기존 일반 회원/);
});

test("사전 검사는 임시 회원으로 격리하고 Storage 잔존을 확인한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.match(
    preflight,
    /1단계 스키마\(teachers, lectures, lecture_upload_consents\)는 이미 운영에 적용되어 있다/,
  );
  assert.match(
    rollback,
    /1단계 스키마\(teachers, lectures, lecture_upload_consents\)는 이미 운영에 적용되어 있다/,
  );
  assert.match(preflight, /insert into auth\.users \(id, email\)/);
  assert.match(preflight, /lecture-lessons-teacher-a@example\.invalid/);
  assert.match(preflight, /lecture-lessons-teacher-b@example\.invalid/);
  assert.match(preflight, /lecture-lessons-member@example\.invalid/);
  assert.match(preflight, /dddddddd-dddd-4ddd-8ddd-ddddddddddd4/);
  assert.match(preflight, /eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5/);
  assert.match(preflight, /ffffffff-ffff-4fff-8fff-fffffffffff6/);
  assert.match(
    preflight,
    /임시 사용자·profile·Storage 객체를 원본 보존 검사 전에 제거/,
  );
  assert.match(preflight, /storage\.allow_delete_query/);
  assert.match(rollback, /lecture-lessons-teacher-a@example\.invalid/);
  assert.match(rollback, /임시 사용자·profile·Storage 객체 잔존/);
  assert.match(rollback, /<> 0/);
  assert.match(rollback, /임시 사용자·profile·Storage 객체 잔존 0/);
});
