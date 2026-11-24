// 실행: node tests/class-delivery-mode-schema.model.mjs
// 임시 캐시의 PGlite에서 실제 PostgreSQL CHECK·기존 행 보존·롤백을 검사한다.
// 실제 Supabase Data API·Storage API·로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.CLASS_DELIVERY_MODE_PGLITE_MODULE ||
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
const baseMigrations = [
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
const posterMigration = read(
  "../supabase/migrations/20261123031448_class_poster_schema.sql",
);
const migration = read(
  "../supabase/migrations/20261124003530_add_class_delivery_mode.sql",
);
const preflight = read("../supabase/tests/class_delivery_mode_preflight.sql");
const rollback = read(
  "../supabase/tests/class_delivery_mode_rollback_check.sql",
);
const pgliteConstraintSnapshot =
  "      and c.conname <> 'classes_published_video_url_check'";
const pgliteConstraintSnapshotWithNotNull = `${pgliteConstraintSnapshot}
      and not (
        c.contype = 'n'
        and pg_get_constraintdef(c.oid, true) = 'NOT NULL is_online'
      )`;
const forPGlite = (source) => {
  assert.equal(
    source.split(pgliteConstraintSnapshot).length - 1,
    1,
    "PGlite snapshot compatibility replacement count",
  );
  return source.replace(
    pgliteConstraintSnapshot,
    pgliteConstraintSnapshotWithNotNull,
  );
};
// 이 PGlite는 NOT NULL을 pg_constraint(contype='n')에도 표시한다.
// 운영 PostgreSQL snapshot은 새 열을 pg_attribute에서 제외하므로 모형에서도 같은 신규 제약만 제외한다.
const runtimePreflight = forPGlite(preflight);
const runtimeRollback = forPGlite(rollback);
const withBaseline = (baseline) =>
  runtimeRollback.replace(
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
  for (const source of baseMigrations) {
    await run(source);
  }
  await run(`
    insert into public.classes (
      id,
      title,
      description,
      field,
      video_url,
      is_published,
      sort_order,
      created_at,
      updated_at
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
      '1234',
      '1234',
      'saju',
      'https://www.youtube.com/',
      true,
      0,
      '2026-11-19 00:00:00+00',
      '2026-11-19 00:00:00+00'
    );
    insert into storage.objects (id, bucket_id, name, metadata)
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd0002',
      'public-images',
      'notices/existing.webp',
      '{"mimetype":"image/webp"}'
    );
  `);
  await run(posterMigration);

  return { db, run };
}

async function preservedState(db) {
  return (
    await db.query(`
      select jsonb_build_object(
        'classes', (
          select coalesce(
            jsonb_agg((to_jsonb(t) - 'is_online') order by id),
            '[]'::jsonb
          )
          from public.classes t
        ),
        'class_rls', (
          select to_jsonb(t)
          from (
            select relrowsecurity, relforcerowsecurity, relowner
            from pg_class
            where oid = 'public.classes'::regclass
          ) t
        ),
        'class_policies', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by policyname),
            '[]'::jsonb
          )
          from pg_policies t
          where schemaname = 'public'
            and tablename = 'classes'
        ),
        'class_table_grants', (
          select coalesce(
            jsonb_agg(
              to_jsonb(t)
              order by grantee::text, grantor::text, privilege_type
            ),
            '[]'::jsonb
          )
          from (
            select
              x.grantor,
              x.grantee,
              x.privilege_type,
              x.is_grantable
            from pg_class c
            cross join lateral aclexplode(c.relacl) x
            where c.oid = 'public.classes'::regclass
          ) t
        ),
        'class_existing_column_grants', (
          select coalesce(
            jsonb_agg(
              to_jsonb(t)
              order by attnum, grantee::text, grantor::text, privilege_type
            ),
            '[]'::jsonb
          )
          from (
            select
              a.attnum,
              a.attname,
              x.grantor,
              x.grantee,
              x.privilege_type,
              x.is_grantable
            from pg_attribute a
            cross join lateral aclexplode(a.attacl) x
            where a.attrelid = 'public.classes'::regclass
              and a.attnum > 0
              and not a.attisdropped
              and a.attname <> 'is_online'
          ) t
        ),
        'storage_policies', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by policyname),
            '[]'::jsonb
          )
          from pg_policies t
          where schemaname = 'storage'
            and tablename = 'objects'
        )
      ) as snapshot
    `)
  ).rows[0].snapshot;
}

async function deliveryCatalog(db) {
  return (
    await db.query(`
      select
        (
          select count(*)::int
          from pg_attribute
          where attrelid = 'public.classes'::regclass
            and attname = 'is_online'
            and attnum > 0
            and not attisdropped
        ) as columns,
        (
          select format_type(a.atttypid, a.atttypmod)
          from pg_attribute a
          where a.attrelid = 'public.classes'::regclass
            and a.attname = 'is_online'
            and a.attnum > 0
            and not a.attisdropped
        ) as data_type,
        (
          select a.attnotnull
          from pg_attribute a
          where a.attrelid = 'public.classes'::regclass
            and a.attname = 'is_online'
            and a.attnum > 0
            and not a.attisdropped
        ) as not_null,
        (
          select pg_get_expr(d.adbin, d.adrelid)
          from pg_attribute a
          join pg_attrdef d
            on d.adrelid = a.attrelid
            and d.adnum = a.attnum
          where a.attrelid = 'public.classes'::regclass
            and a.attname = 'is_online'
            and a.attnum > 0
            and not a.attisdropped
        ) as default_expression,
        (
          select pg_get_constraintdef(c.oid, true)
          from pg_constraint c
          where c.conrelid = 'public.classes'::regclass
            and c.conname = 'classes_published_video_url_check'
            and c.convalidated
        ) as published_constraint
    `)
  ).rows[0];
}

async function existingClass(db) {
  return (
    await db.query(`
      select to_jsonb(t) as value
      from public.classes t
      where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001'
    `)
  ).rows[0].value;
}

const model = await createModel();
try {
  const before = await preservedState(model.db);
  const beforeClass = await existingClass(model.db);
  const beforeCatalog = await deliveryCatalog(model.db);
  assert.equal(beforeCatalog.columns, 0);
  assert.match(
    beforeCatalog.published_constraint.toLowerCase(),
    /not is_published/,
  );
  assert.doesNotMatch(
    beforeCatalog.published_constraint.toLowerCase(),
    /is_online/,
  );
  assert.equal(beforeClass.title, "1234");
  assert.equal(beforeClass.description, "1234");
  assert.equal(beforeClass.field, "saju");
  assert.equal(beforeClass.video_url, "https://www.youtube.com/");
  assert.equal(beforeClass.is_published, true);
  assert.equal(beforeClass.sort_order, 0);
  assert.equal(beforeClass.poster_path, null);
  assert.equal(beforeClass.poster_alt, null);

  const success = await expectError(
    model.run,
    runtimePreflight,
    "P0001",
    /^CLASS_DELIVERY_MODE_PREFLIGHT_OK: 검사 \d+개 통과/,
  );
  const baseline = JSON.parse(success.detail);
  assert.equal(baseline.format, "class-delivery-mode-preflight-v1");
  assert.equal(baseline.eligible, true);
  assert.equal(baseline.test_ids.length, 2);
  assert.ok(success.message.includes("공개 오프라인 영상 NULL 허용"));
  assert.ok(success.message.includes("공개 온라인 HTTPS 영상 필수"));

  const rollbackResult = await model.run(withBaseline(baseline));
  assert.equal(
    rollbackResult.at(-1).rows[0].result,
    "CLASS_DELIVERY_MODE_ROLLBACK_OK",
  );
  assert.deepEqual(await preservedState(model.db), before);
  assert.deepEqual(await existingClass(model.db), beforeClass);

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
  const atomicRollbackCatalog = await deliveryCatalog(model.db);
  assert.equal(atomicRollbackCatalog.columns, 0);
  assert.equal(
    atomicRollbackCatalog.published_constraint,
    beforeCatalog.published_constraint,
  );
  assert.deepEqual(await preservedState(model.db), before);
  assert.deepEqual(await existingClass(model.db), beforeClass);

  await model.run(migration);
  const catalog = await deliveryCatalog(model.db);
  assert.equal(catalog.columns, 1);
  assert.equal(catalog.data_type, "boolean");
  assert.equal(catalog.not_null, true);
  assert.ok(
    ["true", "true::boolean"].includes(catalog.default_expression),
    catalog.default_expression,
  );
  assert.match(catalog.published_constraint.toLowerCase(), /not is_published/);
  assert.match(catalog.published_constraint.toLowerCase(), /not is_online/);
  assert.match(
    catalog.published_constraint.toLowerCase(),
    /video_url is not null/,
  );

  const afterClass = await existingClass(model.db);
  assert.equal(afterClass.is_online, true);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(afterClass).filter(([key]) => key !== "is_online"),
    ),
    beforeClass,
  );
  assert.deepEqual(await preservedState(model.db), before);

  await model.run(`
    insert into public.classes (
      id,
      title,
      description,
      field,
      is_online,
      is_published
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd1001',
      '공개 오프라인 클래스',
      '영상 없는 오프라인 클래스',
      'saju',
      false,
      true
    );
  `);
  assert.deepEqual(
    (
      await model.db.query(`
        select is_online, is_published, video_url
        from public.classes
        where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd1001'
      `)
    ).rows[0],
    { is_online: false, is_published: true, video_url: null },
  );

  await expectError(
    model.run,
    `insert into public.classes (
       title, description, field, is_online, is_published
     )
     values (
       '공개 온라인 클래스', '영상 없음', 'tarot', true, true
     )`,
    "23514",
    /classes_published_video_url_check/,
  );
  await expectError(
    model.run,
    `insert into public.classes (
       title, description, field, video_url, is_online, is_published
     )
     values (
       '공개 온라인 클래스',
       '잘못된 영상 주소',
       'tarot',
       'http://example.invalid/video',
       true,
       true
     )`,
    "23514",
    /classes_video_url_check/,
  );

  await model.run(`
    insert into public.classes (
      id,
      title,
      description,
      field,
      video_url,
      is_online,
      is_published
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd1002',
      '공개 온라인 클래스',
      '유효한 영상 주소',
      'tarot',
      'https://example.invalid/video?id=delivery-test',
      true,
      true
    );
  `);
  assert.deepEqual(
    (
      await model.db.query(`
        select is_online, is_published, video_url
        from public.classes
        where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd1002'
      `)
    ).rows[0],
    {
      is_online: true,
      is_published: true,
      video_url: "https://example.invalid/video?id=delivery-test",
    },
  );

  await expectError(
    model.run,
    migration,
    "P0001",
    /^CLASS_DELIVERY_MODE_ALREADY_EXISTS/,
  );

  console.log(success.message);
  console.log(
    "CLASS_DELIVERY_MODE_ROLLBACK_OK: 기존 클래스·포스터·RLS·정책·권한·Storage 정책 원본 일치",
  );
} finally {
  await model.db.close();
}

console.log(
  "PASS: 격리 PostgreSQL 모형에서 선행 포스터 마이그레이션, 기존 공개 온라인 행 보존, 온라인·오프라인 CHECK, 원자적 실패, baseline 롤백, 정책·권한 보존을 검증했습니다.",
);
