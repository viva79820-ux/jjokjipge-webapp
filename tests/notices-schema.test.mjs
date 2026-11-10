// SQL 본문 동기화만 검사한다. SQLSTATE/RLS/Storage의 실행 검증을 대체하지 않는다.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
test("migration is unchanged from the reviewed commit", () => {
  assert.equal(
    read("../supabase/migrations/20261109010000_notices_schema.sql"),
    execFileSync(
      "git",
      [
        "show",
        "369b1ee5c28f080f0fdd5e40d90e58254487a8eb:supabase/migrations/20261109010000_notices_schema.sql",
      ],
      { encoding: "utf8" },
    ),
  );
});
test("preflight uses the complete unchanged migration and exact bucket block", () => {
  const migration = read(
    "../supabase/migrations/20261109010000_notices_schema.sql",
  ).trimEnd();
  const preflight = read("../supabase/tests/notices_preflight.sql");
  assert.equal(
    preflight
      .split("-- BEGIN EXACT SCHEMA\n")[1]
      .split("\n-- END EXACT SCHEMA")[0],
    migration,
  );
  const bucket = migration
    .split("-- BEGIN EXACT BUCKET\n")[1]
    .split("\n-- END EXACT BUCKET")[0];
  assert.equal(preflight.split("$exact_bucket$")[1], bucket);
});

test("popup preflight uses the complete popup migration DDL", () => {
  const migration = read(
    "../supabase/migrations/20261110010000_notices_popup_setting.sql",
  ).trimEnd();
  const preflight = read("../supabase/tests/notices_popup_preflight.sql");
  assert.equal(
    preflight
      .split("-- BEGIN EXACT MIGRATION\n")[1]
      .split("\n-- END EXACT MIGRATION")[0],
    migration,
  );
  assert.equal(
    migration,
    [
      "-- 기존 공지의 콘텐츠를 홈 팝업으로 표시할지 설정한다.",
      "alter table public.notices",
      "add column is_popup boolean not null default false;",
    ].join("\n"),
  );
});

test("popup checks use rollback baseline and real database roles without Storage", () => {
  const preflight = read("../supabase/tests/notices_popup_preflight.sql");
  const rollback = read("../supabase/tests/notices_popup_rollback_check.sql");
  assert.match(preflight, /^--[\s\S]*\nbegin;\n/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.match(preflight, /set local role anon;/i);
  assert.match(preflight, /set local role authenticated;/i);
  assert.match(preflight, /NOTICES_POPUP_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.doesNotMatch(preflight, /\bstorage\./i);
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.profiles\b/i,
  );
  assert.match(rollback, /^--[\s\S]*\nrollback;\n/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(rollback, /NOTICES_POPUP_ROLLBACK_OK/);
  assert.doesNotMatch(rollback, /\bstorage\./i);
});
