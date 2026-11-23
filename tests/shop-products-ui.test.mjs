import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const productId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const version = "2026-11-20T00:00:00.000001+00:00";
const photo = "products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
const otherPhoto = "products/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";
const secretName = "테스트 비공개비밀";

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
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
const support = load("lib/admin/support-rules.ts", {
  "../inquiries/validation": { categoryLabels: { other: "기타" } },
});

function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id: productId,
    version,
    mode: "update",
    name: "  테스트 카드  ",
    description: "  첫째 줄\n둘째 줄  ",
    price: "12000",
    image_path: "",
    image_alt: "",
    is_published: "false",
    is_sold_out: "false",
    sort_order: "0",
    ...extra,
  }))
    data.append(key, value);
  return data;
}

function row(extra = {}) {
  return {
    id: productId,
    name: "테스트 카드",
    description: "첫째 줄\n둘째 줄",
    price: 12000,
    image_path: null,
    image_alt: null,
    is_published: false,
    is_sold_out: false,
    sort_order: 0,
    created_at: version,
    updated_at: version,
    ...extra,
  };
}

function memory(world) {
  const apiFor = (query) => {
    const api = {
      select(columns, options = {}) {
        query.columns = columns;
        query.count = options.count === "exact";
        query.head = Boolean(options.head);
        return api;
      },
      eq(column, value) {
        query.filters.push(["eq", column, value]);
        return api;
      },
      order(column, options = {}) {
        query.orders.push([column, options.ascending !== false]);
        return api;
      },
      range(from, to) {
        query.range = [from, to];
        return api;
      },
      insert(payload) {
        query.kind = "insert";
        query.payload = payload;
        return api;
      },
      update(payload) {
        query.kind = "update";
        query.payload = payload;
        return api;
      },
      delete() {
        query.kind = "delete";
        return api;
      },
      maybeSingle() {
        query.single = "maybe";
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve(execute(world, query)).then(resolve, reject);
      },
    };
    return api;
  };
  return {
    from(table) {
      const query = {
        table,
        columns: "",
        filters: [],
        orders: [],
        range: null,
        kind: "select",
        payload: null,
        single: "",
        count: false,
        head: false,
      };
      world.calls.push(query);
      return apiFor(query);
    },
    storage: {
      from(bucket) {
        return {
          async info(path) {
            world.storageReads.push(path);
            if (world.storageThrow) {
              world.storageThrow = false;
              throw Error("socket");
            }
            if (world.storageStatus) {
              const status = world.storageStatus;
              world.storageStatus = 0;
              return {
                data: null,
                error: {
                  message: "storage",
                  status,
                  statusCode: String(status),
                },
              };
            }
            if (bucket !== "public-images" || !world.files.has(path))
              return {
                data: null,
                error: { message: "missing", status: 404, statusCode: "404" },
              };
            return {
              data: { size: 1200, contentType: "image/png" },
              error: null,
            };
          },
          async remove(paths) {
            world.storageRemoves.push(paths);
            if (world.cleanupFail) return { error: { message: "cleanup" } };
            for (const path of paths) {
              const used = world.products.some(
                (item) => item.image_path === path,
              );
              if (!used) world.files.delete(path);
            }
            return { error: null };
          },
          async upload() {
            throw Error("server upload is not used");
          },
        };
      },
    },
  };
}

function same(rowItem, filters) {
  return filters.every(([, column, value]) => rowItem[column] === value);
}

function stamp(world) {
  world.seq = (world.seq || 0) + 1;
  return `2026-11-20T01:00:00.${String(world.seq).padStart(6, "0")}+00:00`;
}

function finish(query, rows, total) {
  const count = query.count ? total : null;
  if (query.single === "maybe")
    return { data: rows[0] || null, error: null, count };
  return { data: query.head ? null : rows, error: null, count };
}

