// 실행: node tests/mypage-reservations-rls.model.mjs
// 격리 PostgreSQL에서 예약 RLS가 회원별 행을 분리하는지 검사한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.MYPAGE_RESERVATIONS_PGLITE_MODULE ||
    "../node_modules/.cache/notices-pg-runtime/node_modules/@electric-sql/pglite/dist/index.js"
);
const source = readFileSync(
  new URL(
    "../supabase/migrations/20261102035714_reservations_schema.sql",
    import.meta.url,
  ),
  "utf8",
).replaceAll("\r\n", "\n");
const exclusion = `,
  exclude using gist (
    counselor_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed'))`;
assert.ok(source.includes(exclusion));
const migration = source
  .replace(
    "create extension if not exists btree_gist with schema extensions;",
    "create schema if not exists extensions;",
  )
  .replace(exclusion, "");

const memberA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const memberB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003";
const db = new PGlite();

async function rowsAs(role, userId, sql) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("rollback");
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public
    grant all on tables to anon, authenticated;
    alter default privileges in schema public
    grant all on sequences to anon, authenticated;
    alter default privileges in schema public
    grant all on functions to anon, authenticated;
  `);
  await db.exec(migration);
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
    values
      ('${memberA}', 'member-a@example.invalid', '{"name":"회원 A"}'),
      ('${memberB}', 'member-b@example.invalid', '{"name":"회원 B"}'),
      ('${admin}', 'admin@example.invalid', '{"name":"관리자"}');
    update public.profiles set role = 'admin' where id = '${admin}';

    insert into public.stores (id, slug, name)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
      'test-store',
      '테스트 매장'
    );
    insert into public.counselors (
      id,
      slug,
      store_id,
      name,
      field
    )
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
      'test-counselor',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
      '상담사 A',
      'tarot'
    );
    insert into public.consult_products (
      id,
      counselor_id,
      name,
      minutes,
      price
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
      '테스트 상담',
      30,
      10000
    );
    insert into public.reservations (
      id,
      reservation_no,
      user_id,
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
    values
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
        'R-20261125-0001',
        '${memberA}',
        'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
        'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
        '회원 A 상담',
        30,
        10000,
        '2026-11-25 03:00:00+00',
        '2026-11-25 03:30:00+00',
        '회원 A',
        '010-1111-1111',
        'member-a@example.invalid',
        'bank_transfer',
        'confirmed'
      ),
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
        'R-20261125-0002',
        '${memberB}',
        'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
        'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
        '회원 B 상담',
        30,
        10000,
        '2026-11-25 04:00:00+00',
        '2026-11-25 04:30:00+00',
        '회원 B',
        '010-2222-2222',
        'member-b@example.invalid',
        'bank_transfer',
        'completed'
      ),
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeee0003',
        'R-20261125-0003',
        null,
        'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
        'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
        '비회원 상담',
        30,
        10000,
        '2026-11-25 05:00:00+00',
        '2026-11-25 05:30:00+00',
        '비회원',
        '010-3333-3333',
        'guest@example.invalid',
        'bank_transfer',
        'cancelled'
      );
  `);

  assert.deepEqual(
    await rowsAs(
      "authenticated",
      memberA,
      "select reservation_no from public.reservations order by reservation_no",
    ),
    [{ reservation_no: "R-20261125-0001" }],
  );
  assert.deepEqual(
    await rowsAs(
      "authenticated",
      memberB,
      "select reservation_no from public.reservations order by reservation_no",
    ),
    [{ reservation_no: "R-20261125-0002" }],
  );
  assert.deepEqual(
    await rowsAs(
      "authenticated",
      memberA,
      `select reservation_no
       from public.reservations
       where user_id = '${memberB}'`,
    ),
    [],
  );
  assert.deepEqual(
    await rowsAs(
      "anon",
      null,
      "select reservation_no from public.reservations",
    ),
    [],
  );
  assert.equal(
    (
      await rowsAs(
        "authenticated",
        admin,
        "select count(*)::int as count from public.reservations",
      )
    )[0].count,
    3,
  );
} finally {
  await db.close();
}

console.log(
  "PASS: 예약 RLS가 회원별 예약만 허용하고 타 회원·비회원 행을 차단하며 관리자만 전체 조회합니다.",
);
