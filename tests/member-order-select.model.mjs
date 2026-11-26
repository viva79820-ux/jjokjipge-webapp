// 실행: node tests/member-order-select.model.mjs
// 격리 PGlite에서 회원 본인 주문만 보이고 타인·비회원 주문은 막히는지 검사한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.ORDERS_PGLITE_MODULE ||
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
const ordersMigration = read(
  "../supabase/migrations/20261125004138_orders_schema.sql",
);
const adminMigration = read(
  "../supabase/migrations/20261125013636_order_lookup_admin.sql",
);
const memberMigration = read(
  "../supabase/migrations/20261126093000_member_order_select.sql",
);
const preflight = read("../supabase/tests/member_order_select_preflight.sql");
const rollback = read("../supabase/tests/member_order_select_rollback.sql");

const adminId = "10000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000002";
const otherId = "10000000-0000-4000-8000-000000000003";
const productId = "20000000-0000-4000-8000-000000000001";

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
  for (const source of baseMigrations) await run(source);
  await run(`
    insert into auth.users (id, email, raw_user_meta_data)
    values
      ('${adminId}', 'admin@example.invalid', '{"name":"관리자"}'),
      ('${ownerId}', 'owner@example.invalid', '{"name":"회원"}'),
      ('${otherId}', 'other@example.invalid', '{"name":"다른 회원"}');
    update public.profiles set role = 'admin' where id = '${adminId}';
    insert into public.products (
      id, name, description, price, is_published, is_sold_out
    )
    values (
      '${productId}',
      '회원 조회 상품',
      '본인 주문 조회 검증용',
      12000,
      true,
      false
    );
  `);
  return { db, run };
}

function rpcSql({ key, userId }) {
  const userSql = userId ? `'${userId}'` : "null";
  return `
    set local role service_role;
    select *
    from public.create_shop_order(
      '${key}',
      ${userSql},
      '주문자',
      '010-1234-5678',
      'buyer@example.invalid',
      '41911',
      '대구광역시 중구 테스트로 1',
      '테스트 101호',
      0,
      '[{"product_id":"${productId}","quantity":1}]'::jsonb
    );
    reset role;
  `;
}

async function orderNumber(run, key, userId) {
  const created = await run(`begin; ${rpcSql({ key, userId })} commit;`);
  const orderNo = created.at(-3).rows[0].order_number;
  assert.match(orderNo, /^O-\d{8}-\d{4,}$/);
  return orderNo;
}

function asUser(userId, sql) {
  return `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    ${sql}
    commit;
  `;
}

