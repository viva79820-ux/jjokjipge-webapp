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
