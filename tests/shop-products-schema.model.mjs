// 실행: node tests/shop-products-schema.model.mjs
// 임시 캐시의 PGlite에서 실제 PostgreSQL CHECK·RLS·GRANT·롤백을 검사한다.
// 프로젝트 의존성, 실제 Supabase, Storage API, 실제 로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.SHOP_PRODUCTS_PGLITE_MODULE ||
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
const migrations = [
  reservations,
  read("../supabase/migrations/20261102035715_seed_dummy.sql"),
  read("../supabase/migrations/20261105010000_customer_support_schema.sql"),
  read("../supabase/migrations/20261105010001_seed_faq_examples.sql"),
  read("../supabase/migrations/20261109010000_notices_schema.sql"),
  read("../supabase/migrations/20261110010000_notices_popup_setting.sql"),
  read("../supabase/migrations/20261111010000_counselors_admin_schema.sql"),
  read("../supabase/migrations/20261113010000_stores_delete_restrict.sql"),
  read("../supabase/migrations/20261118010000_classes_contents_schema.sql"),
];
const migration = read(
  "../supabase/migrations/20261119010000_shop_products_schema.sql",
);
const preflight = read("../supabase/tests/shop_products_preflight.sql");
const rollback = read("../supabase/tests/shop_products_rollback_check.sql");

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
  for (const source of migrations) {
    await run(source);
  }
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
        'auth_users', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from auth.users t
        ),
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
        ),
        'classes', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.classes t
        ),
        'contents', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.contents t
        ),
        'storage_buckets', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from storage.buckets t
        ),
        'storage_objects', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from storage.objects t
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
        to_regclass('public.products') as products,
        to_regclass('public.products_published_sort_idx') as products_index,
        (
          select count(*)::int
          from pg_policies
          where schemaname = 'public'
            and tablename = 'products'
        ) as product_policies
    `)
  ).rows[0];
  assert.deepEqual(objects, {
    products: null,
    products_index: null,
    product_policies: 0,
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
      /^SHOP_PRODUCTS_PREFLIGHT_OK: 검사 \d+개 통과/,
    );
    const baseline = JSON.parse(success.detail);
    assert.equal(baseline.format, "shop-products-preflight-v1");
    assert.equal(baseline.eligible, true);
    assert.equal(baseline.non_admin_mode, expectedMode);
    assert.equal(baseline.test_ids.length, 5);
    assert.equal(baseline.state.stores_rows.count, 2);
    assert.equal(baseline.state.counselors_rows.count, 6);
    assert.equal(baseline.state.consult_products_rows.count, 12);
    assert.equal(baseline.state.profiles_rows.count, hasUser ? 2 : 1);
    assert.ok(success.message.includes("SQL 역할·RLS·CHECK·GRANT·전체 롤백"));
    assert.ok(success.message.includes("후속 주문 차단 미검증"));
    assert.doesNotMatch(
      JSON.stringify(baseline),
      /상담사 A|admin@example|user@example|관리자|회원|테스트/,
    );

    const rollbackResult = await run(withBaseline(baseline));
    assert.equal(
      rollbackResult.at(-1).rows[0].result,
      "SHOP_PRODUCTS_ROLLBACK_OK",
    );
    await assertRolledBack(db, before);
    console.log(success.message);
    console.log(
      `SHOP_PRODUCTS_ROLLBACK_OK: ${expectedMode} 기존 업무·인증·Storage·카탈로그 원본 일치`,
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
    /^SHOP_PRODUCTS_ROLLBACK_BASELINE_REQUIRED/,
  );
  await expectError(
    existingUser.run,
    withBaseline({ ...existingUser.baseline, format: "wrong-format" }),
    "P0001",
    /^SHOP_PRODUCTS_ROLLBACK_BASELINE_REQUIRED/,
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
        (select relrowsecurity from pg_class where oid = 'public.products'::regclass) as products_rls,
        has_table_privilege('anon', 'public.products', 'SELECT') as anon_select,
        has_table_privilege('anon', 'public.products', 'INSERT') as anon_insert,
        has_table_privilege('authenticated', 'public.products', 'DELETE') as authenticated_delete,
        has_table_privilege('authenticated', 'public.products', 'TRUNCATE') as authenticated_truncate,
        (
          select format_type(atttypid, atttypmod)
          from pg_attribute
          where attrelid = 'public.products'::regclass
            and attname = 'price'
        ) as price_type
    `)
  ).rows[0];
  assert.deepEqual(catalog, {
    products_rls: true,
    anon_select: true,
    anon_insert: false,
    authenticated_delete: true,
    authenticated_truncate: false,
    price_type: "numeric",
  });
  await expectError(
    existingUser.run,
    "insert into public.products (name, description, price) values ('소수', '설명', 1.5)",
    "23514",
    /products_price_check/,
  );
  await expectError(
    existingUser.run,
    migration,
    "P0001",
    /^SHOP_PRODUCTS_SCHEMA_ALREADY_EXISTS: public\.products$/,
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
  console.log(`SHOP_PRODUCTS_MODEL_COUNT: ${profileless.count}`);
} finally {
  await profileless.db.close();
}

const wrongPredecessor = await createModel();
try {
  await wrongPredecessor.run("drop table public.contents");
  await expectError(
    wrongPredecessor.run,
    migration,
    "P0001",
    /^SHOP_PRODUCTS_SCHEMA_PREREQUISITE_FAILED: public\.contents$/,
  );
  assert.equal(
    (
      await wrongPredecessor.db.query(
        "select to_regclass('public.products') as products",
      )
    ).rows[0].products,
    null,
  );
} finally {
  await wrongPredecessor.db.close();
}

const wrongStorage = await createModel();
try {
  await wrongStorage.run(
    "drop policy public_images_insert_admin on storage.objects",
  );
  await expectError(
    wrongStorage.run,
    preflight,
    "P0001",
    /^SHOP_PRODUCTS_PREFLIGHT_PREREQUISITE_FAILED: products\/를 포함하는 기존 Storage 관리자 정책 필요$/,
  );
  await wrongStorage.run("rollback");
  assert.equal(
    (
      await wrongStorage.db.query(
        "select to_regclass('public.products') as products",
      )
    ).rows[0].products,
    null,
  );
} finally {
  await wrongStorage.db.close();
}

console.log(
  "PASS: existing_user/profileless 격리 PostgreSQL 모형, 상품 CHECK·RLS·GRANT·관리자 CRUD·원자적 실패·baseline 롤백·선행 구조와 Storage 정책 거부. 실제 Supabase Data API·Storage API·실제 로그인은 미검증.",
);
