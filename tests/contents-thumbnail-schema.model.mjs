// 실행: node tests/contents-thumbnail-schema.model.mjs
// 임시 캐시의 PGlite에서 실제 PostgreSQL CHECK·인덱스 교체·기존 상태 보존·롤백을 검사한다.
// 실제 Supabase Storage API·파일·로그인 세션에는 접근하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.CONTENTS_THUMBNAIL_PGLITE_MODULE ||
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
  read("../supabase/migrations/20261123024258_remove_dummy_counselors.sql"),
  read("../supabase/migrations/20261123031448_class_poster_schema.sql"),
  read("../supabase/migrations/20261124003530_add_class_delivery_mode.sql"),
];
const migration = read(
  "../supabase/migrations/20261124030951_contents_thumbnail_fields.sql",
);
const preflight = read("../supabase/tests/contents_thumbnail_preflight.sql");
const rollback = read(
  "../supabase/tests/contents_thumbnail_rollback_check.sql",
);
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
  for (const source of baseMigrations) {
    await run(source);
  }
  await run(`
    insert into public.contents (
      id,
      title,
      description,
      channel,
      external_url,
      is_published,
      sort_order,
      created_at,
      updated_at
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
      '기존 콘텐츠',
      '기존 설명',
      'blog',
      'https://example.invalid/existing',
      true,
      3,
      '2026-11-20 00:00:00+00',
      '2026-11-20 00:00:00+00'
    );
    insert into storage.objects (id, bucket_id, name, metadata)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002',
      'public-images',
      'notices/existing.webp',
      '{"mimetype":"image/webp"}'
    );
  `);

  return { db, run };
}

