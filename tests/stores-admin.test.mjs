import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
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

const rules = load("../lib/stores/rules.ts", {
  "@/lib/site-config": { siteConfig: { phone: "010-0000-0000" } },
});
const submit = load("../lib/stores/submit.ts");
const upload = load("../lib/stores/upload.ts", { "./rules": rules });
const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-11-13T00:00:00.123456+00:00";
const nextVersion = "2026-11-13T00:00:01.654321+00:00";
const oldPath = `stores/${id}.png`;
const fresh = "stores/22222222-2222-4222-8222-222222222222.jpg";
const row = {
  id,
  slug: "a",
  name: "매장 A",
  description: "첫째 줄\n둘째 줄",
  address: "더미 주소",
  hours: "오전\n오후",
  phone: "053-000-0000",
  image_path: oldPath,
  sort_order: 3,
  is_active: true,
  updated_at: version,
};
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version,
    mode: "update",
    name: "매장 A",
    description: "첫째 줄\n둘째 줄",
    address: "더미 주소",
    hours: "오전\n오후",
    phone: "053-000-0000",
    image_path: oldPath,
    sort_order: "3",
    is_active: "false",
    slug: "client-slug",
    ...extra,
  }))
    data.set(key, value);
  return data;
}
function harness({
  admin = true,
  current = row,
  refs = 0,
  readError = null,
  mutationError = null,
  info = { size: 1200, contentType: "image/png" },
  infoError = null,
  removeError = null,
  loseUpdate = false,
  counselors = [{ slug: "counselor-a" }],
} = {}) {
  const calls = [];
  const removed = [];
  let infoCalls = 0;
  const db = {
    from(table) {
      const query = { table, filters: [], payload: null, kind: "read" };
      calls.push(query);
      const api = {
        select() {
          return api;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return api;
        },
        order() {
          return api;
        },
        range() {
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
        maybeSingle: async () => answer(query, true),
        then(resolve, reject) {
          return Promise.resolve(answer(query, false)).then(resolve, reject);
        },
      };
      return api;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "public-images");
        return {
          info: async () => {
            infoCalls += 1;
            return { data: info, error: infoError };
          },
          remove: async (paths) => {
            removed.push(paths);
            return { error: removeError };
          },
        };
      },
    },
  };
  function answer(query, single) {
    if (query.table === "counselors")
      return {
        data: counselors,
        error: readError && query.kind !== "read" ? readError : null,
      };
    const image = query.filters.find((item) => item[0] === "image_path");
    if (!single && image) return { data: null, count: refs, error: readError };
    if (query.kind === "insert") {
      if (current?.id === query.payload.id)
        return { data: null, error: { code: "23505" } };
      if (mutationError) return { data: null, error: mutationError };
      current = { ...query.payload, updated_at: nextVersion };
      return { data: current, error: null };
    }
    if (query.kind === "update") {
      const versionFilter = query.filters.find(
        (item) => item[0] === "updated_at",
      );
      if (mutationError) return { data: null, error: mutationError };
      if (loseUpdate || !current || versionFilter?.[1] !== current.updated_at)
        return { data: null, error: null };
      current = { ...current, ...query.payload, updated_at: nextVersion };
      return { data: current, error: null };
    }
    if (readError) return { data: null, error: readError };
    const wanted = query.filters.find((item) => item[0] === "id");
    if (wanted && current?.id !== wanted[1]) return { data: null, error: null };
    return { data: current, error: null };
  }
  const auth = {
    requireAdmin: async () => (admin ? { userId: id } : null),
  };
  const server = {
    createClient: async () => {
      if (!admin) throw Error("non-admin client");
      return db;
    },
  };
  const paths = [];
  const cleanup = load("../lib/stores/cleanup.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  const actions = load("../lib/stores/actions.ts", {
    "server-only": {},
    "node:crypto": { randomUUID: () => "22222222-2222-4222-8222-222222222222" },
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": auth,
    "@/lib/admin/support-rules": {
      versionValid: (value) => value === version || value === nextVersion,
    },
    "@/lib/supabase/server": server,
    "./cleanup": cleanup,
    "./rules": rules,
  });
  return {
    ...actions,
    ...cleanup,
    calls,
    paths,
    removed,
    infoCalls: () => infoCalls,
    setCurrent(value) {
      current = value;
    },
    getCurrent: () => current,
  };
}