const model = await createModel();
try {
  await model.run(ordersMigration);
  await model.run(adminMigration);
  const ready = await expectError(
    model.run,
    preflight,
    "P0001",
    /^MEMBER_ORDER_SELECT_PREFLIGHT_OK:/,
  );
  assert.match(ready.message, /회원 본인 조회 정책은 아직 없음/);
  await model.run("rollback");

  const ownerNo = await orderNumber(
    model.run,
    "30000000-0000-4000-8000-000000000011",
    ownerId,
  );
  const otherNo = await orderNumber(
    model.run,
    "30000000-0000-4000-8000-000000000012",
    otherId,
  );
  const guestNo = await orderNumber(
    model.run,
    "30000000-0000-4000-8000-000000000013",
    null,
  );
  assert.notEqual(ownerNo, otherNo);
  assert.notEqual(ownerNo, guestNo);

  await model.run(memberMigration);
  const privileges = (
    await model.db.query(`
      select
        has_table_privilege('anon', 'public.orders', 'SELECT') as anon_select,
        has_table_privilege('authenticated', 'public.orders', 'SELECT')
          as member_select,
        has_table_privilege('authenticated', 'public.orders', 'INSERT')
          as member_insert,
        (
          select count(*)::int
          from pg_policies
          where policyname in ('orders_select_own', 'order_items_select_own')
        ) as own_policies
    `)
  ).rows[0];
  assert.deepEqual(privileges, {
    anon_select: false,
    member_select: true,
    member_insert: false,
    own_policies: 2,
  });

  const ownerRows = await model.run(
    asUser(ownerId, "select order_no from public.orders order by order_no;"),
  );
  assert.deepEqual(
    ownerRows.at(-2).rows.map((row) => row.order_no),
    [ownerNo],
  );
  const ownerItems = await model.run(
    asUser(ownerId, "select count(*)::int as items from public.order_items;"),
  );
  assert.deepEqual(ownerItems.at(-2).rows[0], { items: 1 });
  const hiddenOrder = await model.run(
    asUser(
      ownerId,
      `select count(*)::int as orders from public.orders where order_no = '${otherNo}';`,
    ),
  );
  assert.deepEqual(hiddenOrder.at(-2).rows[0], { orders: 0 });
  const hiddenGuest = await model.run(
    asUser(
      ownerId,
      `select count(*)::int as orders from public.orders where order_no = '${guestNo}';`,
    ),
  );
  assert.deepEqual(hiddenGuest.at(-2).rows[0], { orders: 0 });
  const hiddenItems = await model.run(
    asUser(
      ownerId,
      `
        select count(*)::int as items
        from public.order_items
        where order_id in (
          select id from public.orders where order_no in ('${otherNo}', '${guestNo}')
        );
      `,
    ),
  );
  assert.deepEqual(hiddenItems.at(-2).rows[0], { items: 0 });

  const otherRows = await model.run(
    asUser(otherId, "select order_no from public.orders order by order_no;"),
  );
  assert.deepEqual(
    otherRows.at(-2).rows.map((row) => row.order_no),
    [otherNo],
  );

  const adminRows = await model.run(
    asUser(adminId, "select count(*)::int as orders from public.orders;"),
  );
  assert.deepEqual(adminRows.at(-2).rows[0], { orders: 3 });

  await expectError(
    model.run,
    `
      begin;
      set local role anon;
      select count(*)::int as orders from public.orders;
      commit;
    `,
    "42501",
    /permission denied/,
  );
  await model.run("rollback");

  const blockedUpdate = await model.run(
    asUser(ownerId, "update public.orders set status = 'cancelled';"),
  );
  assert.equal(blockedUpdate.at(-2).affectedRows, 0);
  const unchanged = (
    await model.db.query(
      "select count(*)::int as pending from public.orders where status = 'pending_payment'",
    )
  ).rows[0];
  assert.deepEqual(unchanged, { pending: 3 });

  await expectError(
    model.run,
    preflight,
    "P0001",
    /^MEMBER_ORDER_SELECT_PREFLIGHT_CONFLICT:/,
  );
  await model.run("rollback");
  await expectError(
    model.run,
    memberMigration,
    "P0001",
    /^MEMBER_ORDER_SELECT_ALREADY_EXISTS$/,
  );

  const rolledBack = await model.run(rollback);
  assert.equal(
    rolledBack.at(-1).rows[0].result,
    "MEMBER_ORDER_SELECT_ROLLBACK_OK",
  );
  const kept = (
    await model.db.query(`
      select
        (select count(*)::int from public.orders) as orders,
        (
          select count(*)::int
          from pg_policies
          where policyname in ('orders_select_own', 'order_items_select_own')
        ) as own_policies,
        to_regclass('public.products') as products
    `)
  ).rows[0];
  assert.deepEqual(kept, {
    orders: 3,
    own_policies: 0,
    products: "products",
  });
  const blockedAgain = await model.run(
    asUser(ownerId, "select count(*)::int as orders from public.orders;"),
  );
  assert.deepEqual(blockedAgain.at(-2).rows[0], { orders: 0 });

  await model.run(memberMigration);
  const restored = await model.run(
    asUser(
      ownerId,
      `select order_no from public.orders where order_no = '${ownerNo}';`,
    ),
  );
  assert.deepEqual(restored.at(-2).rows, [{ order_no: ownerNo }]);
} finally {
  await model.db.close();
}

console.log(
  "PASS: 회원은 본인 주문·상품만 읽고, 다른 회원·비회원 주문과 익명 조회·회원 수정은 막히며, 정책 롤백은 주문 데이터를 남깁니다.",
);
