// 실행: node tests/stores-delete-schema.model.mjs
// 임시 캐시의 PGlite로 PostgreSQL FK·RLS·롤백을 검사하며 실제 Supabase·Storage에는 접근하지 않는다.
// PGlite에는 btree_gist가 없어 예약 겹침 배제 제약만 모형에서 제외한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.STORES_DELETE_PGLITE_MODULE ||
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
const counselorsAdmin = read(
  "../supabase/migrations/20261111010000_counselors_admin_schema.sql",
);
const migration = read(
  "../supabase/migrations/20261113010000_stores_delete_restrict.sql",
);
const preflight = read("../supabase/tests/stores_delete_preflight.sql");
const rollback = read("../supabase/tests/stores_delete_rollback_check.sql");
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

async function createModel({ hasUser = true } = {}) {
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
  await run(counselorsAdmin);
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

async function dataState(db) {
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
        'stores', (
          select coalesce(jsonb_agg(to_jsonb(s) order by id), '[]'::jsonb)
          from public.stores s
        ),
        'counselors', (
          select coalesce(jsonb_agg(to_jsonb(c) order by id), '[]'::jsonb)
          from public.counselors c
        )
      ) as snapshot
    `)
  ).rows[0].snapshot;
}

async function fkState(db) {
  return (
    await db.query(`
      select
        c.conname,
        c.confupdtype,
        c.confdeltype,
        c.confmatchtype,
        c.condeferrable,
        c.condeferred,
        c.convalidated,
        pg_get_constraintdef(c.oid, true) as definition,
        not a.attnotnull as nullable
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
        and a.attnum = c.conkey[1]
      where c.conrelid = 'public.counselors'::regclass
        and c.contype = 'f'
        and a.attname = 'store_id'
    `)
  ).rows;
}

async function assertRolledBack(db, beforeData) {
  assert.deepEqual(await dataState(db), beforeData);
  const rows = await fkState(db);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      name: rows[0].conname,
      update: rows[0].confupdtype,
      delete: rows[0].confdeltype,
      match: rows[0].confmatchtype,
      deferrable: rows[0].condeferrable,
      deferred: rows[0].condeferred,
      validated: rows[0].convalidated,
      nullable: rows[0].nullable,
    },
    {
      name: "counselors_store_id_fkey",
      update: "a",
      delete: "n",
      match: "s",
      deferrable: false,
      deferred: false,
      validated: true,
      nullable: true,
    },
  );
  assert.match(rows[0].definition, /ON DELETE SET NULL/);
  assert.equal(
    (
      await db.query(`
        select count(*)::int as count
        from public.stores
        where id::text like 'ffffffff-ffff-4fff-8fff-ffffffffd%'
      `)
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(`
        select count(*)::int as count
        from public.counselors
        where id::text like 'ffffffff-ffff-4fff-8fff-ffffffffd%'
      `)
    ).rows[0].count,
    0,
  );
}

async function runSuccessScenario(hasUser) {
  const expectedMode = hasUser ? "existing_user" : "profileless";
  const expectedDescription = hasUser
    ? "기존 일반 회원 ID를 사용한 DB 역할/RLS 검사(실제 로그인 검증 아님)"
    : "프로필 없는 비관리자 인증 역할을 사용한 DB RLS 검사(실제 일반 회원 로그인·Auth 세션 검증 아님)";
  const { db, run } = await createModel({ hasUser });
  try {
    const beforeData = await dataState(db);
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
      /^STORES_DELETE_PREFLIGHT_OK: 검사 \d+개 통과/,
    );
    const baseline = JSON.parse(success.detail);
    assert.equal(baseline.format, "stores-delete-preflight-v1");
    assert.equal(baseline.eligible, true);
    assert.equal(baseline.non_admin_mode, expectedMode);
    assert.equal(baseline.state.stores_rows.count, 2);
    assert.equal(baseline.state.counselors_rows.count, 6);
    assert.equal(baseline.state.profiles_rows.count, hasUser ? 2 : 1);
    assert.equal(baseline.state.target_fk.delete_action, "n");
    assert.equal(baseline.state.target_fk.store_id_nullable, true);
    assert.equal(baseline.test_ids.length, 10);
    assert.ok(success.message.includes(expectedDescription));
    assert.ok(
      success.message.includes(
        "대상 RESTRICT 제약의 삭제 거부 SQLSTATE는 23001·23503만 허용",
      ),
    );
    assert.ok(success.message.includes("실제 다중 연결 경쟁 재현은 아님"));
    assert.doesNotMatch(
      JSON.stringify(baseline),
      /상담사 A|관리자@example|admin@example|회원/,
    );

    const rollbackResult = await run(withBaseline(baseline));
    assert.equal(
      rollbackResult.at(-1).rows[0].result,
      "STORES_DELETE_ROLLBACK_OK",
    );
    await assertRolledBack(db, beforeData);
    console.log(success.message);
    console.log(
      `STORES_DELETE_ROLLBACK_OK: ${expectedMode} 계정·profile·매장·상담사·SET NULL FK 원본 일치`,
    );
    console.log(
      "STORES_DELETE_COMPATIBILITY_BRANCHES_OK: 23001·23503 허용과 다른 제약·권한·기타 오류 거부는 합성 진단값으로 검사",
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
    /^STORES_DELETE_ROLLBACK_BASELINE_REQUIRED/,
  );
  const wrongFormat = {
    ...existingUser.baseline,
    format: "stores-delete-preflight-v0",
  };
  await expectError(
    existingUser.run,
    withBaseline(wrongFormat),
    "P0001",
    /^STORES_DELETE_ROLLBACK_BASELINE_REQUIRED/,
  );

  await existingUser.run(migration);
  const restricted = await fkState(existingUser.db);
  assert.equal(restricted.length, 1);
  assert.equal(restricted[0].confdeltype, "r");
  assert.equal(restricted[0].nullable, true);
  assert.match(restricted[0].definition, /ON DELETE RESTRICT/);

  await existingUser.run(`
    insert into public.stores (id, slug, name, is_active)
    values
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeee0001', 'model-empty', '테스트 빈 매장', false),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeee0002', 'model-linked', '테스트 연결 매장', false);
    insert into public.counselors (
      id, slug, store_id, name, field, fields, is_active
    ) values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeee0101',
      'model-linked-counselor',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
      '테스트 연결 상담사',
      'tarot',
      array['tarot'],
      false
    );
    delete from public.stores
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
  `);
  const restrictError = await expectError(
    existingUser.run,
    "delete from public.stores where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002'",
    "23001",
    /violates RESTRICT setting of foreign key constraint/,
  );
  console.log(
    `STORES_DELETE_PGLITE_RESTRICT_SQLSTATE: ${restrictError.code} (격리 엔진의 실제 DELETE 결과)`,
  );
  assert.equal(
    (
      await existingUser.db.query(`
        select store_id
        from public.counselors
        where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0101'
      `)
    ).rows[0].store_id,
    "eeeeeeee-eeee-4eee-8eee-eeeeeeee0002",
  );
  await existingUser.run(`
    update public.counselors
    set store_id = null
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0101';
    delete from public.stores
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002';
  `);
  await expectError(
    existingUser.run,
    preflight,
    "P0001",
    /^STORES_DELETE_PREFLIGHT_PREREQUISITE_FAILED: counselors_store_id_fkey가 예상한 NULL 허용·SET NULL 구조가 아닙니다/,
  );
  await existingUser.run("rollback");
  await expectError(
    existingUser.run,
    withBaseline(existingUser.baseline),
    "P0001",
    /^STORES_DELETE_ROLLBACK_FAILED: 기존 행·FK·정책·권한·트리거 불일치/,
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
  console.log(`STORES_DELETE_MODEL_COUNT: ${profileless.count}`);
} finally {
  await profileless.db.close();
}

const wrongPredecessor = await createModel();
try {
  const beforeData = await dataState(wrongPredecessor.db);
  await wrongPredecessor.run(`
    alter table public.counselors
      drop constraint counselors_store_id_fkey,
      add constraint counselors_store_id_fkey
      foreign key (store_id) references public.stores(id) on delete cascade;
  `);
  await expectError(
    wrongPredecessor.run,
    migration,
    "P0001",
    /^STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors_store_id_fkey가 예상한 NULL 허용·SET NULL 구조가 아닙니다/,
  );
  const state = await fkState(wrongPredecessor.db);
  assert.equal(state.length, 1);
  assert.equal(state[0].confdeltype, "c");
  assert.deepEqual(await dataState(wrongPredecessor.db), beforeData);
} finally {
  await wrongPredecessor.db.close();
}

const duplicateFk = await createModel();
try {
  await duplicateFk.run(`
    alter table public.counselors
      add constraint counselors_store_id_duplicate_fkey
      foreign key (store_id) references public.stores(id) on delete set null;
  `);
  await expectError(
    duplicateFk.run,
    migration,
    "P0001",
    /^STORES_DELETE_RESTRICT_PREREQUISITE_FAILED: counselors\.store_id FK가 1개여야 하지만 2개입니다/,
  );
  assert.equal((await fkState(duplicateFk.db)).length, 2);
} finally {
  await duplicateFk.db.close();
}

console.log(
  "PASS: existing_user/profileless PostgreSQL models, interrupted transaction recovery, RESTRICT/NULL/store move behavior, role/RLS checks, rollback baseline, wrong predecessor and duplicate FK rejection. No live Supabase, concurrent multi-connection, or Storage access.",
);
