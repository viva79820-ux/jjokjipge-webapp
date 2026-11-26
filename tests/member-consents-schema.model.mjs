// 실행: node tests/member-consents-schema.model.mjs
// 임시 PGlite에서 member_consents의 CHECK·RLS·GRANT·cascade·rollback을 검사한다.
// 실제 Supabase, 실제 회원, 실제 로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.MEMBER_CONSENTS_PGLITE_MODULE ||
    "../node_modules/.cache/member-consents-pg-runtime/node_modules/@electric-sql/pglite/dist/index.js"
);
const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const migration = read(
  "../supabase/migrations/20261125012910_member_consents.sql",
);
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

async function expectError(run, sql, code, pattern) {
  try {
    await run(sql);
  } catch (error) {
    assert.equal(error.code, code, error.message);
    assert.match(error.message, pattern);
    return;
  }
  throw new Error("예상한 데이터베이스 오류가 발생하지 않았습니다.");
}

const db = new PGlite();
const run = (sql) => db.exec(sql);

try {
  await run(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;

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

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      name text
    );
    alter table public.profiles enable row level security;
  `);

  const baseline = await db.query(`
    select jsonb_build_object(
      'tables', (
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ),
      'profiles', (select count(*) from public.profiles),
      'users', (select count(*) from auth.users)
    ) as value
  `);

  await run(migration);

  const catalog = await db.query(`
    select
      c.relrowsecurity,
      (
        select count(*)
        from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = 'member_consents'
      ) as policy_count,
      has_table_privilege('authenticated', 'public.member_consents', 'SELECT') as member_select,
      has_table_privilege('authenticated', 'public.member_consents', 'INSERT') as member_insert,
      has_table_privilege('service_role', 'public.member_consents', 'INSERT') as server_insert,
      has_table_privilege('service_role', 'public.member_consents', 'UPDATE') as server_update,
      (
        select x.confdeltype = 'c'
        from pg_constraint x
        where x.conrelid = 'public.member_consents'::regclass
          and x.contype = 'f'
      ) as cascade_delete
    from pg_class c
    where c.oid = 'public.member_consents'::regclass
  `);
  assert.deepEqual(catalog.rows[0], {
    relrowsecurity: true,
    policy_count: 1,
    member_select: true,
    member_insert: false,
    server_insert: true,
    server_update: false,
    cascade_delete: true,
  });

  await run(`
    insert into auth.users (id, email, raw_user_meta_data)
    values
      ('${userA}', 'a@example.invalid', '{}'::jsonb),
      ('${userB}', 'b@example.invalid', '{}'::jsonb);

    set role service_role;
    insert into public.member_consents (user_id)
    values ('${userA}');
    reset role;
  `);

  const stored = await db.query(`
    select
      user_id,
      terms_version,
      privacy_version,
      agreed_at is not null as has_agreed_at
    from public.member_consents
  `);
  assert.deepEqual(stored.rows, [
    {
      user_id: userA,
      terms_version: "1.0",
      privacy_version: "1.0",
      has_agreed_at: true,
    },
  ]);

  await run(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${userA}', false);
  `);
  const own = await db.query(
    "select user_id from public.member_consents order by user_id",
  );
  assert.deepEqual(own.rows, [{ user_id: userA }]);

  await run(`select set_config('request.jwt.claim.sub', '${userB}', false);`);
  const other = await db.query("select user_id from public.member_consents");
  assert.deepEqual(other.rows, []);
  await expectError(
    run,
    `insert into public.member_consents (user_id) values ('${userB}')`,
    "42501",
    /permission denied/,
  );
  await expectError(
    run,
    `update public.member_consents set agreed_at = now() where user_id = '${userA}'`,
    "42501",
    /permission denied/,
  );
  await expectError(
    run,
    `delete from public.member_consents where user_id = '${userA}'`,
    "42501",
    /permission denied/,
  );
  await run("reset role;");

  await run("set role anon;");
  await expectError(
    run,
    "select * from public.member_consents",
    "42501",
    /permission denied/,
  );
  await run("reset role;");

  await run("set role service_role;");
  await expectError(
    run,
    `insert into public.member_consents (user_id, terms_version)
     values ('${userB}', '2.0')`,
    "23514",
    /member_consents_terms_version_check/,
  );
  await expectError(
    run,
    `insert into public.member_consents (user_id, privacy_version)
     values ('${userB}', '2.0')`,
    "23514",
    /member_consents_privacy_version_check/,
  );
  await expectError(
    run,
    `update public.member_consents set agreed_at = now() where user_id = '${userA}'`,
    "42501",
    /permission denied/,
  );
  await expectError(
    run,
    `delete from public.member_consents where user_id = '${userA}'`,
    "42501",
    /permission denied/,
  );
  await run("reset role;");

  await run(`delete from auth.users where id = '${userA}';`);
  const cascaded = await db.query(
    "select count(*)::integer as count from public.member_consents",
  );
  assert.equal(cascaded.rows[0].count, 0);

  await run(`delete from auth.users where id = '${userB}';`);
  await run("drop table public.member_consents;");
  const rolledBack = await db.query(`
    select jsonb_build_object(
      'tables', (
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ),
      'profiles', (select count(*) from public.profiles),
      'users', (select count(*) from auth.users)
    ) as value
  `);
  assert.deepEqual(rolledBack.rows[0].value, baseline.rows[0].value);

  console.log("member consents schema model checks passed");
} finally {
  await db.close();
}