function deleteHarness({
  isAdmin = true,
  current = { ...row, is_active: false },
  counselors = [],
  otherStores = [],
  storeReadError = null,
  counselorReadError = null,
  refsError = null,
  deleteError = null,
  removeError = null,
  zeroDelete = false,
  throwAfterDelete = false,
  beforeDelete = null,
} = {}) {
  let admin = isAdmin;
  let saved = current ? { ...current } : null;
  let cleanupError = removeError;
  const linked = [...counselors];
  const removed = [];
  const paths = [];
  const events = [];
  const queries = [];
  let deleteCount = 0;
  const db = {
    from(table) {
      const query = {
        table,
        filters: [],
        kind: "read",
        fields: "",
        options: {},
      };
      queries.push(query);
      const api = {
        select(fields, options = {}) {
          query.fields = fields;
          query.options = options;
          return api;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return api;
        },
        delete() {
          query.kind = "delete";
          return api;
        },
        maybeSingle: async () => answer(query, true),
        then(resolve, reject) {
          return Promise.resolve(answer(query, false)).then(resolve, reject);
        },
      };
      return api;
    },
    storage: {
      from(name) {
        assert.equal(name, "public-images");
        return {
          remove: async (items) => {
            events.push("remove");
            removed.push(items);
            return { error: cleanupError };
          },
        };
      },
    },
  };
  function matches(item, filters) {
    return filters.every(([key, value]) => item?.[key] === value);
  }
  function answer(query, single) {
    if (query.table === "counselors") {
      const selected = linked.filter((item) => matches(item, query.filters));
      return counselorReadError
        ? { data: null, count: null, error: counselorReadError }
        : {
            data: query.options.head ? null : selected,
            count: query.options.count ? selected.length : null,
            error: null,
          };
    }
    if (query.table !== "stores")
      return { data: single ? null : [], count: 0, error: null };
    if (query.kind === "delete") {
      deleteCount += 1;
      events.push("delete");
      if (beforeDelete) beforeDelete({ linked, saved });
      if (deleteError) return { data: null, error: deleteError };
      if (
        linked.some((item) => item.store_id === saved?.id) &&
        matches(saved, query.filters)
      )
        return { data: null, error: { code: "23503" } };
      if (zeroDelete || !saved || !matches(saved, query.filters))
        return { data: null, error: null };
      const deleted = saved;
      saved = null;
      if (throwAfterDelete) throw Error("response lost");
      return { data: deleted, error: null };
    }
    const imageFilter = query.filters.find(([key]) => key === "image_path");
    if (imageFilter) {
      if (refsError) return { data: null, count: null, error: refsError };
      const all = [...otherStores, ...(saved ? [saved] : [])];
      const selected = all.filter((item) => matches(item, query.filters));
      return {
        data: query.options.head ? null : selected,
        count: query.options.count ? selected.length : null,
        error: null,
      };
    }
    if (storeReadError)
      return {
        data: null,
        count: null,
        error: storeReadError,
      };
    const selected = saved && matches(saved, query.filters) ? saved : null;
    return {
      data: single ? selected : selected ? [selected] : [],
      count: query.options.count ? (selected ? 1 : 0) : null,
      error: null,
    };
  }
  const adapters = {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": {
      requireAdmin: async () =>
        admin ? { userId: id, email: "admin@example.invalid" } : null,
    },
    "@/lib/admin/support-rules": {
      versionValid: (value) => value === version || value === nextVersion,
    },
    "@/lib/supabase/server": {
      createClient: async () => db,
    },
    "./rules": rules,
  };
  return {
    ...load("../lib/stores/delete-actions.ts", adapters),
    linked,
    removed,
    paths,
    events,
    queries,
    getCurrent: () => saved,
    setCurrent: (value) => {
      saved = value;
    },
    setAdmin: (value) => {
      admin = value;
    },
    setRemoveError: (value) => {
      cleanupError = value;
    },
    deleteCount: () => deleteCount,
  };
}

function deleteRequest(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version,
    confirmed_name: "매장 A",
    ...extra,
  }))
    data.set(key, value);
  return data;
}

function deletePrepare(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id, version, ...extra }))
    data.set(key, value);
  return data;
}

