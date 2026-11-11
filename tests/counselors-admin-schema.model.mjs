// 실행: node tests/counselors-admin-schema.model.mjs
// 임시 캐시의 PGlite만 사용하며 실제 Supabase·Storage에는 접근하지 않는다.
// PGlite 0.5.15에는 btree_gist가 없어 예약 겹침 배제 제약만 모형에서 빼고,
// 나머지 예약 마이그레이션 SQL은 그대로 실행한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.COUNSELORS_PGLITE_MODULE ||
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
const migration = read(
  "../supabase/migrations/20261111010000_counselors_admin_schema.sql",
);
const preflight = read("../supabase/tests/counselors_admin_preflight.sql");
const rollback = read("../supabase/tests/counselors_admin_rollback_check.sql");
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
  throw new Error("Expected database error was missing");
}

async function createModel({ hasAdmin, hasUser, badImage = false }) {
  const db = new PGlite();
  const run = (sql) => db.exec(sql);
  console.log((await db.query("select version() as version")).rows[0].version);
  await run(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb
    );
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  await run(reservations);
  await run(seed);
  await run(`
    insert into public.reservations (
      counselor_id,
      product_id,
      product_name,
      minutes,
      price,
      starts_at,
      ends_at,
      customer_name,
      customer_phone,
      customer_email,
      payment_method,
      status
    )
    select
      c.id,
      p.id,
      p.name,
      p.minutes,
      p.price,
      timestamptz '2026-12-01 12:00:00+09',
      timestamptz '2026-12-01 12:00:00+09' + make_interval(mins => p.minutes),
      '기존 모형 예약',
      '010-0000-0000',
      'model-reservation@example.invalid',
      'bank_transfer',
      'confirmed'
    from public.counselors c
    join public.consult_products p on p.counselor_id = c.id
    where c.slug = 'a'
    order by p.sort_order
    limit 1;
  `);
  if (hasAdmin) {
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
  }
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
  if (badImage) {
    await run(`
      update public.counselors
      set image_path = 'legacy.jpg'
      where slug = 'a';
    `);
  }
  return { db, run };
}

async function stateSnapshot(db) {
  return (
    await db.query(`
      select jsonb_build_object(
        'users', (
          select coalesce(jsonb_agg(to_jsonb(u) order by id), '[]'::jsonb)
          from auth.users u
        ),
        'profiles', (
          select coalesce(jsonb_agg(to_jsonb(p) order by id), '[]'::jsonb)
          from public.profiles p
        ),
        'counselors', (
          select coalesce(jsonb_agg(to_jsonb(c) order by slug), '[]'::jsonb)
          from public.counselors c
        ),
        'products', (
          select coalesce(jsonb_agg(to_jsonb(p) order by p.counselor_id, p.sort_order, p.name), '[]'::jsonb)
          from public.consult_products p
        ),
        'reservations', (
          select coalesce(jsonb_agg(to_jsonb(r) order by r.reservation_no), '[]'::jsonb)
          from public.reservations r
        )
      ) as snapshot
    `)
  ).rows[0].snapshot;
}

async function assertRolledBack(db, beforeState) {
  const rolledBack = (
    await db.query(`
      select
        exists (
          select 1
          from pg_attribute
          where attrelid = 'public.counselors'::regclass
            and attname in ('fields', 'careers')
            and not attisdropped
        ) as has_new_column,
        to_regprocedure('private.counselor_fields_valid(text[],text)') is not null
          or to_regprocedure('private.counselor_careers_valid(text[])') is not null
          or to_regprocedure('private.counselor_image_path_valid(text)') is not null
          as has_validator,
        (
          select pg_get_expr(d.adbin, d.adrelid)
          from pg_attribute a
          join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = 'public.counselors'::regclass
            and a.attname = 'is_active'
        ) as counselor_default,
        (
          select pg_get_expr(d.adbin, d.adrelid)
          from pg_attribute a
          join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = 'public.consult_products'::regclass
            and a.attname = 'is_active'
        ) as product_default,
        (
          select count(*)::int
          from public.counselors
          where slug like 'test-ca-%'
        ) as test_counselor_count
    `)
  ).rows[0];
  assert.deepEqual(rolledBack, {
    has_new_column: false,
    has_validator: false,
    counselor_default: "true",
    product_default: "true",
    test_counselor_count: 0,
  });
  assert.deepEqual(await stateSnapshot(db), beforeState);
}

