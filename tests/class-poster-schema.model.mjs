// 실행: node tests/class-poster-schema.model.mjs
// 임시 캐시의 PGlite에서 실제 PostgreSQL CHECK·기존 행 보존·롤백을 검사한다.
// 실제 Supabase Storage API·파일·로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.CLASS_POSTER_PGLITE_MODULE ||
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
  read("../supabase/migrations/20261119010000_shop_products_schema.sql"),
];
const migration = read(
  "../supabase/migrations/20261123031448_class_poster_schema.sql",
);
const preflight = read("../supabase/tests/class_poster_preflight.sql");
const rollback = read("../supabase/tests/class_poster_rollback_check.sql");
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

async function createModel() {
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
    insert into public.classes (
      id,
      title,
      description,
      field,
      video_url,
      is_published
    )
    values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
      '기존 클래스',
      '기존 설명',
      'saju',
      'https://example.invalid/existing',
      true
    );
    insert into storage.objects (id, bucket_id, name, metadata)
    values (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
      'public-images',
      'notices/existing.webp',
      '{"mimetype":"image/webp"}'
    );
  `);

  return { db, run };
}

async function businessState(db) {
  return (
    await db.query(`
      select jsonb_build_object(
        'classes', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from public.classes t
        ),
        'bucket', (
          select to_jsonb(t)
          from storage.buckets t
          where id = 'public-images'
        ),
        'objects', (
          select coalesce(jsonb_agg(to_jsonb(t) order by id), '[]'::jsonb)
          from storage.objects t
        ),
        'policies', (
          select coalesce(jsonb_agg(to_jsonb(t) order by policyname), '[]'::jsonb)
          from pg_policies t
          where schemaname = 'storage'
            and tablename = 'objects'
        )
      ) as snapshot
    `)
  ).rows[0].snapshot;
}

async function posterCatalog(db) {
  return (
    await db.query(`
      select
        (
          select count(*)::int
          from pg_attribute
          where attrelid = 'public.classes'::regclass
            and attname in ('poster_path', 'poster_alt')
            and attnum > 0
            and not attisdropped
        ) as columns,
        (
          select count(*)::int
          from pg_constraint
          where conrelid = 'public.classes'::regclass
            and conname in (
              'classes_poster_path_check',
              'classes_poster_alt_check',
              'classes_poster_requires_alt_check'
            )
        ) as constraints
    `)
  ).rows[0];
}

const model = await createModel();
try {
  const before = await businessState(model.db);
  const success = await expectError(
    model.run,
    preflight,
    "P0001",
    /^CLASS_POSTER_PREFLIGHT_OK: 검사 \d+개 통과/,
  );
  const baseline = JSON.parse(success.detail);
  assert.equal(baseline.format, "class-poster-preflight-v1");
  assert.equal(baseline.eligible, true);
  assert.equal(baseline.test_ids.length, 5);
  assert.ok(success.message.includes("포스터 없는 행 허용"));

  const rollbackResult = await model.run(withBaseline(baseline));
  assert.equal(
    rollbackResult.at(-1).rows[0].result,
    "CLASS_POSTER_ROLLBACK_OK",
  );
  assert.deepEqual(await businessState(model.db), before);

  await expectError(
    model.run,
    `begin;
${migration}
do $$ begin
  raise exception using errcode = 'P0001', message = 'MODEL_ATOMIC_FAILURE';
end $$;
commit;`,
    "P0001",
    /^MODEL_ATOMIC_FAILURE$/,
  );
  await model.run("rollback");
  assert.deepEqual(await posterCatalog(model.db), {
    columns: 0,
    constraints: 0,
  });
  assert.deepEqual(await businessState(model.db), before);

  await model.run(migration);
  assert.deepEqual(await posterCatalog(model.db), {
    columns: 2,
    constraints: 3,
  });
  assert.deepEqual(
    (
      await model.db.query(`
        select poster_path, poster_alt
        from public.classes
        where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001'
      `)
    ).rows[0],
    { poster_path: null, poster_alt: null },
  );
  await model.run(`
    update public.classes
    set description = '포스터 없이 수정'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
  `);
  await expectError(
    model.run,
    `update public.classes
     set poster_path = 'products/123e4567-e89b-42d3-a456-426614174000.webp',
         poster_alt = '잘못된 경로'
     where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001'`,
    "23514",
    /classes_poster_path_check/,
  );
  await expectError(
    model.run,
    `update public.classes
     set poster_path = 'classes/123e4567-e89b-42d3-a456-426614174000.webp',
         poster_alt = null
     where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001'`,
    "23514",
    /classes_poster_requires_alt_check/,
  );
  await model.run(`
    update public.classes
    set poster_path = 'classes/123e4567-e89b-42d3-a456-426614174000.webp',
        poster_alt = '정상 포스터'
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001';
  `);
  assert.deepEqual(
    (
      await model.db.query(`
        select poster_path, poster_alt
        from public.classes
        where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001'
      `)
    ).rows[0],
    {
      poster_path: "classes/123e4567-e89b-42d3-a456-426614174000.webp",
      poster_alt: "정상 포스터",
    },
  );
  await expectError(
    model.run,
    migration,
    "P0001",
    /^CLASS_POSTER_SCHEMA_ALREADY_EXISTS/,
  );

  console.log(success.message);
  console.log(
    "CLASS_POSTER_ROLLBACK_OK: 기존 클래스·Storage 원본 일치, 포스터 열·제약·검사 행 없음",
  );
} finally {
  await model.db.close();
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
    /^CLASS_POSTER_PREFLIGHT_PREREQUISITE_FAILED: classes\/를 포함하는 기존 Storage 관리자 정책 필요$/,
  );
  await wrongStorage.run("rollback");
  assert.deepEqual(await posterCatalog(wrongStorage.db), {
    columns: 0,
    constraints: 0,
  });
} finally {
  await wrongStorage.db.close();
}

console.log(
  "PASS: 격리 PostgreSQL 모형에서 기존 행 보존, 포스터 NULL 허용, 경로·대체 설명 CHECK, 원자적 실패, baseline 롤백, Storage 정책 거부를 검증했습니다.",
);