test("store input keeps newlines and rejects partial values", () => {
  const parsed = rules.parseStore(form());
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.patch.description, "첫째 줄\n둘째 줄");
  assert.equal(parsed.patch.hours, "오전\n오후");
  assert.equal(parsed.patch.is_active, false);
  assert.equal(parsed.patch.phone, "053-000-0000");
  const kept = rules.parseStore(
    form({
      name: "  매장 가  ",
      description: "  첫째\r\n둘째  ",
      address: "",
      hours: "",
      phone: "",
      image_path: "",
      sort_order: "-2147483648",
    }),
  );
  assert.deepEqual(kept.errors, {});
  assert.equal(kept.patch.name, "매장 가");
  assert.equal(kept.patch.description, "첫째\r\n둘째");
  assert.equal(kept.patch.address, null);
  assert.equal(kept.patch.hours, null);
  assert.equal(kept.patch.phone, null);
  assert.equal(kept.patch.image_path, null);
  assert.equal(kept.patch.sort_order, -2147483648);
  assert.equal(
    rules.parseStore(form({ sort_order: "2147483647" })).errors.sort_order,
    undefined,
  );
  for (const value of [
    "01",
    "1.5",
    "1e2",
    "+1",
    "-0",
    " 1",
    "1 ",
    "2147483648",
    "-2147483649",
    "",
  ])
    assert.ok(
      rules.parseStore(form({ sort_order: value })).errors.sort_order,
      value,
    );
  assert.equal(
    rules.parseStore(form({ name: `${"가".repeat(100)}` })).errors.name,
    undefined,
  );
  const longName = rules.parseStore(form({ name: "가".repeat(101) }));
  assert.ok(longName.errors.name);
  assert.equal(longName.patch.name, "가".repeat(101));
  assert.ok(rules.parseStore(form({ name: "매장\nA" })).errors.name);
  assert.ok(rules.parseStore(form({ address: "주소\n층" })).errors.address);
  assert.ok(rules.parseStore(form({ description: "   " })).errors.description);
  assert.ok(rules.parseStore(form({ hours: "\u0000" })).errors.hours);
  assert.equal(
    rules.parseStore(form({ description: `${"가".repeat(4998)}\n끝` })).patch
      .description,
    `${"가".repeat(4998)}\n끝`,
  );
  assert.ok(
    rules.parseStore(form({ description: "가".repeat(5001) })).errors
      .description,
  );
  assert.ok(rules.parseStore(form({ hours: "시".repeat(1001) })).errors.hours);
  assert.ok(
    rules.parseStore(form({ address: "주".repeat(501) })).errors.address,
  );
  for (const phone of [
    "053-000-0000",
    "(053) 000-0000",
    "+82 10 0000 0000",
    "",
  ])
    assert.equal(
      rules.parseStore(form({ phone })).errors.phone,
      undefined,
      phone,
    );
  for (const phone of [
    "전화",
    "tel:05300000000",
    "053",
    "1".repeat(31),
    "010-0000-0000\n",
  ])
    assert.ok(rules.parseStore(form({ phone })).errors.phone, phone);
  assert.equal(rules.storeTelHref(""), "tel:010-0000-0000");
  assert.equal(rules.storeTelHref("053-000-0000"), "tel:0530000000");
  assert.equal(rules.storeTelHref("javascript:alert(1)"), "tel:010-0000-0000");
  assert.equal(
    rules.parseStore(form({ is_active: "1" })).errors.is_active,
    rules.parseStore(form({ is_active: "TRUE" })).errors.is_active,
  );
  assert.ok(
    rules.parseStore(form({ image_path: "https://example.invalid/a.png" }))
      .errors.image_path,
  );
  assert.ok(
    rules.parseStore(form({ image_path: `counselors/${id}.png` })).errors
      .image_path,
  );
  const duplicate = form();
  duplicate.append("name", "다른 이름");
  assert.ok(rules.parseStore(duplicate).errors.name);
  const file = form();
  file.set("phone", new File(["053"], "phone.txt"));
  assert.ok(rules.parseStore(file).errors.phone);
  assert.equal(rules.storeMatches(row, form({ is_active: "true" })), true);
  assert.equal(rules.storeMatches(row, form({ phone: "02-000-0000" })), false);
  assert.equal(
    rules.filters({ page: "2", status: "private", store: "saved" }).page,
    2,
  );
  assert.equal(rules.filters({ page: "01" }), null);
  assert.equal(rules.filters({ status: ["public"] }), null);
  assert.equal(
    rules.returnUrl("https://example.invalid/admin/stores"),
    "/admin/stores",
  );
});