function execute(world, query) {
  if (query.table !== "products")
    return { data: null, error: { code: "42P01" }, count: null };
  if (world.readError && query.kind === "select")
    return { data: null, error: world.readError, count: null };
  const visible = world.products.filter(
    (item) => world.role === "admin" || item.is_published,
  );
  if (
    query.kind === "insert" ||
    query.kind === "update" ||
    query.kind === "delete"
  )
    world.writes += 1;
  if (query.kind === "insert") {
    if (world.role !== "admin")
      return { data: null, error: { code: "42501" }, count: null };
    if (world.products.some((item) => item.id === query.payload.id))
      return { data: null, error: { code: "23505" }, count: null };
    const saved = {
      created_at: version,
      updated_at: stamp(world),
      ...query.payload,
    };
    world.products.push(saved);
    return finish(query, [saved], 1);
  }
  let selected = visible.filter((item) => same(item, query.filters));
  if (query.kind === "update" || query.kind === "delete") {
    if (world.role !== "admin")
      return { data: null, error: { code: "42501" }, count: null };
    if (world.writeError)
      return { data: null, error: world.writeError, count: null };
    if (query.kind === "delete") {
      for (const item of selected) {
        const index = world.products.indexOf(item);
        if (index >= 0) world.products.splice(index, 1);
      }
    } else {
      const savedAt = stamp(world);
      for (const item of selected)
        Object.assign(item, query.payload, { updated_at: savedAt });
    }
    if (world.lose) {
      world.lose = false;
      throw Error("socket");
    }
    return finish(query, selected, selected.length);
  }
  if (query.orders.length) {
    selected = [...selected].sort((left, right) => {
      for (const [column, ascending] of query.orders) {
        if (left[column] === right[column]) continue;
        const compared = left[column] > right[column] ? 1 : -1;
        return ascending ? compared : -compared;
      }
      return 0;
    });
  }
  const total = selected.length;
  if (query.range)
    selected = selected.slice(query.range[0], query.range[1] + 1);
  return finish(query, selected, total);
}

function harness(state) {
  const world = {
    role: "admin",
    products: [],
    files: new Set([photo, otherPhoto]),
    calls: [],
    writes: 0,
    storageReads: [],
    storageRemoves: [],
    cleanupFail: false,
    storageStatus: 0,
    storageThrow: false,
    lose: false,
    readError: null,
    writeError: null,
    ...state,
  };
  const server = {
    createClient: async () => {
      world.serverClients = (world.serverClients || 0) + 1;
      return memory(world);
    },
  };
  const auth = {
    requireAdmin: async () =>
      world.role === "admin"
        ? {
            userId: "99999999-9999-4999-8999-999999999999",
            email: "a@example.invalid",
          }
        : null,
  };
  const rulesModule = rules;
  const cleanup = load("lib/products/cleanup.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/server": server,
    "./rules": rulesModule,
  });
  const actions = load("lib/products/actions.ts", {
    "server-only": {},
    "node:crypto": {
      randomUUID: () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    },
    "next/cache": { revalidatePath() {} },
    "@/lib/admin/auth": auth,
    "@/lib/admin/support-rules": support,
    "@/lib/supabase/server": server,
    "./cleanup": cleanup,
    "./rules": rulesModule,
  });
  const data = load("lib/products/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/public": {
      createPublicClient: () => {
        world.publicClients = (world.publicClients || 0) + 1;
        return memory({ ...world, role: "anon" });
      },
    },
    "@/lib/supabase/server": server,
    "./rules": rulesModule,
    "./cart": cart,
  });
  return { world, ...actions, ...data, cleanup };
}

