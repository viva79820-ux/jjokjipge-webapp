// SQL 본문 동기화만 검사한다. 운영 DB 사전 검사를 대체하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261125130000_member_account_withdrawal.sql";
const preflightFile = "../supabase/tests/member_withdrawal_preflight.sql";
const rollbackFile = "../supabase/tests/member_withdrawal_rollback_check.sql";

test("사전 검사는 탈퇴 마이그레이션 원문을 그대로 실행한다", () => {
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

test("탈퇴 함수는 본인 세션만 지우고 비밀 키를 쓰지 않는다", () => {
  const migration = read(migrationFile);

  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /security invoker\s+set search_path = ''/i);
  assert.match(migration, /where id = current_id/);
  assert.match(migration, /update public\.reservations\s+set user_id = null/i);
  assert.match(migration, /update public\.inquiries\s+set user_id = null/i);
  assert.match(migration, /update public\.orders set user_id = null/i);
  assert.match(
    migration,
    /grant execute on function public\.delete_own_account\(\) to authenticated/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.delete_own_account\(\)\s+from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function [\s\S]+to service_role/i,
  );
  assert.doesNotMatch(migration, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(migration, /\bcommit\s*;/i);
  assert.doesNotMatch(migration, /alter table/i);
});

test("사전 검사와 롤백 확인은 기존 행 원본을 비교한다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);
  const snapshot = (source) =>
    between(source, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT");

  assert.equal(snapshot(preflight), snapshot(rollback));
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(preflight, /MEMBER_WITHDRAWAL_PREFLIGHT_OK/);
  assert.match(
    preflight,
    /검사 예약은 남고 회원 연결만 끊기며 기존 예약 수는 유지/,
  );
  assert.match(rollback, /MEMBER_WITHDRAWAL_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});