test("photo signatures, size, MIME, decode and upload options stay on the client", async () => {
  const prior = globalThis.createImageBitmap;
  let closed = 0;
  globalThis.createImageBitmap = async () => ({
    width: 16,
    height: 9,
    close() {
      closed += 1;
    },
  });
  try {
    const png = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])],
      "ignored.gif",
      { type: "image/png" },
    );
    assert.equal((await upload.inspectImage(png)).ext, "png");
    const jpeg = new File([new Uint8Array([255, 216, 255, 1])], "a.jpg", {
      type: "image/jpeg",
    });
    assert.equal((await upload.inspectImage(jpeg)).mime, "image/jpeg");
    const webp = new File(
      [new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])],
      "a.webp",
      { type: "image/webp" },
    );
    assert.equal((await upload.inspectImage(webp)).ext, "webp");
    for (const file of [
      new File([], "x.png", { type: "image/png" }),
      new File([new Uint8Array(5242881)], "x.png", { type: "image/png" }),
      new File(["GIF89a"], "x.gif", { type: "image/gif" }),
      new File([await png.arrayBuffer()], "x.png", { type: "image/jpeg" }),
    ])
      await assert.rejects(() => upload.inspectImage(file));
    let sent;
    await upload.uploadImage(
      {
        storage: {
          from(bucket) {
            assert.equal(bucket, "public-images");
            return {
              upload: async (path, file, options) => {
                sent = { path, file, options };
                return { error: null };
              },
            };
          },
        },
      },
      png,
      fresh.replace(".jpg", ".png"),
    );
    assert.equal(sent.options.upsert, false);
    assert.equal(sent.options.contentType, "image/png");
    assert.equal(sent.path.startsWith("stores/"), true);
    assert.equal(closed > 0, true);
    await assert.rejects(() =>
      upload.uploadImage(
        {
          storage: {
            from() {
              return { upload: async () => ({ error: null }) };
            },
          },
        },
        png,
        "notices/22222222-2222-4222-8222-222222222222.png",
      ),
    );
  } finally {
    globalThis.createImageBitmap = prior;
  }
});

test("save uses the admin session, allowlist, version, and photo reference", async () => {
  const denied = harness({ admin: false });
  assert.equal(
    (await denied.saveStore(form())).message,
    "관리자 권한이 필요합니다.",
  );
  assert.equal(denied.calls.length, 0);
  assert.equal(await denied.prepareStoreUpload("png"), null);
  const ready = harness();
  const saved = await ready.saveStore(
    form({ name: "매장 가", is_active: "false" }),
  );
  assert.equal(saved.state, "saved");
  assert.equal(saved.row.name, "매장 가");
  assert.equal(saved.row.is_active, false);
  assert.equal(saved.row.slug, "a");
  assert.equal(saved.row.updated_at, nextVersion);
  const update = ready.calls.find((call) => call.kind === "update");
  assert.deepEqual(Object.keys(update.payload).sort(), [
    "address",
    "description",
    "hours",
    "image_path",
    "is_active",
    "name",
    "phone",
    "sort_order",
  ]);
  assert.equal(Object.hasOwn(update.payload, "slug"), false);
  assert.equal(
    ready.calls.some(
      (call) =>
        call.filters.some((item) => item[0] === "image_path") &&
        call.filters.some((item) => item[0] === "is_active"),
    ),
    false,
  );
  assert.equal(ready.infoCalls(), 0);
  assert.equal(ready.removed.length, 0);
  assert.ok(ready.paths.includes("/stores"));
  assert.ok(ready.paths.includes("/consult/counselor-a"));
  assert.ok(ready.paths.includes("/consult/counselor-a/book"));
  const stale = harness();
  const conflicted = await stale.saveStore(form({ version: nextVersion }));
  assert.equal(conflicted.state, "conflict");
  assert.equal(stale.getCurrent().name, row.name);
  assert.equal(
    stale.calls.some((call) => call.kind === "update"),
    false,
  );
  const blocked = harness({
    refs: 1,
    info: { size: 10, contentType: "image/jpeg" },
  });
  const foreign = await blocked.saveStore(form({ image_path: fresh }));
  assert.equal(foreign.state, "rejected");
  assert.equal(blocked.removed.length, 0);
  const replaced = harness({ info: { size: 10, contentType: "image/jpeg" } });
  const photo = await replaced.saveStore(form({ image_path: fresh }));
  assert.equal(photo.state, "saved");
  assert.equal(photo.cleanup, undefined);
  assert.deepEqual(replaced.removed.at(-1), [oldPath]);
  const failedCleanup = harness({
    info: { size: 10, contentType: "image/jpeg" },
    removeError: { message: "cleanup" },
  });
  const kept = await failedCleanup.saveStore(form({ image_path: fresh }));
  assert.equal(kept.state, "saved");
  assert.equal(typeof kept.cleanup, "function");
  assert.equal(kept.row.image_path, fresh);
  assert.equal(await kept.cleanup(), false);
  const legacy = harness();
  legacy.setCurrent({
    ...row,
    image_path: "https://example.invalid/secret.png",
  });
  const cleared = await legacy.saveStore(form({ image_path: "" }));
  assert.equal(cleared.state, "saved");
  assert.equal(cleared.row.image_path, null);
  assert.equal(legacy.removed.length, 0);
});