test("상품 입력과 정수 가격과 사진 경로를 그대로 검증한다", () => {
  const parsed = rules.parseProduct(form());
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.patch.name, "테스트 카드");
  assert.equal(parsed.patch.description, "첫째 줄\n둘째 줄");
  assert.equal(parsed.patch.price, 12000);
  assert.equal(parsed.patch.is_published, false);
  assert.equal(parsed.patch.is_sold_out, false);
  for (const price of ["1.5", "1e2", "01", "0", "2147483648", "1,000", "+12"]) {
    assert.ok(rules.parseProduct(form({ price })).errors.price, price);
  }
  assert.equal(rules.parseProduct(form({ price: "1" })).patch.price, 1);
  assert.equal(
    rules.parseProduct(form({ price: "2147483647" })).patch.price,
    2147483647,
  );
  assert.equal(rules.storedWon("12000.00"), 12000);
  assert.equal(rules.storedWon(12000), 12000);
  assert.equal(rules.storedWon("1.50"), null);
  assert.equal(rules.storedWon("1e3"), null);
  assert.equal(rules.storedWon(12.5), null);
  assert.match(rules.formatWon(12000), /12,000원|12,000원/);
  assert.equal(
    rules.parseProduct(form({ name: "   " })).errors.name !== undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ description: "\n\n" })).errors.description !==
      undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ name: "가".repeat(101) })).errors.name !==
      undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ sort_order: "-1" })).errors.sort_order !==
      undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ sort_order: "1.5" })).errors.sort_order !==
      undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ is_published: "yes" })).errors.is_published !==
      undefined,
    true,
  );
  const duplicated = form();
  duplicated.append("is_sold_out", "true");
  assert.equal(
    rules.parseProduct(duplicated).errors.is_sold_out !== undefined,
    true,
  );
  assert.equal(rules.imagePath(photo), true);
  assert.equal(rules.imagePath("products/../secret.png"), false);
  assert.equal(rules.imagePath(`https://example.invalid/${photo}`), false);
  assert.equal(
    rules.parseProduct(form({ image_path: photo, image_alt: "  " })).errors
      .image_alt !== undefined,
    true,
  );
  assert.equal(
    rules.parseProduct(form({ image_path: photo, image_alt: "카드 앞면" }))
      .patch.image_alt,
    "카드 앞면",
  );
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(rules.imageKind(png).mime, "image/png");
  assert.equal(rules.imageKind(new Uint8Array([1, 2, 3, 4])), null);
});

test("고객 조회는 공개 상품만 전달하고 공개 품절은 보여 준다", async () => {
  const api = harness({
    products: [
      row({
        name: secretName,
        description: "비밀설명토큰",
        is_published: false,
      }),
      row({
        id: otherId,
        name: "테스트 공개품절",
        description: "공개설명",
        price: "15000.00",
        is_published: true,
        is_sold_out: true,
        sort_order: 1,
        image_path: photo,
        image_alt: "공개 카드",
        created_at: "2026-11-20T00:00:02.000001+00:00",
      }),
    ],
  });
  const list = await api.publicProductList(1);
  assert.equal(api.world.publicClients, 1);
  assert.equal(list.count, 1);
  assert.equal(list.data[0].name, "테스트 공개품절");
  assert.equal(list.data[0].price, 15000);
  assert.equal(list.data[0].is_sold_out, true);
  assert.equal("is_published" in list.data[0], false);
  assert.equal(JSON.stringify(list).includes(secretName), false);
  assert.equal(JSON.stringify(list).includes("비밀설명토큰"), false);
  const detail = await api.publicProductDetail(otherId);
  assert.equal(detail.name, "테스트 공개품절");
  assert.equal(detail.description, "공개설명");
  assert.equal(await api.publicProductDetail(productId), null);
  const leaked = harness({
    products: [row({ name: secretName, is_published: false })],
  });
  leaked.world.products[0].is_published = false;
  const original = leaked.world.products.filter;
  leaked.world.products.filter = () => leaked.world.products;
  await assert.rejects(
    () => leaked.publicProductList(1),
    /불러오지 못했습니다/,
  );
  leaked.world.products.filter = original;
});