async function runSuccessScenario(hasUser) {
  const expectedMode = hasUser ? "existing_user" : "profileless";
  const expectedDescription = hasUser
    ? "기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)"
    : "프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)";
  const { db, run } = await createModel({ hasAdmin: true, hasUser });
  try {
    const beforeState = await stateSnapshot(db);
    await expectError(
      run,
      "begin; select 1 / 0",
      "22012",
      /^division by zero$/,
    );
    const success = await expectError(
      run,
      preflight,
      "P0001",
      /^COUNSELORS_ADMIN_PREFLIGHT_OK: 검사 \d+개 통과/,
    );
    const baseline = JSON.parse(success.detail);
    assert.equal(baseline.format, "counselors-admin-preflight-v1");
    assert.equal(baseline.eligible, true);
    assert.equal(baseline.non_admin_mode, expectedMode);
    assert.equal(baseline.state.counselors_rows.count, 6);
    assert.equal(baseline.state.consult_products_rows.count, 12);
    assert.equal(baseline.state.reservations_rows.count, 1);
    assert.equal(baseline.state.profiles_rows.count, hasUser ? 2 : 1);
    assert.equal(baseline.test_ids.length, 11);
    assert.ok(success.message.includes(expectedDescription));
    assert.ok(
      success.message.includes(
        "실제 Storage API·파일 존재·MIME·크기·실제 로그인 미검증",
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(baseline),
      /테스트|상담사 A|기존 모형|가연|legacy/,
    );

    const rollbackResult = await run(withBaseline(baseline));
    assert.equal(
      rollbackResult.at(-1).rows[0].result,
      "COUNSELORS_ADMIN_ROLLBACK_OK",
    );
    await assertRolledBack(db, beforeState);
    console.log(success.message);
    console.log(
      `COUNSELORS_ADMIN_ROLLBACK_OK: ${expectedMode} 계정·profile·상담사·상품·예약·스키마 원본 일치`,
    );
    return {
      count: Number(success.message.match(/검사 (\d+)개/)[1]),
      baseline,
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
    /^COUNSELORS_ADMIN_ROLLBACK_BASELINE_REQUIRED/,
  );
  await existingUser.run(migration);
  assert.deepEqual(
    (
      await existingUser.db.query(`
        select
          count(*) filter (where fields = array[field]::text[])::int as migrated_fields,
          count(*) filter (where careers = '{}'::text[])::int as empty_careers,
          count(*) filter (where is_active)::int as active_counselors,
          count(*)::int as counselors
        from public.counselors
      `)
    ).rows[0],
    {
      migrated_fields: 6,
      empty_careers: 6,
      active_counselors: 6,
      counselors: 6,
    },
  );
  assert.deepEqual(
    (
      await existingUser.db.query(`
        select
          (
            select pg_get_expr(d.adbin, d.adrelid)
            from pg_attribute a
            join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = 'public.counselors'::regclass
              and a.attname = 'is_active'
          ) as counselor_default,
          (
            select pg_get_expr(d.adbin, d.adrelid)
            from pg_attribute a
            join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where a.attrelid = 'public.consult_products'::regclass
              and a.attname = 'is_active'
          ) as product_default,
          (select count(*)::int from public.reservations) as reservations,
          (select count(*) filter (where is_active)::int from public.consult_products) as active_products
      `)
    ).rows[0],
    {
      counselor_default: "false",
      product_default: "false",
      reservations: 1,
      active_products: 12,
    },
  );
  await expectError(
    existingUser.run,
    preflight,
    "P0001",
    /^COUNSELORS_ADMIN_PREFLIGHT_ALREADY_APPLIED/,
  );
  await existingUser.run("rollback");
  await expectError(
    existingUser.run,
    withBaseline(existingUser.baseline),
    "P0001",
    /^COUNSELORS_ADMIN_ROLLBACK_FAILED: public\.counselors\.fields 잔존/,
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
  console.log(`COUNSELORS_ADMIN_MODEL_COUNT: ${profileless.count}`);
} finally {
  await profileless.db.close();
}

const missingAdmin = await createModel({ hasAdmin: false, hasUser: true });
try {
  const beforeState = await stateSnapshot(missingAdmin.db);
  await expectError(
    missingAdmin.run,
    preflight,
    "P0001",
    /^COUNSELORS_ADMIN_PREFLIGHT_PREREQUISITE_FAILED: 기존 관리자 profile 필요$/,
  );
  await missingAdmin.run("rollback");
  await assertRolledBack(missingAdmin.db, beforeState);
} finally {
  await missingAdmin.db.close();
}

const badImage = await createModel({
  hasAdmin: true,
  hasUser: true,
  badImage: true,
});
try {
  const beforeState = await stateSnapshot(badImage.db);
  await expectError(
    badImage.run,
    preflight,
    "P0001",
    /^COUNSELORS_IMAGE_PATH_INVALID/,
  );
  await badImage.run("rollback");
  await assertRolledBack(badImage.db, beforeState);
  assert.equal(
    (
      await badImage.db.query(
        "select image_path from public.counselors where slug = 'a'",
      )
    ).rows[0].image_path,
    "legacy.jpg",
  );
} finally {
  await badImage.db.close();
}

console.log(
  "PASS: existing_user/profileless PostgreSQL models, interrupted transaction recovery, role/RLS/CHECK behavior, rollback baseline, unchanged accounts/profiles/reservations, missing-admin, already-applied, and invalid image_path rejection. btree_gist exclusion constraint is not reproduced. No live Supabase or Storage access.",
);