test("create retries the same attempt and does not publish by default input", async () => {
  const created = harness({ current: null });
  const result = await created.saveStore(
    form({
      mode: "create",
      version: "",
      is_active: "false",
      image_path: "",
      sort_order: "0",
    }),
  );
  assert.equal(result.state, "saved");
  assert.equal(result.row.slug, id);
  assert.equal(result.row.is_active, false);
  const insert = created.calls.find((call) => call.kind === "insert");
  assert.equal(insert.payload.slug, insert.payload.id);
  assert.equal(insert.payload.is_active, false);
  const again = await created.saveStore(
    form({
      mode: "create",
      version: "",
      is_active: "false",
      image_path: "",
      sort_order: "0",
    }),
  );
  assert.equal(again.state, "saved");
  assert.equal(again.row.id, id);
  assert.equal(
    created.calls.filter((call) => call.kind === "insert").length,
    1,
  );
  const different = await created.saveStore(
    form({ mode: "create", version: "", name: "다른 매장", image_path: "" }),
  );
  assert.equal(different.state, "conflict");
  assert.equal(created.getCurrent().name, "매장 A");
  const oddSlug = harness();
  oddSlug.setCurrent({ ...row, slug: "a" });
  const mismatch = await oddSlug.saveStore(
    form({
      mode: "create",
      version: "",
      is_active: "true",
      image_path: oldPath,
    }),
  );
  assert.equal(mismatch.state, "conflict");
  assert.equal(mismatch.resetAttempt, true);
});

test("lost save keeps the upload and cleanup compares every saved field", async () => {
  const lost = await submit.submitStoreAttempt(
    {
      upload: async () => fresh,
      save: async () => {
        throw Error("socket");
      },
      discard: async () => {
        throw Error("no");
      },
    },
    oldPath,
    true,
  );
  assert.equal(lost.result.state, "unknown");
  assert.equal(lost.uploaded, fresh);
  const rejected = await submit.submitStoreAttempt(
    {
      upload: async () => fresh,
      save: async () => ({ state: "rejected", message: "거부", row: null }),
      discard: async () => true,
    },
    "",
    true,
  );
  assert.equal(rejected.uploaded, null);
  const ready = harness();
  const loaded = await ready.reloadStore(id);
  ready.setCurrent({
    ...row,
    image_path: fresh,
    updated_at: nextVersion,
    is_active: false,
  });
  assert.equal(
    await loaded.recovery(
      form({ image_path: fresh, name: "다른 이름", is_active: "false" }),
    ),
    false,
  );
  assert.equal(ready.removed.length, 0);
  assert.equal(
    await loaded.recovery(form({ image_path: fresh, is_active: "false" })),
    true,
  );
  assert.deepEqual(ready.removed.at(-1), [oldPath]);
  const referenced = harness({ refs: 1 });
  const kept = await referenced.reloadStore(id);
  referenced.setCurrent({
    ...row,
    image_path: fresh,
    updated_at: nextVersion,
    is_active: false,
  });
  assert.equal(
    await kept.recovery(form({ image_path: fresh, is_active: "false" })),
    true,
  );
  assert.equal(referenced.removed.length, 0);
});