test("관리자 권한과 조건부 저장과 연속 저장과 읽기 전용 재확인", async () => {
  const denied = harness({ role: "member", products: [row()] });
  assert.equal((await denied.saveProduct(form())).state, "rejected");
  assert.equal(denied.world.writes, 0);
  const api = harness({ products: [row()] });
  const published = await api.saveProduct(
    form({ is_published: "true", version }),
  );
  assert.equal(published.state, "saved");
  assert.equal(published.row.is_published, true);
  assert.equal(published.row.is_sold_out, false);
  assert.notEqual(published.row.updated_at, version);
  const sold = await api.saveProduct(
    form({
      is_published: "true",
      is_sold_out: "true",
      version: published.row.updated_at,
    }),
  );
  assert.equal(sold.state, "saved");
  assert.equal(sold.row.is_published, true);
  assert.equal(sold.row.is_sold_out, true);
  const cleared = await api.saveProduct(
    form({
      is_published: "true",
      is_sold_out: "false",
      version: sold.row.updated_at,
    }),
  );
  assert.equal(cleared.row.is_sold_out, false);
  assert.notEqual(cleared.row.updated_at, sold.row.updated_at);
  const conflict = await api.saveProduct(
    form({ name: "다른 이름", version: sold.row.updated_at }),
  );
  assert.equal(conflict.state, "conflict");
  assert.equal(api.world.products[0].name, "테스트 카드");
  const rejected = await api.saveProduct(form({ price: "1.5" }));
  assert.equal(rejected.state, "rejected");
  assert.equal(api.world.products[0].price, 12000);
  const beforeConfirm = api.world.writes;
  const checked = await api.confirmProduct(
    productId,
    form({
      is_published: "true",
      version: cleared.row.updated_at,
    }),
  );
  assert.equal(checked.unchanged, true);
  assert.equal(checked.state, "rejected");
  assert.match(checked.message, /수정 전 버전 그대로/);
  assert.equal(api.world.writes, beforeConfirm);
  api.world.lose = true;
  const lost = await api.saveProduct(
    form({
      name: "테스트 응답유실",
      is_published: "true",
      version: cleared.row.updated_at,
    }),
  );
  assert.equal(lost.state, "unknown");
  const writesAfterLoss = api.world.writes;
  const recovered = await api.confirmProduct(
    productId,
    form({
      name: "테스트 응답유실",
      is_published: "true",
      version: cleared.row.updated_at,
    }),
  );
  assert.equal(recovered.state, "saved");
  assert.equal(recovered.row.name, "테스트 응답유실");
  assert.equal(api.world.writes, writesAfterLoss);
});

