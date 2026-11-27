// 실행: node tests/member-account-rls.model.mjs
// 격리 PostgreSQL에서 본인 문의 차단, 역할 수정 차단, 탈퇴 후 기록 보존을 검사한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { PGlite } = await import(
  process.env.MYPAGE_RESERVATIONS_PGLITE_MODULE ||
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
const inquiries = read(
  "../supabase/migrations/20261105010000_customer_support_schema.sql",
);
const withdrawal = read(
  "../supabase/migrations/20261125130000_member_account_withdrawal.sql",
);

const memberA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const memberB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002";
const db = new PGlite();

async function asUser(role, userId, run) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId ?? "",
    ]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : {}),
    ]);
    return await run();
  } finally {
    await db.exec("rollback");
  }
}

async function rowsAs(role, userId, sql) {
  return asUser(role, userId, async () => (await db.query(sql)).rows);
}

async function failsAs(role, userId, sql, pattern) {
  let failed = null;
  try {
    await asUser(role, userId, async () => {
      await db.query(sql);
    });
  } catch (error) {
    failed = error;
  }
  assert.ok(failed, `${role} 호출이 성공하면 안 됩니다.`);
  assert.match(String(failed.message ?? failed), pattern);
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
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
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(reservations);
  await db.exec(inquiries);
  await db.exec(withdrawal);
  await db.exec(`
    create table public.orders (
      id uuid primary key,
      order_no text not null,
      user_id uuid references auth.users(id) on delete set null
    );

    insert into auth.users (id, email, raw_user_meta_data)
    values
      ('${memberA}', 'member-a@example.invalid', '{"name":"회원 A"}'),
      ('${memberB}', 'member-b@example.invalid', '{"name":"회원 B"}');

    insert into public.stores (id, slug, name)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
      'test-store',
      '테스트 매장'
    );
    insert into public.counselors (id, slug, store_id, name, field)
    values (
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
      'test-counselor',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001',
      '상담사 A',
      'tarot'
    );
    insert into public.consult_products (
      id, counselor_id, name, minutes, price
    )
    values (
      'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
      'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
      '테스트 상담',
      30,
      10000
    );
    insert into public.reservations (
      id, reservation_no, user_id, counselor_id, product_id, product_name,
      minutes, price, starts_at, ends_at, customer_name, customer_phone,
      customer_email, payment_method, status
    )
    values
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
        'R-20261125-0001',
        '${memberA}',
        'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
        'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
        '회원 A 상담',
        30, 10000,
        '2026-11-25 03:00:00+00',
        '2026-11-25 03:30:00+00',
        '회원 A', '010-1111-1111', 'member-a@example.invalid',
        'bank_transfer', 'confirmed'
      ),
      (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
        'R-20261125-0002',
        '${memberB}',
        'cccccccc-cccc-4ccc-8ccc-cccccccc0001',
        'dddddddd-dddd-4ddd-8ddd-dddddddd0001',
        '회원 B 상담',
        30, 10000,
        '2026-11-25 04:00:00+00',
        '2026-11-25 04:30:00+00',
        '회원 B', '010-2222-2222', 'member-b@example.invalid',
        'bank_transfer', 'completed'
      );
    insert into public.orders (id, order_no, user_id)
    values
      ('abababab-abab-4aba-8aba-abababab0001', 'O-20261125-0001', '${memberA}'),
      ('abababab-abab-4aba-8aba-abababab0002', 'O-20261125-0002', '${memberB}');
    insert into public.inquiries (
      id, user_id, category, customer_name, customer_email, customer_phone, content
    )
    values
      (
        'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcd0001',
        '${memberA}',
        'other',
        '회원 A',
        'member-a@example.invalid',
        '010-1111-1111',
        '회원 A 문의'
      ),
      (
        'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcd0002',
        '${memberB}',
        'shop',
        '회원 B',
        'member-b@example.invalid',
        '010-2222-2222',
        '회원 B 문의'
      );
  `);

  assert.deepEqual(
    await rowsAs(
      "authenticated",
      memberA,
      "select content from public.inquiries order by content",
    ),
    [{ content: "회원 A 문의" }],
  );
  assert.deepEqual(
    await rowsAs(
      "authenticated",
      memberB,
      `select content from public.inquiries where user_id = '${memberA}'`,
    ),
    [],
  );
  await failsAs(
    "anon",
    null,
    "select content from public.inquiries",
    /permission denied/i,
  );

  // 운영 DB는 Supabase 기본 권한으로 profiles를 읽을 수 있다.
  // 수정은 마이그레이션의 name·phone 열 권한만 허용한다.
  await db.exec(`
    grant select on public.profiles to authenticated;
    grant select on public.reservations to authenticated;
  `);

  await failsAs(
    "authenticated",
    memberA,
    `update public.profiles set role = 'admin' where id = '${memberA}'`,
    /permission denied/i,
  );

  const renamed = await asUser("authenticated", memberA, async () => {
    await db.query(
      `update public.profiles
       set name = '바꾼 이름', phone = '010-9999-0000'
       where id = '${memberA}'`,
    );
    return (
      await db.query(
        `select name, phone, role from public.profiles where id = '${memberA}'`,
      )
    ).rows;
  });
  assert.deepEqual(renamed, [
    { name: "바꾼 이름", phone: "010-9999-0000", role: "user" },
  ]);

  const blockedProfile = await asUser("authenticated", memberA, async () => {
    await db.query(
      `update public.profiles set name = '가로챈 이름' where id = '${memberB}'`,
    );
    return (
      await db.query(`select name from public.profiles where id = '${memberB}'`)
    ).rows;
  });
  assert.deepEqual(blockedProfile, []);
  assert.equal(
    (await db.query(`select name from public.profiles where id = '${memberB}'`))
      .rows[0].name,
    "회원 B",
  );

  await failsAs(
    "anon",
    null,
    "select public.delete_own_account()",
    /permission denied/i,
  );
  await failsAs(
    "authenticated",
    null,
    "select public.delete_own_account()",
    /로그인이 필요합니다/,
  );

  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
    memberA,
  ]);
  await db.query("select public.delete_own_account()");
  await db.exec("reset role");

  assert.equal(
    (
      await db.query(
        `select count(*)::int as count from auth.users where id = '${memberA}'`,
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int as count from public.profiles where id = '${memberA}'`,
      )
    ).rows[0].count,
    0,
  );
  assert.deepEqual(
    (
      await db.query(
        `select reservation_no, user_id, customer_name, status
         from public.reservations
         where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001'`,
      )
    ).rows,
    [
      {
        reservation_no: "R-20261125-0001",
        user_id: null,
        customer_name: "회원 A",
        status: "confirmed",
      },
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        `select order_no, user_id
         from public.orders
         where id = 'abababab-abab-4aba-8aba-abababab0001'`,
      )
    ).rows,
    [{ order_no: "O-20261125-0001", user_id: null }],
  );
  assert.deepEqual(
    (
      await db.query(
        `select content, user_id
         from public.inquiries
         where id = 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcd0001'`,
      )
    ).rows,
    [{ content: "회원 A 문의", user_id: null }],
  );
  assert.deepEqual(
    (
      await db.query(
        `select reservation_no, user_id::text
         from public.reservations
         where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002'`,
      )
    ).rows,
    [{ reservation_no: "R-20261125-0002", user_id: memberB }],
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int as count from auth.users where id = '${memberB}'`,
      )
    ).rows[0].count,
    1,
  );
  await db.exec("rollback");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}

if (!process.exitCode) {
  console.log(
    "PASS: 타인 문의는 막히고, 역할은 바꿀 수 없으며, 탈퇴 후 계정은 없고 예약·주문·문의 기록은 연결만 끊긴 채 남습니다.",
  );
}