test("store deletion checks admin, scalar fields, saved privacy, name and version", async () => {
  const denied = deleteHarness({ isAdmin: false });
  assert.equal(
    (await denied.prepareStoreDelete(deletePrepare())).state,
    "denied",
  );
  assert.equal(denied.deleteCount(), 0);

  const invalid = deleteHarness();
  const duplicateId = deletePrepare();
  duplicateId.append("id", id);
  assert.equal(
    (await invalid.prepareStoreDelete(duplicateId)).state,
    "blocked",
  );
  const fileVersion = deletePrepare();
  fileVersion.set("version", new File([version], "version.txt"));
  assert.equal(
    (await invalid.prepareStoreDelete(fileVersion)).state,
    "blocked",
  );
  assert.equal(
    (
      await invalid.prepareStoreDelete(
        deletePrepare({ id: "not-a-uuid", version: "bad" }),
      )
    ).state,
    "blocked",
  );

  const published = deleteHarness({ current: { ...row, is_active: true } });
  const publicResult = await published.prepareStoreDelete(deletePrepare());
  assert.equal(publicResult.state, "blocked");
  assert.match(publicResult.message, /먼저 비공개로 저장/);
  assert.equal(published.deleteCount(), 0);

  const ready = deleteHarness();
  const plan = await ready.prepareStoreDelete(deletePrepare());
  assert.equal(plan.state, "ready");
  assert.equal(ready.deleteCount(), 0);
  assert.equal(ready.removed.length, 0);
  const duplicateName = deleteRequest();
  duplicateName.append("confirmed_name", "매장 A");
  assert.equal((await plan.execute(duplicateName)).state, "blocked");
  const fileName = deleteRequest();
  fileName.set("confirmed_name", new File(["매장 A"], "name.txt"));
  assert.equal((await plan.execute(fileName)).state, "blocked");
  assert.equal(
    (await plan.execute(deleteRequest({ confirmed_name: "다른 매장" }))).state,
    "blocked",
  );
  assert.equal(
    (await plan.execute(deleteRequest({ version: nextVersion }))).state,
    "blocked",
  );
  assert.equal(ready.getCurrent().id, id);
  assert.equal(ready.deleteCount(), 0);
});

test("every linked counselor blocks deletion and a new race is left to the FK", async () => {
  const statuses = [
    { store_id: id, is_active: true, approval_status: "approved" },
    { store_id: id, is_active: false, approval_status: "approved" },
    { store_id: id, is_active: false, approval_status: "pending" },
  ];
  const linked = deleteHarness({ counselors: statuses });
  const result = await linked.prepareStoreDelete(deletePrepare());
  assert.equal(result.state, "blocked");
  assert.equal(result.linkedCount, 3);
  assert.equal(linked.deleteCount(), 0);

  const raced = deleteHarness({
    beforeDelete: ({ linked: rows }) =>
      rows.push({
        store_id: id,
        is_active: false,
        approval_status: "rejected",
      }),
  });
  const plan = await raced.prepareStoreDelete(deletePrepare());
  const blocked = await plan.execute(deleteRequest());
  assert.equal(blocked.state, "blocked");
  assert.match(blocked.message, /연결된 상담사/);
  assert.equal(raced.deleteCount(), 1);
  assert.equal(raced.getCurrent().id, id);
  assert.equal(raced.removed.length, 0);
});

test("conditional deletion confirms one row before cleaning its server photo", async () => {
  const ready = deleteHarness();
  const plan = await ready.prepareStoreDelete(deletePrepare());
  const result = await plan.execute(deleteRequest());
  assert.equal(result.state, "deleted");
  assert.equal(ready.getCurrent(), null);
  assert.equal(ready.deleteCount(), 1);
  assert.deepEqual(ready.events, ["delete", "remove"]);
  assert.deepEqual(ready.removed, [[oldPath]]);
  const deletion = ready.queries.find((query) => query.kind === "delete");
  assert.deepEqual(deletion.filters, [
    ["id", id],
    ["updated_at", version],
    ["is_active", false],
  ]);
  assert.deepEqual(ready.paths, []);
});