test("사진 교체 실패는 기존 사진을 남기고 정리 실패는 삭제를 반복하지 않는다", async () => {
  const api = harness({
    products: [
      row({ image_path: photo, image_alt: "기존 사진", is_published: true }),
    ],
  });
  api.world.files.delete(otherPhoto);
  const missingFile = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "없는 사진",
      is_published: "true",
    }),
  );
  assert.equal(missingFile.state, "rejected");
  assert.match(missingFile.message, /사진을 찾지 못했습니다/);
  assert.equal(api.world.products[0].image_path, photo);
  assert.equal(api.world.writes, 0);
  assert.equal(api.world.storageRemoves.length, 0);
  api.world.files.add(otherPhoto);
  api.world.storageStatus = 403;
  const forbidden = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "권한 사진",
      is_published: "true",
    }),
  );
  assert.equal(forbidden.state, "unknown");
  assert.equal(api.world.products[0].image_path, photo);
  assert.equal(api.world.writes, 0);
  api.world.storageStatus = 503;
  const unavailable = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "장애 사진",
      is_published: "true",
    }),
  );
  assert.equal(unavailable.state, "unknown");
  assert.equal(api.world.writes, 0);
  api.world.storageThrow = true;
  const lostLookup = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "유실 사진",
      is_published: "true",
    }),
  );
  assert.equal(lostLookup.state, "unknown");
  assert.equal(api.world.products[0].image_path, photo);
  assert.equal(api.world.storageRemoves.length, 0);
  api.world.files.add(otherPhoto);
  api.world.writeError = { code: "23514" };
  const rejected = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "거절된 사진",
      is_published: "true",
    }),
  );
  assert.equal(rejected.state, "rejected");
  assert.equal(api.world.products[0].image_path, photo);
  assert.equal(api.world.storageRemoves.length, 0);
  api.world.writeError = null;
  api.world.products.push(
    row({ id: otherId, image_path: otherPhoto, image_alt: "다른 상품" }),
  );
  const shared = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "공유 사진",
      is_published: "true",
    }),
  );
  assert.equal(shared.state, "rejected");
  assert.equal(api.world.products[0].image_path, photo);
  api.world.products.pop();
  const replaced = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "새 사진",
      is_published: "true",
    }),
  );
  assert.equal(replaced.state, "saved");
  assert.equal(replaced.row.image_path, otherPhoto);
  assert.equal(api.world.files.has(photo), false);
  assert.equal(api.world.files.has(otherPhoto), true);
  api.world.cleanupFail = true;
  api.world.files.add(photo);
  api.world.products[0].image_path = photo;
  api.world.products[0].image_alt = "기존 사진";
  api.world.products[0].updated_at = replaced.row.updated_at;
  const failedCleanup = await api.saveProduct(
    form({
      image_path: otherPhoto,
      image_alt: "새 사진",
      is_published: "true",
      version: replaced.row.updated_at,
    }),
  );
  assert.equal(failedCleanup.state, "saved");
  assert.equal(typeof failedCleanup.cleanup, "function");
  const writes = api.world.writes;
  api.world.cleanupFail = false;
  assert.equal(await failedCleanup.cleanup(), true);
  assert.equal(api.world.writes, writes);
  api.world.products[0].image_path = photo;
  api.world.products[0].updated_at = version;
  api.world.files.add(photo);
  api.world.lose = true;
  const lostDelete = await api.saveProduct(form({ mode: "delete", version }));
  assert.equal(lostDelete.state, "unknown");
  assert.equal(api.world.products.length, 0);
  const deletes = api.world.writes;
  const removes = api.world.storageRemoves.length;
  const confirmed = await api.confirmProduct(
    productId,
    form({ mode: "delete", version }),
  );
  assert.equal(confirmed.deleted, true);
  assert.equal(api.world.writes, deletes);
  assert.equal(api.world.storageRemoves.length, removes);
  assert.equal(api.world.files.has(photo), true);
});

