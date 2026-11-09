// 실행: node tests/notices-schema.model.mjs
// 임시 캐시의 PGlite만 사용한다. 프로젝트 의존성·실제 DB·Storage API에 접근하지 않는다.
// 외부 실행 환경은 NOTICES_PGLITE_MODULE에 모듈 경로/URL을 지정할 수 있다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(
  process.env.NOTICES_PGLITE_MODULE ||
    "../node_modules/.cache/notices-pg-runtime/node_modules/@electric-sql/pglite/dist/index.js"
);
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const base = read(
  "../supabase/migrations/20261102035714_reservations_schema.sql",
);
const fn = (name) => {
  const start = base.indexOf(`create function private.${name}()`);
  assert.ok(start >= 0);
  return base.slice(start, base.indexOf("$$;", start) + 3);
};
const preflight = read("../supabase/tests/notices_preflight.sql");
const rollback = read("../supabase/tests/notices_rollback_check.sql");
const db = new PGlite();
const run = (sql) => db.exec(sql);
async function expect(sql, code, pattern) {
  try {
    await run(sql);
  } catch (error) {
    assert.equal(error.code, code);
    assert.match(error.message, pattern);
    return error;
  }
  throw Error("Expected database error was missing");
}
try {
  console.log((await db.query("select version() as version")).rows[0].version);
  await run(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema private;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create table public.profiles (id uuid primary key references auth.users(id) on delete cascade,
      name text, role text not null default 'user', updated_at timestamptz default now());
    ${fn("set_updated_at")}
    ${fn("is_admin")}
    ${fn("handle_new_user")}
    create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();
    grant usage on schema auth, private, public, storage to anon, authenticated;
    revoke all on function private.is_admin() from public;
    grant execute on function private.is_admin() to anon, authenticated;
    create table storage.buckets (id text primary key, name text unique not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text not null, metadata jsonb, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    create policy model_existing_policy on storage.objects for select to anon using (bucket_id='unrelated-model-bucket');
    insert into storage.buckets(id,name) values ('unrelated-model-bucket','unrelated-model-bucket');
    insert into storage.objects(bucket_id,name) values ('unrelated-model-bucket','untouched');
  `);
  const success = await expect(
    preflight,
    "P0001",
    /^NOTICES_PREFLIGHT_OK: 검사 \d+개 통과/,
  );
  const baseline = JSON.parse(success.detail);
  assert.equal(baseline.eligible, true);
  assert.equal(baseline.bucket, null);
  assert.equal(baseline.policies.length, 1);
  const withBaseline = (value) =>
    rollback.replace(
      "baseline jsonb := null;",
      `baseline jsonb := '${JSON.stringify(value).replaceAll("'", "''")}'::jsonb;`,
    );
  const rollbackResult = await run(withBaseline(baseline));
  assert.equal(rollbackResult.at(-1).rows[0].result, "NOTICES_ROLLBACK_OK");
  const remaining = (
    await db.query(
      "select to_regclass('public.notices') as notices, (select count(*)::int from storage.buckets where id='public-images') as buckets",
    )
  ).rows[0];
  assert.deepEqual(remaining, { notices: null, buckets: 0 });
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from storage.objects where name='untouched'",
      )
    ).rows[0].count,
    1,
  );
  // 원본을 누락하거나 변조한 경우 롤백 확인이 성공하지 않아야 한다.
  await expect(rollback, "P0001", /^NOTICES_ROLLBACK_BASELINE_REQUIRED/);
  await expect(
    withBaseline({ ...baseline, policies: [] }),
    "P0001",
    /^NOTICES_ROLLBACK_FAILED: storage.objects/,
  );
  // 기존 버킷이 있는 실제 환경에서는 첫 단계에서 중단하고 행/정책 전체를 보존한다.
  await run(
    "insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('public-images','public-images',false,9,array['image/gif'])",
  );
  const before = (
    await db.query(
      "select to_jsonb(b) as snapshot from storage.buckets b where id='public-images'",
    )
  ).rows[0].snapshot;
  const stopped = await expect(
    preflight,
    "P0001",
    /^NOTICES_PREFLIGHT_NOT_INITIAL:/,
  );
  assert.equal(JSON.parse(stopped.detail).eligible, false);
  await run("rollback");
  assert.deepEqual(
    (
      await db.query(
        "select to_jsonb(b) as snapshot from storage.buckets b where id='public-images'",
      )
    ).rows[0].snapshot,
    before,
  );
  await expect(
    withBaseline(JSON.parse(stopped.detail)),
    "P0001",
    /^NOTICES_ROLLBACK_BASELINE_REQUIRED/,
  );
  console.log(success.message);
  console.log(
    "NOTICES_ROLLBACK_OK: baseline comparison and missing objects independently verified",
  );
  console.log(
    "PASS: isolated PostgreSQL model, exact migration, role/RLS tests, bucket subtransactions, preserved existing bucket/policy, rejected invalid baseline. No live Supabase or Storage API verification.",
  );
} finally {
  await db.close();
}