test("delete conflicts, zero rows and database failures never remove photos", async () => {
  for (const [name, options, expected] of [
    ["외래 키 23001", { deleteError: { code: "23001" } }, "blocked"],
    ["외래 키 23503", { deleteError: { code: "23503" } }, "blocked"],
    ["권한", { deleteError: { code: "42501" } }, "denied"],
    ["일반 오류", { deleteError: { code: "XX000" } }, "blocked"],
    ["0행 응답", { deleteError: { code: "PGRST116" } }, "unknown"],
    ["0행", { zeroDelete: true }, "unknown"],
  ]) {
    const instance = deleteHarness(options);
    const plan = await instance.prepareStoreDelete(deletePrepare());
    const result = await plan.execute(deleteRequest());
    assert.equal(result.state, expected, name);
    assert.equal(instance.getCurrent().id, id, name);
    assert.equal(instance.removed.length, 0, name);
  }

  const changed = deleteHarness();
  const changedPlan = await changed.prepareStoreDelete(deletePrepare());
  changed.setCurrent({ ...changed.getCurrent(), updated_at: nextVersion });
  const conflictResult = await changedPlan.execute(deleteRequest());
  assert.equal(conflictResult.state, "conflict");
  assert.equal(changed.deleteCount(), 0);
  assert.equal(changed.removed.length, 0);

  const republished = deleteHarness();
  const publicPlan = await republished.prepareStoreDelete(deletePrepare());
  republished.setCurrent({ ...republished.getCurrent(), is_active: true });
  const publicResult = await publicPlan.execute(deleteRequest());
  assert.equal(publicResult.state, "blocked");
  assert.equal(republished.deleteCount(), 0);
  assert.equal(republished.removed.length, 0);
});

test("shared photos stay, cleanup retries do not repeat DELETE, and lost responses reconcile", async () => {
  const shared = deleteHarness({
    otherStores: [{ ...row, id: "22222222-2222-4222-8222-222222222222" }],
  });
  const sharedPlan = await shared.prepareStoreDelete(deletePrepare());
  const sharedResult = await sharedPlan.execute(deleteRequest());
  assert.equal(sharedResult.state, "deleted");
  assert.equal(shared.removed.length, 0);

  const pending = deleteHarness({ removeError: { message: "storage" } });
  const pendingPlan = await pending.prepareStoreDelete(deletePrepare());
  const pendingResult = await pendingPlan.execute(deleteRequest());
  assert.equal(pendingResult.state, "cleanup_pending");
  assert.equal(pending.deleteCount(), 1);
  assert.equal(pending.removed.length, 1);
  pending.setRemoveError(null);
  const retried = await pendingResult.retryCleanup();
  assert.equal(retried.state, "deleted");
  assert.equal(pending.deleteCount(), 1);
  assert.equal(pending.removed.length, 2);

  const lost = deleteHarness({ throwAfterDelete: true });
  const lostPlan = await lost.prepareStoreDelete(deletePrepare());
  const uncertain = await lostPlan.execute(deleteRequest());
  assert.equal(uncertain.state, "unknown");
  assert.equal(lost.getCurrent(), null);
  assert.equal(lost.removed.length, 0);
  const reconciled = await lostPlan.reconcile();
  assert.equal(reconciled.state, "deleted");
  assert.equal(lost.deleteCount(), 1);
  assert.deepEqual(lost.removed, [[oldPath]]);
});

test("delete reconciliation and cleanup stop safely when authority or reads fail", async () => {
  const instance = deleteHarness({ removeError: { message: "storage" } });
  const plan = await instance.prepareStoreDelete(deletePrepare());
  const result = await plan.execute(deleteRequest());
  assert.equal(result.state, "cleanup_pending");
  instance.setAdmin(false);
  assert.equal((await result.retryCleanup()).state, "denied");
  assert.equal(instance.deleteCount(), 1);

  const unreadable = deleteHarness({
    current: null,
    storeReadError: { code: "XX000" },
  });
  const unreadableResult = await unreadable.prepareStoreDelete(deletePrepare());
  assert.equal(unreadableResult.state, "unknown");
  assert.equal(unreadable.removed.length, 0);
});

