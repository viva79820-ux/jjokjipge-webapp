import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261127124849_lecture_lesson_admin_hidden.sql";
const lessonsFile = "../supabase/migrations/20261127100219_lecture_lessons.sql";
const preflightFile =
  "../supabase/tests/lecture_lesson_admin_hidden_preflight.sql";
const rollbackFile =
  "../supabase/tests/lecture_lesson_admin_hidden_rollback_check.sql";

test("차시 마이그레이션은 그대로다", () => {
  assert.equal(
    read(lessonsFile),
    execFileSync("git", ["show", `008b696:${lessonsFile.slice(3)}`], {
      encoding: "utf8",
    }).replaceAll("\r\n", "\n"),
  );
});

test("사전 검사는 숨김 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(
    migration,
    /add column admin_hidden boolean not null default false/,
  );
  assert.match(migration, /admin_hidden = false/);
  assert.match(migration, /create policy lecture_lessons_update_admin_hide/);
  assert.match(
    migration,
    /using \(\(select private\.is_admin\(\)\)\)\s+with check \(\(select private\.is_admin\(\)\)\);/,
  );
  assert.match(
    migration,
    /grant update \(admin_hidden\) on public\.lecture_lessons to authenticated;/,
  );
  assert.match(migration, /LECTURE_LESSON_ADMIN_HIDE_ONLY/);
  assert.match(migration, /LECTURE_LESSON_ADMIN_HIDDEN_IMMUTABLE/);
  assert.match(migration, /LECTURE_PROGRESS_LESSON_HIDDEN/);
  assert.doesNotMatch(migration, /revoke .*service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("사전 검사와 롤백은 임시 계정과 숨김 규칙을 고정한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);
  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(
    preflight,
    /1단계 스키마\(teachers, lectures, lecture_upload_consents\)와/,
  );
  assert.match(preflight, /차시 스키마\(lecture_lessons/);
  assert.match(rollback, /차시 스키마\(lecture_lessons/);
  assert.match(preflight, /이미 운영에 적용되어 있다/);
  assert.match(rollback, /이미 운영에 적용되어 있다/);
  assert.match(preflight, /insert into auth\.users \(id, email\)/);
  assert.match(preflight, /lecture-lesson-hide-teacher@example\.invalid/);
  assert.match(preflight, /lecture-lesson-hide-member@example\.invalid/);
  assert.match(preflight, /a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1/);
  assert.match(preflight, /b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2/);
  assert.match(preflight, /set local storage\.allow_delete_query = 'true';/);
  assert.match(preflight, /set local storage\.allow_delete_query = 'false';/);
  assert.match(preflight, /비로그인에서 숨긴 차시가 안 보임/);
  assert.match(preflight, /관리자 숨김 성공/);
  assert.match(preflight, /관리자 다시 공개 거부/);
  assert.match(preflight, /선생님 admin_hidden 변경 거부/);
  assert.match(preflight, /숨긴 차시 진도 수정 0행/);
  assert.match(preflight, /선생님도 숨긴 차시 진도를 쓰지 못한다/);
  assert.match(preflight, /service_role 상태 기록은 숨김을 되돌리지 않는다/);
  assert.match(preflight, /LECTURE_LESSON_ADMIN_HIDDEN_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(rollback, /LECTURE_LESSON_ADMIN_HIDDEN_ROLLBACK_OK/);
  assert.match(rollback, /임시 사용자·profile·Storage 객체 잔존/);
  assert.match(
    preflight,
    /20261127100219_lecture_lessons\.sql\)은 고치지 않고 이 파일에 다시 넣지 않는다/,
  );
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});
