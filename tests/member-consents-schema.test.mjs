// SQL 본문 동기화와 변경 범위를 검사한다. 실제 PostgreSQL RLS·GRANT 실행은 model 파일이 담당한다.
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
  "../supabase/migrations/20261125012910_member_consents.sql";
const preflightFile = "../supabase/tests/member_consents_preflight.sql";
const rollbackFile = "../supabase/tests/member_consents_rollback_check.sql";
const modelFile = "./member-consents-schema.model.mjs";
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
  "supabase/migrations/20261124030951_contents_thumbnail_fields.sql",
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

test("사전 검사는 member_consents 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /create table public\.member_consents/);
  assert.match(
    migration,
    /user_id uuid primary key references auth\.users\(id\) on delete cascade/,
  );
  assert.match(migration, /terms_version text not null default '1\.0'/);
  assert.match(migration, /privacy_version text not null default '1\.0'/);
  assert.match(migration, /agreed_at timestamptz not null default now\(\)/);
});

test("본인 읽기와 서버 insert만 허용하고 profiles는 바꾸지 않는다", () => {
  const migration = read(migrationFile);

  assert.match(
    migration,
    /create policy member_consents_select_own[\s\S]*for select to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/,
  );
  assert.equal((migration.match(/\bcreate policy\b/g) ?? []).length, 1);
  assert.match(
    migration,
    /revoke all on public\.member_consents\s+from public, anon, authenticated, service_role;/,
  );
  assert.match(
    migration,
    /grant select on public\.member_consents to authenticated;/,
  );
  assert.match(
    migration,
    /grant insert on public\.member_consents to service_role;/,
  );
  assert.doesNotMatch(migration, /grant (?:update|delete)/);
  assert.doesNotMatch(migration, /alter table public\.profiles/);
  assert.doesNotMatch(
    migration,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.profiles\b/i,
  );
});

test("동의 버전은 1.0으로 고정되고 쓰기 정책은 없다", () => {
  const migration = read(migrationFile);

  assert.match(
    migration,
    /constraint member_consents_terms_version_check\s+check \(terms_version = '1\.0'\)/,
  );
  assert.match(
    migration,
    /constraint member_consents_privacy_version_check\s+check \(privacy_version = '1\.0'\)/,
  );
  assert.doesNotMatch(migration, /for (?:insert|update|delete)/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /create or replace/i);
});

test("사전 검사와 롤백 검사는 같은 기존 상태 snapshot을 쓴다", () => {
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(rollback, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /MEMBER_CONSENTS_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /baseline jsonb := null;/);
  assert.match(rollback, /MEMBER_CONSENTS_ROLLBACK_OK/);
  assert.doesNotMatch(executableSql(preflight), /\bcommit\s*;/i);
  assert.doesNotMatch(executableSql(rollback), /\bcommit\s*;/i);
});

test("snapshot은 기존 스키마와 회원 자료를 해시로만 보존한다", () => {
  const preflight = read(preflightFile);

  for (const component of [
    "public_relations",
    "public_columns",
    "public_constraints",
    "public_policies",
    "public_grants",
    "profile_rows",
    "auth_user_ids",
  ]) {
    assert.match(preflight, new RegExp(component));
  }
  assert.doesNotMatch(
    preflight,
    /\b(?:insert\s+into|update|delete\s+from)\s+(?:auth\.users|public\.profiles)\b/i,
  );
});

test("실행 모형은 RLS·권한·버전·cascade·rollback을 고정한다", () => {
  const model = read(modelFile);

  assert.match(model, /service_role/);
  assert.match(model, /authenticated/);
  assert.match(model, /anon/);
  assert.match(model, /member_consents_terms_version_check/);
  assert.match(model, /member_consents_privacy_version_check/);
  assert.match(model, /confdeltype = 'c'/);
  assert.match(model, /drop table public\.member_consents/);
});
