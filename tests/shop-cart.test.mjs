import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const openId = "11111111-1111-4111-8111-111111111111";
const soldId = "22222222-2222-4222-8222-222222222222";
const secretId = "33333333-3333-4333-8333-333333333333";
const deletedId = "44444444-4444-4444-8444-444444444444";
const version = "2026-11-20T00:00:00.000001+00:00";
const secretName = "테스트 비공개비밀";
const secretText = "비밀설명토큰";
const secretPhoto = "products/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";
const openPhoto = "products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )((name) => {
    assert.ok(name in adapters, name);
    return adapters[name];
  }, exports);
  return exports;
}

const rules = load("lib/products/rules.ts");
const cart = load("lib/products/cart.ts", { "./rules": rules });

function storage(seed) {
  const data = new Map(seed);
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
  };
}

function row(extra = {}) {
  return {
    id: openId,
    name: "테스트 카드",
    description: "공개 설명",
    price: 12000,
    image_path: openPhoto,
    image_alt: "공개 카드",
    is_published: true,
    is_sold_out: false,
    sort_order: 0,
    created_at: version,
    updated_at: version,
    ...extra,
  };
}

function execute(world, query) {
  if (world.readError) return { data: null, error: world.readError };
  let rows = world.products.filter((item) =>
    query.filters.every(([column, value]) => item[column] === value),
  );
  if (query.in) {
    const [column, values] = query.in;
    rows = rows.filter((item) => values.includes(item[column]));
  }
  if (query.single) return { data: rows[0] ?? null, error: null };
  return {
    data: rows.slice().sort((a, b) => (a.id < b.id ? 1 : -1)),
    error: null,
  };
}

function shop(world) {
  const data = load("lib/products/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": {
      async requireAdmin() {
        throw Error("admin");
      },
    },
    "@/lib/supabase/public": {
      createPublicClient() {
        world.publicClients += 1;
        if (world.explode) {
          const error = world.explode;
          world.explode = null;
          throw error;
        }
        return {
          from(table) {
            const query = { table, columns: "", filters: [] };
            world.calls.push(query);
            const api = {
              select(columns) {
                query.columns = columns;
                return api;
              },
              eq(column, value) {
                query.filters.push([column, value]);
                return api;
              },
              in(column, values) {
                query.in = [column, values];
                return api;
              },
              maybeSingle() {
                query.single = true;
                return api;
              },
              then(resolve, reject) {
                return Promise.resolve(execute(world, query)).then(
                  resolve,
                  reject,
                );
              },
            };
            return api;
          },
        };
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        throw Error("admin client");
      },
    },
    "./rules": rules,
    "./cart": cart,
  });
  const action = load("lib/products/cart-actions.ts", {
    "next/navigation": {
      unstable_rethrow(error) {
        if (error && typeof error === "object" && "digest" in error)
          throw error;
      },
    },
    "./data": data,
  });
  return action;
}

function worldWith() {
  return {
    products: [
      row(),
      row({
        id: soldId,
        name: "테스트 공개품절",
        description: "품절 설명",
        price: 15000,
        is_sold_out: true,
        image_path: null,
        image_alt: null,
      }),
      row({
        id: secretId,
        name: secretName,
        description: secretText,
        price: 1,
        image_path: secretPhoto,
        image_alt: "비밀 사진",
        is_published: false,
      }),
    ],
    calls: [],
    publicClients: 0,
    readError: null,
    explode: null,
  };
}

