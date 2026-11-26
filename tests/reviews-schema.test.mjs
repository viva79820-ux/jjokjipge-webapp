import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (source, start, end) => source.split(start)[1].split(end)[0];

const migrationFile =
  "../supabase/migrations/20261125002731_reviews_schema.sql";
const preflightFile = "../supabase/tests/reviews_preflight.sql";
const rollbackFile = "../supabase/tests/reviews_rollback_check.sql";
const earlierMigrations = [
  "supabase/migrations/20261102035714_reservations_schema.sql",
  "supabase/migrations/20261119010000_shop_products_schema.sql",
  "supabase/migrations/20261124030951_contents_thumbnail_fields.sql",
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

test("사전 검사는 후기 마이그레이션 전체를 그대로 포함한다", () => {
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
  assert.match(migration, /create table public\.reviews/);
  assert.match(
    migration,
    /alter table public\.reviews enable row level security/,
  );
  assert.doesNotMatch(
    migration,
    /\bcreate\s+(?:table|index|trigger|policy)\s+if\s+not\s+exists\b/i,
  );
  assert.doesNotMatch(
    migration,
    /^\s*(?:insert into|update|delete from) public\.reviews\b/im,
  );
});

test("후기 대상·작성자·별점·본문·자격 연결 열과 제약이 고정되어 있다", () => {
  const migration = read(migrationFile);

  assert.match(
    migration,
    /counselor_id uuid references public\.counselors\(id\) on delete restrict/,
  );
  assert.match(
    migration,
    /product_id uuid references public\.products\(id\) on delete restrict/,
  );
  assert.match(
    migration,
    /author_id uuid references public\.profiles\(id\) on delete set null/,
  );
  assert.match(migration, /author_name text not null/);
  assert.match(migration, /rating smallint not null/);
  assert.match(migration, /rating between 1 and 5/);
  assert.match(migration, /char_length\(body\) <= 2000/);
  assert.match(
    migration,
    /reservation_id uuid unique\s+references public\.reservations\(id\) on delete restrict/,
  );
  assert.match(
    migration,
    /check \(num_nonnulls\(counselor_id, product_id\) = 1\)/,
  );
});

test("공개 읽기와 관리자 공개 전환만 허용한다", () => {
  const migration = read(migrationFile);
  const preflight = read(preflightFile);

  assert.equal((migration.match(/create policy reviews_/g) ?? []).length, 2);
  assert.match(
    migration,
    /using \(is_published or \(select private\.is_admin\(\)\)\)/,
  );
  assert.match(
    migration,
    /for update to authenticated\s+using \(\(select private\.is_admin\(\)\)\)\s+with check \(\(select private\.is_admin\(\)\)\)/,
  );
  assert.match(
    migration,
    /grant update \(is_published\) on public\.reviews to authenticated/,
  );
  assert.match(
    migration,
    /grant select \(\s+id,\s+counselor_id,\s+product_id,\s+author_name,\s+rating,\s+body,\s+is_published,\s+created_at,\s+updated_at\s+\) on public\.reviews to anon, authenticated/,
  );
  assert.doesNotMatch(migration, /grant select on public\.reviews/);
  assert.doesNotMatch(migration, /grant (?:insert|delete)/);
  assert.match(preflight, /비로그인 공개 후기만 조회/);
  assert.match(preflight, /비로그인 작성자·예약 식별자 조회 차단/);
  assert.match(preflight, /일반 회원 공개 상태 변경 0행/);
  assert.match(preflight, /일반 회원 작성자·예약 식별자 조회 차단/);
  assert.match(preflight, /관리자 공개 전환과 수정일 갱신/);
  assert.match(preflight, /관리자 공개 여부 외 열 변경 차단/);
});

test("공개 최신순 인덱스와 롤백 원본 검사가 일치한다", () => {
  const migration = read(migrationFile);
  const preflight = read(preflightFile);
  const rollback = read(rollbackFile);

  assert.match(
    migration,
    /on public\.reviews \(created_at desc, id desc\)\s+where is_published/,
  );
  assert.equal(
    between(preflight, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
    between(rollback, "-- BEGIN EXACT SNAPSHOT\n", "\n-- END EXACT SNAPSHOT"),
  );
  assert.match(preflight, /^--[\s\S]*\nrollback;\nbegin;\n/);
  assert.match(preflight, /REVIEWS_PREFLIGHT_OK/);
  assert.match(preflight, /detail = baseline::text/);
  assert.match(rollback, /baseline jsonb := null/);
  assert.match(rollback, /REVIEWS_ROLLBACK_OK/);
  assert.doesNotMatch(preflight, /\bcommit\s*;/i);
  assert.doesNotMatch(rollback, /\bcommit\s*;/i);
});
