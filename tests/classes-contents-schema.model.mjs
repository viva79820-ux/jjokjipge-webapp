// 실행: node tests/classes-contents-schema.model.mjs
// 임시 캐시의 PGlite에서 실제 PostgreSQL CHECK·RLS·GRANT·롤백을 검사한다.
// 프로젝트 의존성, 실제 Supabase, Storage API, 실제 로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.CLASSES_CONTENTS_PGLITE_MODULE ||
    "../node_modules/.cache/notices-pg-runtime/node_modules/@electric-sql/pglite/dist/index.js"
);
const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const reservationsSource = read(
  "../supabase/migrations/20261102035714_reservations_schema.sql",
);
const exclusion = `,
  exclude using gist (
    counselor_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed'))`;
assert.ok(reservationsSource.includes(exclusion));
const reservations = reservationsSource
  .replace(
    "create extension if not exists btree_gist with schema extensions;",
    "create schema if not exists extensions;",
  )
  .replace(exclusion, "");
const seed = read("../supabase/migrations/20261102035715_seed_dummy.sql");
const customerSupport = read(
  "../supabase/migrations/20261105010000_customer_support_schema.sql",
);
const faqSeed = read(
  "../supabase/migrations/20261105010001_seed_faq_examples.sql",
);
const notices = read(
  "../supabase/migrations/20261109010000_notices_schema.sql",
);
const noticesPopup = read(
  "../supabase/migrations/20261110010000_notices_popup_setting.sql",
);
const counselorsAdmin = read(
  "../supabase/migrations/20261111010000_counselors_admin_schema.sql",
);
const storesDelete = read(
  "../supabase/migrations/20261113010000_stores_delete_restrict.sql",
);
const migration = read(
  "../supabase/migrations/20261118010000_classes_contents_schema.sql",
);
const preflight = read("../supabase/tests/classes_contents_preflight.sql");
const rollback = read("../supabase/tests/classes_contents_rollback_check.sql");

const withBaseline = (baseline) =>
  rollback.replace(
    "baseline jsonb := null;",
    `baseline jsonb := '${JSON.stringify(baseline).replaceAll("'", "''")}'::jsonb;`,
  );

async function expectError(run, sql, code, pattern) {
  try {
    await run(sql);
  } catch (error) {
    assert.equal(error.code, code, error.message);
    assert.match(error.message, pattern);
    return error;
  }
  throw new Error("예상한 데이터베이스 오류가 발생하지 않았습니다.");
}

async function createModel({ hasUser = true } = {}) {
  const db = new PGlite();
  const run = (sql) => db.exec(sql);

  await run(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb
    );
    create table storage.buckets (
      id text primary key,
      name text unique not null,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text not null,
      metadata jsonb,
      unique (bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage
    to anon, authenticated, service_role;
    grant execute on function auth.uid()
    to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects
    to anon, authenticated;
    alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;
  `);
  await run(reservations);
  await run(seed);
  await run(customerSupport);
  await run(faqSeed);
  await run(notices);
  await run(noticesPopup);
  await run(counselorsAdmin);
  await run(storesDelete);
  await run(`
    insert into auth.users (id, email, raw_user_meta_data)
    values (
      '10000000-0000-4000-8000-000000000001',
      'admin@example.invalid',
      '{"name":"관리자"}'
    );
    update public.profiles
    set role = 'admin'
    where id = '10000000-0000-4000-8000-000000000001';
  `);
  if (hasUser) {
    await run(`
      insert into auth.users (id, email, raw_user_meta_data)
      values (
        '10000000-0000-4000-8000-000000000002',
        'user@example.invalid',
        '{"name":"회원"}'
      );
    `);
  }

  return { db, run };
}

async function businessState(db) {
  return (
    await db.query(`
      select jsonb_build_object(
        'profiles', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.profiles t
        ),
        'stores', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.stores t
        ),
        'counselors', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.counselors t
        ),
        'consult_products', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.consult_products t
        ),
        'reservations', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.reservations t
        ),
        'faqs', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.faqs t
        ),
        'inquiries', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.inquiries t
        ),
        'notices', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.notices t
        )
      ) as snapshot
    `)
  ).rows[0].snapshot;
}

async function assertRolledBack(db, before) {
  assert.deepEqual(await businessState(db), before);
  const objects = (
    await db.query(`
      select
        to_regclass('public.classes') as classes,
        to_regclass('public.contents') as contents,
        to_regclass('public.classes_published_sort_idx') as classes_index,
        to_regclass('public.contents_published_sort_idx') as contents_index
    `)
  ).rows[0];
  assert.deepEqual(objects, {
    classes: null,
    contents: null,
    classes_index: null,
    contents_index: null,
  });
}

async function runSuccessScenario(hasUser) {
  const expectedMode = hasUser ? "existing_user" : "profileless";
  const { db, run } = await createModel({ hasUser });
  try {
    const before = await businessState(db);
    const success = await expectError(
      run,
      preflight,
      "P0001",
      /^CLASSES_CONTENTS_PREFLIGHT_OK: 검사 \d+개 통과/,
    );
    const baseline = JSON.parse(success.detail);
    assert.equal(baseline.format, "classes-contents-preflight-v1");
    assert.equal(baseline.eligible, true);
    assert.equal(baseline.non_admin_mode, expectedMode);
    assert.equal(baseline.test_ids.length, 6);
    assert.equal(baseline.state.stores_rows.count, 2);
    assert.equal(baseline.state.counselors_rows.count, 6);
    assert.equal(baseline.state.profiles_rows.count, hasUser ? 2 : 1);
    assert.ok(success.message.includes("SQL 역할·RLS·CHECK·GRANT 검사 통과"));
    assert.ok(success.message.includes("실제 Supabase Data API·실제 로그인"));
    assert.doesNotMatch(
      JSON.stringify(baseline),
      /상담사 A|admin@example|user@example|관리자|회원/,
    );

    const rollbackResult = await run(withBaseline(baseline));
    assert.equal(
      rollbackResult.at(-1).rows[0].result,
      "CLASSES_CONTENTS_ROLLBACK_OK",
    );
    await assertRolledBack(db, before);
    console.log(success.message);
    console.log(
      `CLASSES_CONTENTS_ROLLBACK_OK: ${expectedMode} 기존 업무 데이터·정책·권한 원본 일치`,
    );
    return {
      count: Number(success.message.match(/검사 (\d+)개/)[1]),
      baseline,
      before,
      db,
      run,
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}

const existingUser = await runSuccessScenario(true);
try {
  await expectError(
    existingUser.run,
    rollback,
    "P0001",
    /^CLASSES_CONTENTS_ROLLBACK_BASELINE_REQUIRED/,
  );
  await expectError(
    existingUser.run,
    withBaseline({ ...existingUser.baseline, format: "wrong-format" }),
    "P0001",
    /^CLASSES_CONTENTS_ROLLBACK_BASELINE_REQUIRED/,
  );

  await expectError(
    existingUser.run,
    `begin;
