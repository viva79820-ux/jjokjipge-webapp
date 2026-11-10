// 실행: node tests/notices-popup-schema.model.mjs
// 임시 캐시의 PGlite만 사용하며 실제 DB·Storage API에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.NOTICES_PGLITE_MODULE ||
    "../node_modules/.cache/notices-pg-runtime/node_modules/@electric-sql/pglite/dist/index.js"
);
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const reservations = read(
  "../supabase/migrations/20261102035714_reservations_schema.sql",
);
const notices = read(
  "../supabase/migrations/20261109010000_notices_schema.sql",
);
const popupMigration = read(
  "../supabase/migrations/20261110010000_notices_popup_setting.sql",
);
const preflight = read("../supabase/tests/notices_popup_preflight.sql");
const rollback = read("../supabase/tests/notices_popup_rollback_check.sql");

const reservationFunction = (name) => {
  const start = reservations.indexOf(`create function private.${name}()`);
  assert.ok(start >= 0);
  return reservations.slice(start, reservations.indexOf("$$;", start) + 3);
};
const withBaseline = (baseline) =>
  rollback.replace(
    "baseline jsonb := null;",
    `baseline jsonb := '${JSON.stringify(baseline).replaceAll("'", "''")}'::jsonb;`,
  );

const db = new PGlite();
const run = (sql) => db.exec(sql);
async function expectError(sql, code, pattern) {
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
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb
    );
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      name text,
      phone text,
      role text not null default 'user' check (role in ('user', 'admin')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    ${reservationFunction("set_updated_at")}
    ${reservationFunction("is_admin")}
    ${reservationFunction("handle_new_user")}
    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function private.handle_new_user();
    grant usage on schema auth, private, public, storage to anon, authenticated;
    revoke all on function private.is_admin() from public;
    grant execute on function private.is_admin() to anon, authenticated;

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
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  await run(notices);
  await run(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('10000000-0000-4000-8000-000000000001', 'admin@example.invalid', '{"name":"관리자"}'),
      ('10000000-0000-4000-8000-000000000002', 'user@example.invalid', '{"name":"회원"}');
    update public.profiles
    set role = 'admin'
    where id = '10000000-0000-4000-8000-000000000001';
    insert into public.notices (
      id,
      title,
      body,
      image_path,
      image_alt,
      is_pinned,
      is_published,
      published_at,
      created_at,
      updated_at
    ) values
      (
        '20000000-0000-4000-8000-000000000001',
        '기존 공개 공지',
        '기존 공개 본문',
        'notices/22222222-2222-4222-8222-222222222222.webp',
        '기존 이미지',
        true,
        true,
        '2026-11-09 00:00:00+00',
        '2026-11-09 00:00:00+00',
        '2026-11-09 00:00:00+00'
      ),
      (
        '20000000-0000-4000-8000-000000000002',
        '기존 비공개 공지',
        '기존 비공개 본문',
        null,
        null,
        false,
        false,
        null,
        '2026-11-09 01:00:00+00',
        '2026-11-09 01:00:00+00'
      );
  `);

  const beforeRows = (
    await db.query(
      "select jsonb_agg(to_jsonb(n) order by id) as rows from public.notices n",
    )
  ).rows[0].rows;
  const success = await expectError(
    preflight,
    "P0001",
    /^NOTICES_POPUP_PREFLIGHT_OK: 검사 \d+개 통과/,
  );
  const baseline = JSON.parse(success.detail);
  assert.equal(baseline.format, "notices-popup-preflight-v1");
  assert.equal(baseline.eligible, true);
  assert.equal(baseline.state.rows.count, 2);
  assert.equal(baseline.test_ids.length, 8);
  assert.doesNotMatch(JSON.stringify(baseline), /기존 공개|기존 비공개/);

  const rollbackResult = await run(withBaseline(baseline));
  assert.equal(
    rollbackResult.at(-1).rows[0].result,
    "NOTICES_POPUP_ROLLBACK_OK",
  );
  const rolledBack = (
    await db.query(`
      select
        exists (
          select 1
          from pg_attribute
          where attrelid = 'public.notices'::regclass
            and attname = 'is_popup'
            and not attisdropped
        ) as has_popup,
        (select count(*)::int from public.notices) as notice_count,
        (select count(*)::int from public.profiles) as profile_count
    `)
  ).rows[0];
  assert.deepEqual(rolledBack, {
    has_popup: false,
    notice_count: 2,
    profile_count: 2,
  });
  assert.deepEqual(
    (
      await db.query(
        "select jsonb_agg(to_jsonb(n) order by id) as rows from public.notices n",
      )
    ).rows[0].rows,
    beforeRows,
  );
  assert.equal(
    (
      await db.query(`
        select count(*)::int as count
        from public.notices
        where id = any(array[
          'ffffffff-ffff-4fff-8fff-fffffffff001'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff002'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff003'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff010'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff011'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff012'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff020'::uuid,
          'ffffffff-ffff-4fff-8fff-fffffffff030'::uuid
        ])
      `)
    ).rows[0].count,
    0,
  );

  await expectError(
    rollback,
    "P0001",
    /^NOTICES_POPUP_ROLLBACK_BASELINE_REQUIRED/,
  );
  await run(popupMigration);
  assert.deepEqual(
    (await db.query("select id, is_popup from public.notices order by id"))
      .rows,
    [
      { id: "20000000-0000-4000-8000-000000000001", is_popup: false },
      { id: "20000000-0000-4000-8000-000000000002", is_popup: false },
    ],
  );
  await expectError(
    preflight,
    "P0001",
    /^NOTICES_POPUP_PREFLIGHT_ALREADY_APPLIED/,
  );
  await run("rollback");
  await expectError(
    withBaseline(baseline),
    "P0001",
    /^NOTICES_POPUP_ROLLBACK_FAILED: public\.notices\.is_popup 잔존/,
  );

  console.log(success.message);
  console.log(
    "NOTICES_POPUP_ROLLBACK_OK: baseline 비교와 기존 행·계정·검사 자료 롤백 확인",
  );
  console.log(
    "PASS: isolated PostgreSQL model, exact popup migration, role/RLS behavior, rollback baseline, already-applied rejection. No live Supabase or Storage access.",
  );
} finally {
  await db.close();
}
