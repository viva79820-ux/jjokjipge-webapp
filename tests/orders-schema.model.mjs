// 실행: node tests/orders-schema.model.mjs
// 격리 PGlite에서 주문 금액·판매 상태·멱등성·RLS·원자적 롤백을 검사한다.
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
const migration = read(
  "../supabase/migrations/20261125004138_orders_schema.sql",
);
const adminMigration = read(
  "../supabase/migrations/20261125013636_order_lookup_admin.sql",
);
const preflight = read("../supabase/tests/orders_schema_preflight.sql");
const rollback = read("../supabase/tests/orders_schema_rollback.sql");

const adminId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const availableId = "20000000-0000-4000-8000-000000000001";
const soldOutId = "20000000-0000-4000-8000-000000000002";
const privateId = "20000000-0000-4000-8000-000000000003";
const requestKey = "30000000-0000-4000-8000-000000000001";

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
      ('${userId}', 'user@example.invalid', '{"name":"회원"}');
    update public.profiles set role = 'admin' where id = '${adminId}';
    insert into public.products (
      id, name, description, price, is_published, is_sold_out
    )
    values
      (
        '${availableId}',
        '가격 검증 상품',
        '서버 가격 검증용',
        12000,
        true,
        false
      ),
      (
        '${soldOutId}',
        '판매 중지 상품',
        '품절 검증용',
        9000,
        true,
        true
      ),
      (
        '${privateId}',
        '비공개 상품',
        '비공개 검증용',
        1,
        false,
        false
      );
  `);
  return { db, run };
}

function rpcSql({
  key = requestKey,
  name = "주문자",
  productId = availableId,
  quantity = 2,
} = {}) {
  return `
    set local role service_role;
    select *
    from public.create_shop_order(
      '${key}',
      '${userId}',
      '${name}',
      '010-1234-5678',
      'buyer@example.invalid',
      '41911',
      '대구광역시 중구 테스트로 1',
      '테스트 101호',
      0,
      '[{"product_id":"${productId}","quantity":${quantity}}]'::jsonb
    );
    reset role;
  `;
}

const model = await createModel();
try {
  const preflightSuccess = await expectError(
    model.run,
    preflight,
    "P0001",
    /^ORDERS_PREFLIGHT_OK:/,
  );
  assert.match(preflightSuccess.message, /상품 가격·공개·품절 구조와 RLS/);
  await model.run("rollback");

  await model.run(migration);
  await model.run(adminMigration);
  const catalog = (
    await model.db.query(`
      select
        (select relrowsecurity from pg_class where oid = 'public.orders'::regclass)
          as orders_rls,
        (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass)
          as items_rls,
        (select relrowsecurity from pg_class where oid = 'private.order_counters'::regclass)
          as counters_rls,
        has_table_privilege('anon', 'public.orders', 'SELECT')
          as anon_select,
        has_table_privilege('authenticated', 'public.orders', 'SELECT')
          as authenticated_select,
        has_table_privilege('authenticated', 'public.orders', 'INSERT')
          as authenticated_insert,
        has_column_privilege('authenticated', 'public.orders', 'status', 'UPDATE')
          as authenticated_status_update,
        has_column_privilege('authenticated', 'public.orders', 'tracking_number', 'UPDATE')
          as authenticated_tracking_update,
        has_column_privilege('authenticated', 'public.orders', 'customer_name', 'UPDATE')
          as authenticated_name_update
    `)
  ).rows[0];
  assert.deepEqual(catalog, {
    orders_rls: true,
    items_rls: true,
    counters_rls: true,
    anon_select: false,
    authenticated_select: true,
    authenticated_insert: false,
    authenticated_status_update: true,
    authenticated_tracking_update: true,
    authenticated_name_update: false,
  });

  const created = await model.run(`begin; ${rpcSql()} commit;`);
  assert.match(created.at(-3).rows[0].order_number, /^O-\d{8}-0001$/);
  assert.deepEqual(created.at(-3).rows[0], {
    order_number: created.at(-3).rows[0].order_number,
    subtotal_amount: "24000",
    shipping_fee_amount: "0",
    total_amount: "24000",
    order_status: "pending_payment",
    replayed: false,
  });

  const stored = (
    await model.db.query(`
      select
        o.user_id::text,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.postal_code,
        o.address_line1,
        o.address_line2,
        o.subtotal::text,
        o.shipping_fee::text,
        o.total::text,
        o.status,
        oi.product_name,
        oi.unit_price::text,
        oi.quantity,
        oi.line_total::text
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.request_key = '${requestKey}'
    `)
  ).rows[0];
  assert.deepEqual(stored, {
    user_id: userId,
    customer_name: "주문자",
    customer_phone: "010-1234-5678",
    customer_email: "buyer@example.invalid",
    postal_code: "41911",
    address_line1: "대구광역시 중구 테스트로 1",
    address_line2: "테스트 101호",
    subtotal: "24000",
    shipping_fee: "0",
    total: "24000",
    status: "pending_payment",
    product_name: "가격 검증 상품",
    unit_price: "12000",
    quantity: 2,
    line_total: "24000",
  });

  const replay = await model.run(`begin; ${rpcSql()} commit;`);
  assert.equal(replay.at(-3).rows[0].replayed, true);
  assert.equal(
    (await model.db.query("select count(*)::int as count from public.orders"))
      .rows[0].count,
    1,
  );
  await expectError(
    model.run,
    `begin; ${rpcSql({ name: "다른 주문자" })} commit;`,
    "P0001",
    /^ORDER_IDEMPOTENCY_CONFLICT$/,
  );
  await model.run("rollback");

  await expectError(
    model.run,
    `begin; ${rpcSql({
      key: "30000000-0000-4000-8000-000000000002",
      productId: soldOutId,
      quantity: 1,
    })} commit;`,
    "P0001",
    /^ORDER_PRODUCT_SOLD_OUT$/,
  );
  await model.run("rollback");
  await expectError(
    model.run,
    `begin; ${rpcSql({
      key: "30000000-0000-4000-8000-000000000003",
      productId: privateId,
      quantity: 1,
    })} commit;`,
    "P0001",
    /^ORDER_PRODUCT_UNAVAILABLE$/,
  );
  await model.run("rollback");

  const userRead = await model.run(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', true);
    select count(*)::int as orders from public.orders;
    select count(*)::int as items from public.order_items;
    update public.orders set status = 'cancelled';
    commit;
  `);
  assert.deepEqual(userRead.at(-4).rows[0], { orders: 0 });
  assert.deepEqual(userRead.at(-3).rows[0], { items: 0 });
  assert.equal(userRead.at(-2).affectedRows, 0);

  const adminRead = await model.run(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${adminId}', true);
    select count(*)::int as orders from public.orders;
    update public.orders set status = 'payment_confirmed';
    commit;
  `);
  assert.deepEqual(adminRead.at(-3).rows[0], { orders: 1 });
  assert.equal(adminRead.at(-2).affectedRows, 1);
  await expectError(
    model.run,
    `
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      update public.orders set status = 'completed';
      commit;
    `,
    "P0001",
    /^ORDER_STATUS_TRANSITION_INVALID$/,
  );
  await model.run("rollback");
  await expectError(
    model.run,
    `
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      update public.orders set status = 'shipping';
      commit;
    `,
    "P0001",
    /^ORDER_TRACKING_NUMBER_REQUIRED$/,
  );
  await model.run("rollback");
  const shipped = await model.run(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${adminId}', true);
    update public.orders
    set status = 'shipping', tracking_number = 'TRACK-1234'
    returning status, tracking_number, shipped_at is not null as shipped;
    commit;
  `);
  assert.deepEqual(shipped.at(-2).rows[0], {
    status: "shipping",
    tracking_number: "TRACK-1234",
    shipped: true,
  });
  const completed = await model.run(`
    begin;
    set local role authenticated;
    select set_config('request.jwt.claim.sub', '${adminId}', true);
    update public.orders
    set status = 'completed'
    returning status, completed_at is not null as completed;
    commit;
  `);
  assert.deepEqual(completed.at(-2).rows[0], {
    status: "completed",
    completed: true,
  });
  await expectError(
    model.run,
    `
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${adminId}', true);
      update public.orders set customer_name = '변경';
      commit;
    `,
    "42501",
    /permission denied/,
  );
  await model.run("rollback");

  await expectError(
    model.run,
    migration,
    "P0001",
    /^ORDERS_SCHEMA_ALREADY_EXISTS$/,
  );

  await model.run("delete from public.orders");
  const rolledBack = await model.run(rollback);
  assert.equal(rolledBack.at(-1).rows[0].result, "ORDERS_ROLLBACK_OK");
  const absent = (
    await model.db.query(`
      select
        to_regclass('public.orders') as orders,
        to_regclass('public.order_items') as items,
        to_regclass('private.order_counters') as counters,
        to_regclass('public.products') as products
    `)
  ).rows[0];
  assert.deepEqual(absent, {
    orders: null,
    items: null,
    counters: null,
    products: "products",
  });
} finally {
  await model.db.close();
}

console.log(
  "PASS: 주문 가격 스냅샷, 판매 중지·비공개 거부, 중복 요청, 고객 직접 조회 차단, 관리자 상태 전이·송장 처리, 빈 스키마 롤백을 검증했습니다.",
);