${migration}
do $$ begin
  raise exception using errcode = 'P0001', message = 'MODEL_ATOMIC_FAILURE';
end $$;
commit;`,
    "P0001",
    /^MODEL_ATOMIC_FAILURE$/,
  );
  await existingUser.run("rollback");
  await assertRolledBack(existingUser.db, existingUser.before);

  await existingUser.run(migration);
  const catalog = (
    await existingUser.db.query(`
      select
        (select relrowsecurity from pg_class where oid = 'public.classes'::regclass) as classes_rls,
        (select relrowsecurity from pg_class where oid = 'public.contents'::regclass) as contents_rls,
        has_table_privilege('anon', 'public.classes', 'SELECT') as anon_select,
        has_table_privilege('anon', 'public.classes', 'INSERT') as anon_insert,
        has_table_privilege('authenticated', 'public.contents', 'DELETE') as authenticated_delete,
        has_table_privilege('authenticated', 'public.contents', 'TRUNCATE') as authenticated_truncate
    `)
  ).rows[0];
  assert.deepEqual(catalog, {
    classes_rls: true,
    contents_rls: true,
    anon_select: true,
    anon_insert: false,
    authenticated_delete: true,
    authenticated_truncate: false,
  });
  await expectError(
    existingUser.run,
    migration,
    "P0001",
    /^CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public\.classes$/,
  );
} finally {
  await existingUser.db.close();
}

const profileless = await runSuccessScenario(false);
try {
  assert.equal(
    profileless.count,
    existingUser.count,
    "비관리자 ID 선택 방식만으로 검사 수가 달라지면 안 됩니다.",
  );
  console.log(`CLASSES_CONTENTS_MODEL_COUNT: ${profileless.count}`);
} finally {
  await profileless.db.close();
}

const wrongPredecessor = await createModel();
try {
  await wrongPredecessor.run(`
    create table public.classes (id uuid primary key);
  `);
  await expectError(
    wrongPredecessor.run,
    migration,
    "P0001",
    /^CLASSES_CONTENTS_SCHEMA_ALREADY_EXISTS: public\.classes$/,
  );
  assert.equal(
    (
      await wrongPredecessor.db.query(`
        select to_regclass('public.contents') as contents
      `)
    ).rows[0].contents,
    null,
  );
} finally {
  await wrongPredecessor.db.close();
}

console.log(
  "PASS: existing_user/profileless 격리 PostgreSQL 모형, CHECK·RLS·GRANT·관리자 CRUD·원자적 실패·baseline 롤백·선행 구조 거부. 실제 Supabase Data API·실제 로그인은 미검증.",
);