test("수량은 양의 정수만 받고 같은 상품은 수량을 늘린다", () => {
  for (const value of [0, -1, 1.5, "0", "1.5", "01", "1e2", "", "100", true])
    assert.equal(cart.cartQuantity(value), null, String(value));
  assert.equal(cart.cartQuantity(1), 1);
  assert.equal(cart.cartQuantity("99"), 99);
  const saved = storage();
  const first = cart.storeAddedProduct(saved, openId);
  assert.equal(first.state, "added");
  assert.equal(first.quantity, 1);
  const second = cart.storeAddedProduct(saved, openId);
  assert.equal(second.quantity, 2);
  assert.equal(second.lines.length, 1);
  const restored = cart.readCart(saved);
  assert.deepEqual(restored.lines, [{ id: openId, quantity: 2 }]);
  const raw = JSON.parse(saved.getItem(cart.cartStorageKey));
  assert.deepEqual(Object.keys(raw[0]).sort(), ["id", "quantity"]);
  assert.equal(JSON.stringify(raw).includes("price"), false);
  const full = cart.storeChangedQuantity(saved, openId, "99");
  assert.equal(full.lines[0].quantity, 99);
  const blocked = cart.storeAddedProduct(saved, openId);
  assert.equal(blocked.state, "rejected");
  assert.equal(blocked.reason, "quantity");
  assert.equal(cart.readCart(saved).lines[0].quantity, 99);
  const many = storage();
  for (let index = 1; index <= cart.maxCartLines; index += 1) {
    const id = `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
    assert.equal(cart.storeAddedProduct(many, id).state, "added");
  }
  const overflow = cart.storeAddedProduct(
    many,
    "55555555-5555-4555-8555-555555555555",
  );
  assert.equal(overflow.reason, "full");
  assert.equal(cart.readCart(many).lines.length, cart.maxCartLines);
});

test("수량 변경과 삭제와 새로고침 복원과 저장 실패를 구분한다", () => {
  const saved = storage();
  cart.storeAddedProduct(saved, openId);
  cart.storeAddedProduct(saved, soldId);
  const changed = cart.storeChangedQuantity(saved, openId, "3");
  assert.deepEqual(changed.lines, [
    { id: openId, quantity: 3 },
    { id: soldId, quantity: 1 },
  ]);
  for (const value of ["0", "-2", "1.2", "  ", "100"]) {
    const rejected = cart.storeChangedQuantity(saved, openId, value);
    assert.equal(rejected.state, "rejected", String(value));
    assert.equal(cart.readCart(saved).lines[0].quantity, 3);
  }
  const removed = cart.storeRemovedProduct(saved, soldId);
  assert.deepEqual(removed.lines, [{ id: openId, quantity: 3 }]);
  const again = cart.readCart(
    storage([[cart.cartStorageKey, saved.getItem(cart.cartStorageKey)]]),
  );
  assert.deepEqual(again.lines, [{ id: openId, quantity: 3 }]);
  const emptied = cart.storeRemovedProduct(saved, openId);
  assert.equal(emptied.state, "empty");
  assert.equal(cart.readCart(saved).state, "empty");
  const kept = storage();
  cart.storeAddedProduct(kept, openId);
  const flaky = {
    getItem: (key) => kept.getItem(key),
    setItem() {
      throw Error("quota");
    },
  };
  assert.equal(cart.storeAddedProduct(flaky, openId).state, "storage-error");
  assert.equal(
    cart.storeChangedQuantity(flaky, openId, "4").state,
    "storage-error",
  );
  assert.equal(cart.storeRemovedProduct(flaky, openId).state, "storage-error");
  assert.deepEqual(cart.readCart(kept).lines, [{ id: openId, quantity: 1 }]);
  const broken = {
    getItem() {
      throw Error("denied");
    },
    setItem() {
      throw Error("denied");
    },
  };
  assert.equal(cart.readCart(broken).state, "storage-error");
  assert.equal(cart.readCart(storage()).state, "empty");
  const corrupt = storage([[cart.cartStorageKey, "{"]]);
  assert.equal(cart.readCart(corrupt).state, "storage-error");
  assert.notEqual(cart.cartMessages.empty, cart.cartMessages.lookup);
  assert.notEqual(cart.cartMessages.empty, cart.cartMessages.storage);
  assert.notEqual(cart.cartMessages.lookup, cart.cartMessages.storage);
});

test("저장된 이름과 가격은 읽지 않고 현재 가격으로 합계를 계산한다", () => {
  const saved = storage([
    [
      cart.cartStorageKey,
      JSON.stringify([
        {
          id: openId,
          quantity: 2,
          name: secretName,
          price: 1,
          description: secretText,
        },
      ]),
    ],
  ]);
  const read = cart.readCart(saved);
  assert.equal(JSON.stringify(read).includes(secretName), false);
  assert.equal(JSON.stringify(read).includes(secretText), false);
  assert.equal(saved.getItem(cart.cartStorageKey).includes(secretName), false);
  assert.equal(saved.getItem(cart.cartStorageKey).includes("price"), false);
  const open = row({ price: 12000 });
  const sold = row({
    id: soldId,
    name: "테스트 공개품절",
    price: 15000,
    is_sold_out: true,
    image_path: null,
    image_alt: null,
  });
  const secret = row({
    id: secretId,
    name: secretName,
    description: secretText,
    price: 9,
    image_path: secretPhoto,
    image_alt: "비밀 사진",
    is_published: false,
  });
  const lines = [
    { id: openId, quantity: 2 },
    { id: soldId, quantity: 4 },
    { id: secretId, quantity: 3 },
    { id: deletedId, quantity: 1 },
  ];
  const viewed = cart.cartLookupState(lines, {
    ok: true,
    products: [open, sold, secret, null],
  });
  assert.equal(viewed.state, "ready");
  assert.equal(viewed.total, 24000);
  assert.equal(viewed.rows[0].kind, "available");
  assert.equal(viewed.rows[0].lineTotal, 24000);
  assert.equal(viewed.rows[1].kind, "sold-out");
  assert.equal(viewed.rows[1].name, "테스트 공개품절");
  assert.equal("lineTotal" in viewed.rows[1], false);
  assert.equal(viewed.rows[2].kind, "unavailable");
  assert.deepEqual(Object.keys(viewed.rows[2]).sort(), [
    "id",
    "kind",
    "quantity",
  ]);
  assert.equal(viewed.rows[3].kind, "unavailable");
  assert.equal(JSON.stringify(viewed).includes(secretName), false);
  assert.equal(JSON.stringify(viewed).includes(secretText), false);
  assert.equal(JSON.stringify(viewed).includes(secretPhoto), false);
  const repriced = cart.cartLookupState(lines, {
    ok: true,
    products: [{ ...open, price: 18000 }, sold, secret, null],
  });
  assert.equal(repriced.total, 36000);
  assert.equal(saved.getItem(cart.cartStorageKey).includes("18000"), false);
  assert.equal(saved.getItem(cart.cartStorageKey).includes("price"), false);
  const soldChanged = cart.changeCartQuantity(lines, soldId, 9);
  assert.equal(
    cart.presentCart(soldChanged.lines, viewed.catalog).total,
    24000,
  );
  const openChanged = cart.changeCartQuantity(soldChanged.lines, openId, 3);
  assert.equal(
    cart.presentCart(openChanged.lines, viewed.catalog).total,
    36000,
  );
  const failed = cart.cartLookupState(lines, { ok: false });
  assert.equal(failed.state, "lookup-error");
  assert.deepEqual(failed.lines, lines);
  assert.equal(JSON.stringify(failed).includes(secretName), false);
  assert.equal(cart.readCart(saved).lines[0].quantity, 2);
});

test("선택 수량만큼 담고 품절 추가는 막으며 배지 수량을 갱신한다", () => {
  const saved = storage();
  const added = cart.storeAddedProduct(saved, openId, 3);
  assert.equal(added.state, "added");
  assert.equal(added.quantity, 3);
  assert.equal(cart.cartUnits(added.lines), 3);
  const more = cart.storeAddedProduct(saved, openId, "2");
  assert.equal(more.quantity, 5);
  const other = cart.storeAddedProduct(
    saved,
    "55555555-5555-4555-8555-555555555555",
    1,
  );
  assert.equal(cart.cartUnits(other.lines), 6);
  assert.equal(cart.cartUnits(cart.readCart(saved).lines), 6);
  const blocked = cart.storeAddedProduct(saved, soldId, 4, { soldOut: true });
  assert.equal(blocked.state, "rejected");
  assert.equal(blocked.reason, "sold-out");
  assert.equal(
    JSON.stringify(cart.readCart(saved).lines).includes(soldId),
    false,
  );
  const held = cart.storeAddedProduct(saved, openId, 1, { soldOut: true });
  assert.equal(held.reason, "sold-out");
  assert.equal(cart.readCart(saved).lines[0].quantity, 5);
  assert.equal(saved.getItem(cart.cartStorageKey).includes("price"), false);
  const before = saved.getItem(cart.cartStorageKey);
  cart.storeAddedProduct(saved, soldId, 2);
  assert.equal(cart.cartUnits(cart.readCart(saved).lines), 8);
  const removed = cart.storeRemovedProduct(saved, soldId);
  assert.equal(removed.state, "ready");
  assert.equal(
    removed.lines.some((line) => line.id === soldId),
    false,
  );
  assert.equal(cart.cartUnits(removed.lines), 6);
  const again = cart.storeRemovedProduct(saved, soldId);
  assert.equal(again.state, "rejected");
  assert.equal(cart.readCart(saved).lines[0].quantity, 5);
  const capped = cart.storeAddedProduct(saved, openId, 95);
  assert.equal(capped.reason, "quantity");
  assert.equal(saved.getItem(cart.cartStorageKey).includes(soldId), false);
  assert.equal(saved.getItem(cart.cartStorageKey), before);
  const link = readFileSync(
    new URL("components/products/cart-link.tsx", root),
    "utf8",
  );
  assert.match(link, /cartUnits/);
  assert.match(link, /useSyncExternalStore/);
  assert.match(link, /ShoppingCart/);
  assert.match(link, /href="\/shop\/cart"/);
  assert.match(link, /장바구니/);
  const add = readFileSync(
    new URL("components/products/add-to-cart.tsx", root),
    "utf8",
  );
  assert.match(add, /수량 줄이기/);
  assert.match(add, /수량 늘리기/);
  assert.match(add, /soldOut/);
  assert.match(add, /cartMessages\.soldOutAdd/);
  assert.match(add, /storeAddedProduct\(/);
  const view = readFileSync(
    new URL("components/products/cart-view.tsx", root),
    "utf8",
  );
  assert.match(view, /quantityLocked/);
  assert.match(view, /row\.kind === "sold-out"/);
  assert.match(view, /삭제/);
  assert.match(view, /disabled=\{disabled\}/);
});

test("장바구니 조회는 공개 상품을 한 번에 다시 읽고 실패해도 항목을 남긴다", async () => {
  const saved = storage();
  cart.storeAddedProduct(saved, openId);
  cart.storeAddedProduct(saved, openId);
  cart.storeAddedProduct(saved, soldId);
  cart.storeAddedProduct(saved, secretId);
  cart.storeAddedProduct(saved, deletedId);
  const lines = cart.readCart(saved).lines;
  const world = worldWith();
  const api = shop(world);
  const loaded = await api.loadCartProducts(lines.map((line) => line.id));
  assert.equal(loaded.ok, true);
  assert.equal(world.calls.length, 1);
  assert.equal(world.publicClients, 1);
  assert.equal(world.calls[0].columns, rules.publicDetailColumns);
  assert.deepEqual(world.calls[0].in, ["id", lines.map((line) => line.id)]);
  assert.equal(
    world.calls[0].filters.find(([column]) => column === "is_published")[1],
    true,
  );
  assert.equal(loaded.products[0].id, openId);
  assert.equal(loaded.products[0].price, 12000);
  assert.equal(loaded.products[1].id, soldId);
  assert.equal(loaded.products[1].is_sold_out, true);
  assert.equal(loaded.products[2], null);
  assert.equal(loaded.products[3], null);
  const viewed = cart.cartLookupState(lines, loaded);
  assert.equal(viewed.total, 24000);
  assert.equal(viewed.rows[1].kind, "sold-out");
  assert.equal(viewed.rows[2].kind, "unavailable");
  assert.equal(viewed.rows[3].kind, "unavailable");
  assert.equal(JSON.stringify(loaded).includes(secretName), false);
  assert.equal(JSON.stringify(viewed).includes(secretText), false);
  assert.equal(JSON.stringify(viewed).includes(secretPhoto), false);
  world.products[0].price = 18000;
  world.calls = [];
  const repriced = await api.loadCartProducts([openId]);
  assert.equal(
    cart.cartLookupState([{ id: openId, quantity: 2 }], repriced).total,
    36000,
  );
  assert.equal(saved.getItem(cart.cartStorageKey).includes("price"), false);
  const before = saved.getItem(cart.cartStorageKey);
  world.readError = { message: "down" };
  const failed = await api.loadCartProducts(lines.map((line) => line.id));
  assert.deepEqual(failed, { ok: false });
  assert.equal(saved.getItem(cart.cartStorageKey), before);
  assert.equal(cart.cartLookupState(lines, failed).state, "lookup-error");
  world.readError = null;
  const retried = await api.loadCartProducts([openId]);
  assert.equal(retried.ok, true);
  assert.equal(retried.products[0].price, 18000);
  world.explode = Object.assign(new Error("next"), { digest: "NEXT_REDIRECT" });
  await assert.rejects(
    () => api.loadCartProducts([openId]),
    (error) => error.digest === "NEXT_REDIRECT",
  );
  assert.equal(saved.getItem(cart.cartStorageKey), before);
  const removed = cart.storeRemovedProduct(saved, secretId);
  assert.equal(
    removed.lines.some((line) => line.id === secretId),
    false,
  );
  const source = readFileSync(new URL("lib/products/data.ts", root), "utf8");
  const body = source.slice(
    source.indexOf("export async function publicCartProducts"),
    source.indexOf("export async function adminProductList"),
  );
  assert.equal(body.includes("publicProductDetail("), false);
  assert.equal((body.match(/\.from\(/g) || []).length, 1);
  assert.match(body, /\.in\(/);
  assert.match(body, /\.eq\("is_published", true\)/);
});

test("화면은 담기 합계와 세 가지 안내를 나누고 주문서로 연결한다", () => {
  const pages = readFileSync(
    new URL("components/products/pages.tsx", root),
    "utf8",
  );
  const detail = pages.slice(
    pages.indexOf("export async function ProductDetailPage"),
  );
  const list = pages.slice(
    pages.indexOf("export async function ProductListPage"),
    pages.indexOf("export async function ProductDetailPage"),
  );
  const view = readFileSync(
    new URL("components/products/cart-view.tsx", root),
    "utf8",
  );
  const add = readFileSync(
    new URL("components/products/add-to-cart.tsx", root),
    "utf8",
  );
  const page = readFileSync(
    new URL("app/(site)/shop/cart/page.tsx", root),
    "utf8",
  );
  assert.match(detail, /ProductCartActions/);
  assert.match(detail, /soldOut=\{row\.is_sold_out\}/);
  assert.match(list, /ShopCartLink/);
  assert.match(list, /grid-cols-2/);
  assert.match(list, /admin \? "grid gap-3" : "grid grid-cols-2 gap-3"/);
  assert.match(list, /!admin &&/);
  assert.equal(list.includes("ProductCartActions"), false);
  assert.match(add, /장바구니 담기/);
  assert.match(add, /storeAddedProduct/);
  assert.match(view, /cartMessages\.empty/);
  assert.match(view, /cartMessages\.lookup/);
  assert.match(view, /cartMessages\.storage/);
  assert.match(view, /다시 조회/);
  assert.match(view, /수량 변경/);
  assert.match(view, /삭제/);
  assert.match(view, />\s*합계/);
  assert.equal(view.includes(".description"), false);
  assert.match(view, /href="\/shop\/order"/);
  assert.match(view, /주문서 작성/);
  assert.equal(view.includes("결제하기"), false);
  assert.equal(add.includes("구매하기"), false);
  assert.equal(add.includes("결제하기"), false);
  assert.match(page, /CartView/);
  assert.equal(page.includes("requireAdmin"), false);
  assert.match(
    readFileSync(new URL("lib/products/cart.ts", root), "utf8"),
    /장바구니에서 배송지를 입력하고 주문할 수 있습니다/,
  );
});