test("저장소 조회와 수정 버전을 구분하고 재확인은 사진을 지우지 않는다", async () => {
  const api = harness({
    products: [
      row({ image_path: photo, image_alt: "기존 사진", is_published: true }),
    ],
  });
  assert.equal(
    api.cleanup.classifyStorageInfo({
      data: null,
      error: { status: 404 },
    }),
    "missing",
  );
  assert.equal(
    api.cleanup.classifyStorageInfo({
      data: null,
      error: { status: 403, statusCode: "403" },
    }),
    "forbidden",
  );
  assert.equal(
    api.cleanup.classifyStorageInfo({
      data: null,
      error: { statusCode: "503" },
    }),
    "unavailable",
  );
  assert.equal(
    api.cleanup.classifyStorageInfo({
      data: null,
      error: { message: "lost" },
    }),
    "unknown",
  );
  assert.equal(
    api.cleanup.classifyStorageInfo({
      data: { size: 1200, contentType: "image/png" },
      error: null,
    }),
    "present",
  );
  const reserved = await api.prepareProductUpload("png");
  api.world.files.delete(reserved.path);
  assert.equal(await reserved.confirm(), "missing");
  api.world.storageStatus = 403;
  assert.equal(await reserved.confirm(), "forbidden");
  api.world.storageStatus = 503;
  assert.equal(await reserved.confirm(), "unavailable");
  api.world.storageThrow = true;
  assert.equal(await reserved.confirm(), "unknown");
  api.world.files.add(reserved.path);
  assert.equal(await reserved.confirm(), "present");
  const sameVersion = await api.confirmProduct(
    productId,
    form({
      image_path: photo,
      image_alt: "바꾼 설명",
      is_published: "true",
      version,
    }),
  );
  assert.equal(sameVersion.unchanged, true);
  assert.match(sameVersion.message, /수정 전 버전 그대로/);
  assert.equal(api.world.products[0].image_alt, "기존 사진");
  assert.equal(api.world.writes, 0);
  assert.equal(api.world.storageRemoves.length, 0);
  api.world.products[0].name = "테스트 다른버전";
  api.world.products[0].updated_at = "2026-11-20T02:00:00.000001+00:00";
  const drifted = await api.confirmProduct(
    productId,
    form({
      image_path: otherPhoto,
      image_alt: "새 사진",
      is_published: "true",
      version,
    }),
  );
  assert.equal(drifted.state, "conflict");
  assert.match(drifted.message, /성공했는지는 알 수 없습니다/);
  assert.equal(drifted.message.includes("반영되지 않았습니다"), false);
  assert.equal(drifted.message.includes("저장했습니다"), false);
  assert.equal(api.world.writes, 0);
  assert.equal(api.world.storageRemoves.length, 0);
  api.world.products[0].name = "테스트 카드";
  api.world.products[0].image_path = otherPhoto;
  api.world.products[0].image_alt = "새 사진";
  api.world.products[0].updated_at = "2026-11-20T03:00:00.000001+00:00";
  const writes = api.world.writes;
  const removes = api.world.storageRemoves.length;
  const matched = await api.confirmProduct(
    productId,
    form({
      image_path: otherPhoto,
      image_alt: "새 사진",
      is_published: "true",
      version,
    }),
  );
  assert.equal(matched.state, "saved");
  assert.equal(matched.row.image_path, otherPhoto);
  assert.equal(api.world.writes, writes);
  assert.equal(api.world.storageRemoves.length, removes);
  assert.equal(api.world.files.has(photo), true);
  const cleanup = api.cleanup.cleanupAction(
    photo,
    "99999999-9999-4999-8999-999999999999",
  );
  assert.equal(await cleanup(), true);
  assert.equal(api.world.writes, writes);
  assert.equal(api.world.files.has(photo), false);
  assert.equal(api.world.files.has(otherPhoto), true);
  assert.equal(api.world.products[0].image_path, otherPhoto);
});

test("고객 화면 문구에 구매 버튼을 만들지 않는다", () => {
  const pages = readFileSync(
    new URL("components/products/pages.tsx", root),
    "utf8",
  );
  const editor = readFileSync(
    new URL("components/products/editor.tsx", root),
    "utf8",
  );
  assert.match(pages, /href="\/shop\/cart"/);
  assert.equal(pages.includes("구매하기"), false);
  assert.equal(pages.includes("결제하기"), false);
  assert.equal(pages.includes("구매 기능 준비 중"), false);
  assert.match(editor, /삭제 결과 다시 확인/);
  assert.match(editor, /사진 정리 다시 시도/);
  assert.match(editor, /사진 정리 버튼으로만 지웁니다/);
  assert.match(editor, /cleanupRemains\(\)/);
  assert.equal(editor.includes("if (!result.cleanup)"), false);
  assert.match(editor, /업로드된 파일이 없습니다/);
  assert.equal(editor.includes("저장된 상품은 바꾸지 않았습니다"), false);
  assert.equal(editor.includes("await remaining()"), false);
  assert.equal(
    editor.includes("if (uploaded.current) return uploaded.current"),
    false,
  );
  const lookup = readFileSync(new URL("lib/products/upload.ts", root), "utf8");
  assert.match(lookup, /사진 조회 권한이 없습니다/);
  assert.match(lookup, /일시적으로 확인하지 못했습니다/);
  assert.match(lookup, /사진 조회 응답을 확인하지 못했습니다/);
  assert.match(lookup, /업로드된 파일이 없습니다/);
  assert.match(
    readFileSync(new URL("components/admin/menu-tabs.tsx", root), "utf8"),
    /타로샵 상품/,
  );
});