async function preservedState(db) {
  return (
    await db.query(`
      select jsonb_build_object(
        'contents', (
          select coalesce(
            jsonb_agg(
              (
                to_jsonb(t)
                - 'thumbnail_path'
                - 'thumbnail_alt'
                - 'posted_on'
              )
              order by id
            ),
            '[]'::jsonb
          )
          from public.contents t
        ),
        'contents_rls', (
          select to_jsonb(t)
          from (
            select relrowsecurity, relforcerowsecurity, relowner
            from pg_class
            where oid = 'public.contents'::regclass
          ) t
        ),
        'contents_policies', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by policyname),
            '[]'::jsonb
          )
          from pg_policies t
          where schemaname = 'public'
            and tablename = 'contents'
        ),
        'contents_triggers', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by tgname),
            '[]'::jsonb
          )
          from (
            select tgname, tgenabled, pg_get_triggerdef(oid, true) as definition
            from pg_trigger
            where tgrelid = 'public.contents'::regclass
              and not tgisinternal
          ) t
        ),
        'contents_grants', (
          select coalesce(
            jsonb_agg(
              to_jsonb(t)
              order by grantee::text, grantor::text, privilege_type
            ),
            '[]'::jsonb
          )
          from (
            select x.grantor, x.grantee, x.privilege_type, x.is_grantable
            from pg_class c
            cross join lateral aclexplode(c.relacl) x
            where c.oid = 'public.contents'::regclass
          ) t
        ),
        'other_indexes', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by indexname),
            '[]'::jsonb
          )
          from pg_indexes t
          where schemaname = 'public'
            and tablename = 'contents'
            and indexname <> 'contents_published_sort_idx'
        ),
        'bucket', (
          select to_jsonb(t)
          from storage.buckets t
          where id = 'public-images'
        ),
        'objects', (
          select coalesce(
            jsonb_agg(to_jsonb(t) order by id),
            '[]'::jsonb
          )
          from storage.objects t
        ),
        'storagePolicies', (
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

async function thumbnailCatalog(db) {
  return (
    await db.query(`
      select
        (
          select count(*)::int
          from pg_attribute
          where attrelid = 'public.contents'::regclass
            and attname in ('thumbnail_path', 'thumbnail_alt', 'posted_on')
            and attnum > 0
            and not attisdropped
        ) as columns,
        (
          select count(*)::int
          from pg_constraint
          where conrelid = 'public.contents'::regclass
            and conname in (
              'contents_thumbnail_path_check',
              'contents_thumbnail_alt_check',
              'contents_thumbnail_requires_alt_check'
            )
        ) as constraints,
        (
          select indexdef
          from pg_indexes
          where schemaname = 'public'
            and tablename = 'contents'
            and indexname = 'contents_published_sort_idx'
        ) as index_definition
    `)
  ).rows[0];
}

const oldIndex =
  "CREATE INDEX contents_published_sort_idx ON public.contents USING btree (is_published, sort_order, created_at DESC, id DESC)";
const newIndex =
  "CREATE INDEX contents_published_sort_idx ON public.contents USING btree (is_published, sort_order, posted_on DESC NULLS LAST, id DESC)";

const model = await createModel();
try {
  const before = await preservedState(model.db);
  assert.deepEqual(await thumbnailCatalog(model.db), {
    columns: 0,
    constraints: 0,
    index_definition: oldIndex,
  });

  const success = await expectError(
    model.run,
    preflight,
    "P0001",
    /^CONTENTS_THUMBNAIL_PREFLIGHT_OK: 검사 \d+개 통과/,
  );
  const baseline = JSON.parse(success.detail);
  assert.equal(baseline.format, "contents-thumbnail-preflight-v1");
  assert.equal(baseline.eligible, true);
  assert.equal(baseline.test_ids.length, 6);
  assert.equal(baseline.state.contents_ordering_index.definition, oldIndex);
  assert.ok(success.message.includes("nullable 기존 행"));
  assert.ok(success.message.includes("정렬 인덱스 통과"));

  await expectError(
    model.run,
    rollback,
    "P0001",
    /^CONTENTS_THUMBNAIL_ROLLBACK_BASELINE_REQUIRED/,
  );
  const rollbackResult = await model.run(withBaseline(baseline));
  assert.equal(
    rollbackResult.at(-1).rows[0].result,
    "CONTENTS_THUMBNAIL_ROLLBACK_OK",
  );
  assert.deepEqual(await preservedState(model.db), before);
  assert.deepEqual(await thumbnailCatalog(model.db), {
    columns: 0,
    constraints: 0,
    index_definition: oldIndex,
  });

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
  assert.deepEqual(await thumbnailCatalog(model.db), {
    columns: 0,
    constraints: 0,
    index_definition: oldIndex,
  });
  assert.deepEqual(await preservedState(model.db), before);

  await model.run(migration);
  assert.deepEqual(await thumbnailCatalog(model.db), {
    columns: 3,
    constraints: 3,
    index_definition: newIndex,
  });
  assert.deepEqual(await preservedState(model.db), before);
  assert.deepEqual(
    (
      await model.db.query(`
        select thumbnail_path, thumbnail_alt, posted_on
        from public.contents
        where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'
      `)
    ).rows[0],
    { thumbnail_path: null, thumbnail_alt: null, posted_on: null },
  );

  await expectError(
    model.run,
    `update public.contents
     set thumbnail_path = 'products/123e4567-e89b-42d3-a456-426614174000.webp',
         thumbnail_alt = '잘못된 경로'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'`,
    "23514",
    /contents_thumbnail_path_check/,
  );
  await expectError(
    model.run,
    `update public.contents
     set thumbnail_path = 'contents/123e4567-e89b-42d3-a456-426614174000.webp',
         thumbnail_alt = null
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'`,
    "23514",
    /contents_thumbnail_requires_alt_check/,
  );
  await expectError(
    model.run,
    `update public.contents
     set thumbnail_alt = E' \\t\\n'
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'`,
    "23514",
    /contents_thumbnail_alt_check/,
  );
  await expectError(
    model.run,
    `update public.contents
     set thumbnail_alt = repeat('가', 201)
     where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'`,
    "23514",
    /contents_thumbnail_alt_check/,
  );
  await model.run(`
    update public.contents
    set
      thumbnail_path = 'contents/123e4567-e89b-42d3-a456-426614174000.webp',
      thumbnail_alt = '정상 썸네일',
      posted_on = date '2026-11-24'
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001';
  `);
  assert.deepEqual(
    (
      await model.db.query(`
        select thumbnail_path, thumbnail_alt, posted_on::text as posted_on
        from public.contents
        where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001'
      `)
    ).rows[0],
    {
      thumbnail_path: "contents/123e4567-e89b-42d3-a456-426614174000.webp",
      thumbnail_alt: "정상 썸네일",
      posted_on: "2026-11-24",
    },
  );

  await model.run(`
    insert into public.contents (
      id, title, channel, external_url, is_published, sort_order, posted_on
    )
    values
      (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1001',
        '정렬 1',
        'blog',
        'https://example.invalid/1',
        true,
        1,
        date '2026-11-20'
      ),
      (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1002',
        '정렬 2',
        'blog',
        'https://example.invalid/2',
        true,
        1,
        date '2026-11-21'
      ),
      (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1003',
        '정렬 3',
        'blog',
        'https://example.invalid/3',
        true,
        1,
        null
      );
  `);
  assert.deepEqual(
    (
      await model.db.query(`
        select id::text
        from public.contents
        where id in (
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1001',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1002',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1003'
        )
        order by
          is_published,
          sort_order asc,
          posted_on desc nulls last,
          id desc
      `)
    ).rows.map((row) => row.id),
    [
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1002",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1001",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb1003",
    ],
  );

  await expectError(
    model.run,
    migration,
    "P0001",
    /^CONTENTS_THUMBNAIL_SCHEMA_ALREADY_EXISTS/,
  );

  console.log(success.message);
  console.log(
    "CONTENTS_THUMBNAIL_ROLLBACK_OK: 기존 콘텐츠·정렬 인덱스·Storage 원본 일치",
  );
} finally {
  await model.db.close();
}

const wrongIndex = await createModel();
try {
  await wrongIndex.run(`
    drop index public.contents_published_sort_idx;
    create index contents_published_sort_idx
    on public.contents (is_published, sort_order, created_at asc, id desc);
  `);
  const before = await preservedState(wrongIndex.db);
  const beforeCatalog = await thumbnailCatalog(wrongIndex.db);
  await expectError(
    wrongIndex.run,
    migration,
    "P0001",
    /^CONTENTS_THUMBNAIL_SCHEMA_PREREQUISITE_FAILED: contents_published_sort_idx 정의가 예상과 다릅니다\.$/,
  );
  assert.deepEqual(await thumbnailCatalog(wrongIndex.db), beforeCatalog);
  assert.deepEqual(await preservedState(wrongIndex.db), before);
} finally {
  await wrongIndex.db.close();
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
    /^CONTENTS_THUMBNAIL_PREFLIGHT_PREREQUISITE_FAILED: contents\/를 포함하는 기존 Storage 관리자 정책 필요$/,
  );
  await wrongStorage.run("rollback");
  assert.deepEqual(await thumbnailCatalog(wrongStorage.db), {
    columns: 0,
    constraints: 0,
    index_definition: oldIndex,
  });
} finally {
  await wrongStorage.db.close();
}

console.log(
  "PASS: 격리 PostgreSQL 모형에서 기존 행 보존, nullable 열, 썸네일 CHECK, 게시일·정렬 인덱스, 선행 인덱스 거부, 원자적 실패, baseline 롤백, Storage 정책 보존을 검증했습니다.",
);