test("customer and admin store sources stay inside the existing schema", () => {
  const customer = readFileSync(
    new URL("../lib/data/stores.ts", import.meta.url),
    "utf8",
  );
  assert.equal(customer.includes('.eq("is_active", true)'), true);
  assert.equal(customer.includes('.order("id"'), true);
  assert.equal(customer.includes("id: store.slug"), true);
  assert.equal(customer.includes("phone"), true);
  assert.equal(customer.includes("image_path"), true);
  const counselors = readFileSync(
    new URL("../lib/data/counselors.ts", import.meta.url),
    "utf8",
  );
  assert.equal(counselors.includes('eq("is_active", true)'), true);
  assert.equal(counselors.includes('eq("approval_status", "approved")'), true);
  assert.equal(counselors.includes("stores(name,slug)"), true);
  assert.equal(counselors.includes("storeSlug"), true);
  const page = readFileSync(
    new URL("../app/(site)/stores/page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(page.includes("counselor.storeSlug === store.id"), true);
  assert.equal(page.includes("counselor.storeName === store.name"), false);
  assert.equal(page.includes("공개된 매장이 없습니다."), true);
  assert.equal(page.includes("매장 정보를 불러오지 못했습니다."), true);
  const editor = readFileSync(
    new URL("../components/admin/stores/editor.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(editor.includes("[initial]"), false);
  assert.equal(editor.includes("baseline.current = row"), true);
  assert.equal(editor.includes("initial ? initial.is_active : false"), true);
  assert.equal(editor.includes("선택한 파일 취소"), true);
  assert.equal(editor.includes("사진 제거"), true);
  const actions = readFileSync(
    new URL("../lib/stores/actions.ts", import.meta.url),
    "utf8",
  );
  assert.equal(actions.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(actions.includes("supabase/admin"), false);
  assert.equal(actions.includes(".upsert("), false);
  assert.equal(actions.includes("storage.objects"), false);
  assert.equal(actions.includes("slug: id"), true);
  assert.match(
    actions,
    /export async function saveStore\(form: FormData\)[\s\S]*?const admin = await requireAdmin\(\)/,
  );
  const cleanup = readFileSync(
    new URL("../lib/stores/cleanup.ts", import.meta.url),
    "utf8",
  );
  assert.equal(cleanup.includes(".remove("), true);
  assert.equal(cleanup.includes("storage.objects"), false);
  assert.equal(cleanup.includes('.eq("is_active"'), false);
  const data = readFileSync(
    new URL("../lib/stores/data.ts", import.meta.url),
    "utf8",
  );
  assert.equal(data.includes("requireAdmin"), true);
  assert.equal(data.includes('.order("sort_order"'), true);
  assert.equal(data.includes('.order("id"'), true);
  assert.equal(data.includes('from("counselors")'), true);
  assert.equal(data.includes('count: "exact"'), true);
  const deletion = readFileSync(
    new URL("../lib/stores/delete-actions.ts", import.meta.url),
    "utf8",
  );
  assert.equal(deletion.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(deletion.includes("storage.objects"), false);
  assert.equal(deletion.includes(".delete()"), true);
  assert.equal(deletion.includes('.eq("updated_at", source.version)'), true);
  assert.equal(deletion.includes('.eq("is_active", false)'), true);
  assert.equal(deletion.includes('error.code === "23001"'), true);
  assert.equal(deletion.includes('error.code === "23503"'), true);
  assert.match(
    deletion,
    /export async function prepareStoreDelete\([\s\S]*?const admin = await requireAdmin\(\)/,
  );
  const adminPages = readFileSync(
    new URL("../components/admin/stores/pages.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(adminPages.includes("등록된 매장이 없습니다."), true);
  assert.equal(adminPages.includes("해당하는 매장이 없습니다."), true);
  assert.equal(adminPages.includes("매장 목록을 불러오지 못했습니다."), true);
});

test("admin list keeps an empty page distinct from a failed query", async () => {
  const clientFor = (result) => ({
    "server-only": {},
    "@/lib/admin/auth": {
      requireAdmin: async () => (result.admin === null ? null : { userId: id }),
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          order() {
            return query;
          },
          range: async () => result,
        };
        return { from: () => query };
      },
    },
    "./rules": rules,
  });
  const denied = load(
    "../lib/stores/data.ts",
    clientFor({ admin: null, data: [], count: 0, error: null }),
  );
  assert.equal(await denied.storeAdminList(1), null);
  const empty = load(
    "../lib/stores/data.ts",
    clientFor({ data: [], count: 0, error: null }),
  );
  assert.deepEqual(await empty.storeAdminList(1, ""), { data: [], count: 0 });
  const failed = load(
    "../lib/stores/data.ts",
    clientFor({ data: null, count: null, error: { message: "db" } }),
  );
  assert.deepEqual(await failed.storeAdminList(1, ""), { error: true });
});
