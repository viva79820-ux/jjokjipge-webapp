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
const rules = load("../lib/counselors/rules.ts");
const submit = load("../lib/counselors/submit.ts");
const upload = load("../lib/counselors/upload.ts", { "./rules": rules });
const id = "11111111-1111-4111-8111-111111111111";
const storeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const version = "2026-11-11T00:00:00.123456+00:00";
const nextVersion = "2026-11-11T00:00:01.654321+00:00";
const oldPath = `counselors/${id}.png`;
const fresh = "counselors/22222222-2222-4222-8222-222222222222.jpg";
const row = {
  id,
  slug: "a",
  store_id: storeId,
  name: "상담사 A",
  field: "tarot",
  fields: ["tarot", "saju"],
  tags: ["타로", "연애운"],
  careers: ["사주명리상담경력 10년", "타로 심리상담사1급"],
  intro: "한 줄",
  description: "첫째 줄\n둘째 줄",
  image_path: oldPath,
  is_recommended: false,
  is_new: false,
  is_active: false,
  sort_order: 3,
  affiliation: "store",
  approval_status: "pending",
  expert_url: "https://example.invalid/keep",
  updated_at: version,
};
function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version,
    mode: "update",
    name: "상담사 A",
    field: "tarot",
    fields: JSON.stringify(["tarot", "saju"]),
    tags: JSON.stringify(["타로", "연애운"]),
    careers: JSON.stringify(["사주명리상담경력 10년", "타로 심리상담사1급"]),
    intro: "한 줄",
    description: "첫째 줄\n둘째 줄",
    image_path: oldPath,
    store_id: storeId,
    is_recommended: "false",
    is_new: "false",
    is_active: "true",
    sort_order: "3",
    slug: "client-slug",
    affiliation: "partner",
    approval_status: "approved",
    expert_url: "https://example.invalid/overwrite",
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
  store = { id: storeId },
  storeError = null,
  loseUpdate = false,
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
    if (query.table === "stores") return { data: store, error: storeError };
    const image = query.filters.find((item) => item[0] === "image_path");
    if (!single && image) return { data: null, count: refs, error: readError };
    if (query.kind === "insert") {
      if (current?.id === query.payload.id)
        return { data: null, error: { code: "23505" } };
      current = {
        ...row,
        ...query.payload,
        affiliation: "store",
        approval_status: "approved",
        expert_url: null,
        updated_at: nextVersion,
      };
      return { data: current, error: mutationError };
    }
    if (query.kind === "update") {
      const versionFilter = query.filters.find(
        (item) => item[0] === "updated_at",
      );
      if (loseUpdate || !current || versionFilter?.[1] !== current.updated_at)
        return { data: null, error: mutationError };
      current = {
        ...current,
        ...query.payload,
        updated_at: nextVersion,
      };
      return { data: current, error: mutationError };
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
  const cleanup = load("../lib/counselors/cleanup.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  const actions = load("../lib/counselors/actions.ts", {
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
  };
}
test("photo signatures, size, MIME, decode and upload options stay on the client", async () => {
  const prior = globalThis.createImageBitmap;
  let closed = 0;
  globalThis.createImageBitmap = async () => ({
    width: 4,
    height: 8,
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
    assert.equal(sent.file, png);
    assert.equal(sent.options.upsert, false);
    assert.equal(sent.options.contentType, "image/png");
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
test("array, field, career, store, boolean and order validation", () => {
  const ok = rules.parseCounselor(
    form({
      name: ` ${"가".repeat(30)} `,
      fields: JSON.stringify(["saju", "tarot"]),
      field: "saju",
      careers: JSON.stringify([
        "  유니버셜웨이트타로카드, 르노르망카드 실전이수  ",
        "가".repeat(200),
      ]),
      tags: JSON.stringify(["타로", "연애운"]),
      intro: "",
      description: `  ${"나".repeat(5000)}  `,
      sort_order: "9999",
      store_id: "",
      image_path: "",
      is_active: "false",
    }),
  );
  assert.equal(Object.keys(ok.errors).length, 0);
  assert.deepEqual(ok.patch.fields, ["saju", "tarot"]);
  assert.equal(ok.patch.field, "saju");
  assert.equal(
    ok.patch.careers[0],
    "유니버셜웨이트타로카드, 르노르망카드 실전이수",
  );
  assert.equal(ok.patch.careers[1].length, 200);
  assert.deepEqual(ok.patch.tags, ["타로", "연애운"]);
  assert.equal(ok.patch.store_id, null);
  assert.equal(ok.patch.image_path, null);
  assert.equal(ok.patch.sort_order, 9999);
  assert.equal(ok.patch.description.startsWith("나"), true);
  const file = form();
  file.delete("fields");
  file.append(
    "fields",
    new File(["[]"], "fields.json", { type: "application/json" }),
  );
  assert.equal(rules.stringArray(file, "fields"), null);
  for (const extra of [
    { name: "   " },
    { name: "가".repeat(31) },
    { fields: "{" },
    { fields: JSON.stringify([1, "tarot"]) },
    { fields: JSON.stringify(["tarot", "tarot"]) },
    { fields: JSON.stringify(["fortune"]) },
    { fields: JSON.stringify([]) },
    { field: "tarot", fields: JSON.stringify(["saju"]) },
    { field: "TRUE" },
    { careers: JSON.stringify(["   "]) },
    { careers: JSON.stringify(["가".repeat(201)]) },
    { careers: JSON.stringify(Array.from({ length: 21 }, () => "경력")) },
    {
      careers: "[]",
      tags: JSON.stringify(Array.from({ length: 9 }, () => "주제")),
    },
    { tags: JSON.stringify(["가".repeat(21)]) },
    { intro: " " },
    { intro: "가".repeat(151) },
    { description: " " },
    { image_path: "notices/11111111-1111-4111-8111-111111111111.png" },
    { image_path: oldPath.toUpperCase() },
    { store_id: "missing" },
    { is_active: "TRUE" },
    { is_recommended: "1" },
    { is_new: "" },
    { sort_order: "01" },
    { sort_order: "10000" },
    { sort_order: "1.5" },
    { sort_order: "-1" },
  ]) {
    const parsed = rules.parseCounselor(form(extra));
    assert.equal(
      Object.keys(parsed.errors).length > 0,
      true,
      JSON.stringify(extra),
    );
  }
  const duplicated = form();
  duplicated.append("name", "다른 이름");
  assert.equal(
    rules.parseCounselor(duplicated).errors.name !== undefined,
    true,
  );
});
test("chips, filters and honorifics do not rewrite stored values", () => {
  assert.deepEqual(
    rules.displayChips({
      field: "saju",
      fields: ["tarot", "saju"],
      tags: ["타로", "연애운", "연애운", "진로"],
    }),
    ["사주", "타로", "연애운", "진로"],
  );
  const people = [
    { id: "both", fields: ["tarot", "saju"] },
    { id: "tarot", fields: ["tarot"] },
    { id: "saju", fields: ["saju"] },
  ];
  assert.deepEqual(
    rules.filterByField(people, "all").map((item) => item.id),
    ["both", "tarot", "saju"],
  );
  assert.deepEqual(
    rules.filterByField(people, "tarot").map((item) => item.id),
    ["both", "tarot"],
  );
  assert.deepEqual(
    rules.filterByField(people, "saju").map((item) => item.id),
    ["both", "saju"],
  );
  assert.equal(rules.counselorHeading("상담사 A"), "상담사 A 선생님");
  assert.equal(rules.counselorHeading("가연샘"), "가연샘");
  assert.equal(rules.counselorHeading("가연쌤"), "가연쌤");
  assert.equal(rules.counselorHeading("김선생님"), "김선생님");
  assert.equal(rules.counselorNeedsHonorific("가연샘"), false);
  assert.equal(
    rules.counselorMatches(
      row,
      form({
        careers: JSON.stringify([
          "타로 심리상담사1급",
          "사주명리상담경력 10년",
        ]),
      }),
    ),
    false,
  );
  assert.equal(rules.counselorMatches(row, form({ is_active: "false" })), true);
  assert.equal(
    rules.counselorMatches(row, form({ is_active: "false", sort_order: "4" })),
    false,
  );
  assert.equal(
    rules.counselorMatches(
      { ...row, is_active: true },
      form({ name: "  상담사 A  ", description: "  첫째 줄\n둘째 줄  " }),
    ),
    true,
  );
});
test("non-admin actions and partial matches never write", async () => {
  const blocked = harness({ admin: false });
  assert.equal((await blocked.saveCounselor(form())).state, "rejected");
  assert.equal((await blocked.reloadCounselor(id)).state, "rejected");
  assert.equal(await blocked.prepareCounselorUpload("png"), null);
  assert.equal(blocked.calls.length, 0);
  const lost = { ...row, is_active: true, careers: ["다른 경력"] };
  assert.equal(rules.counselorMatches(lost, form()), false);
  assert.equal(
    rules.counselorMatches(
      { ...row, is_active: true, name: "상담사 A" },
      form({ tags: JSON.stringify(["연애운"]) }),
    ),
    false,
  );
});
test("save uses an allowlist, exact version, stable slug and does not upsert", async () => {
  const h = harness();
  const saved = await h.saveCounselor(form());
  assert.equal(saved.state, "saved");
  const update = h.calls.find((call) => call.kind === "update");
  assert.deepEqual(Object.keys(update.payload).sort(), [
    "careers",
    "description",
    "field",
    "fields",
    "image_path",
    "intro",
    "is_active",
    "is_new",
    "is_recommended",
    "name",
    "sort_order",
    "store_id",
    "tags",
  ]);
  assert.equal(
    update.filters.find((item) => item[0] === "updated_at")[1],
    version,
  );
  assert.equal(saved.row.slug, "a");
  assert.equal(saved.row.affiliation, "store");
  assert.equal(saved.row.approval_status, "pending");
  assert.equal(saved.row.expert_url, "https://example.invalid/keep");
  assert.deepEqual(h.paths, [
    "/admin/counselors",
    `/admin/counselors/${id}`,
    "/",
    "/consult",
    "/stores",
    "/consult/a",
    "/consult/a/book",
  ]);
  const stale = harness();
  assert.equal(
    (await stale.saveCounselor(form({ version: "2026-11-11T00:00:00.123Z" })))
      .state,
    "rejected",
  );
  assert.equal(
    stale.calls.some((call) => call.kind === "update"),
    false,
  );
  const conflicted = harness();
  assert.equal(
    (await conflicted.saveCounselor(form({ version: nextVersion }))).state,
    "conflict",
  );
  assert.equal(
    conflicted.calls.some((call) => call.kind === "update"),
    false,
  );
  const empty = harness({ loseUpdate: true });
  assert.equal((await empty.saveCounselor(form())).state, "conflict");
  const deniedStore = harness({ store: null });
  const storeResult = await deniedStore.saveCounselor(form());
  assert.equal(storeResult.state, "rejected");
  assert.equal(storeResult.errors.store_id !== undefined, true);
  assert.equal(
    deniedStore.calls.some((call) => call.kind === "update"),
    false,
  );
  const exists = harness();
  assert.equal(
    (await exists.saveCounselor(form({ mode: "create" }))).state,
    "conflict",
  );
  assert.equal(
    exists.calls.some((call) => call.kind === "insert"),
    false,
  );
  const created = harness({ current: null });
  const createResult = await created.saveCounselor(
    form({
      mode: "create",
      version: "",
      image_path: "",
      is_active: "false",
      fields: JSON.stringify(["tarot"]),
      field: "tarot",
      tags: "[]",
      careers: "[]",
      intro: "",
      description: "",
      store_id: "",
    }),
  );
  assert.equal(createResult.state, "saved");
  const inserted = created.calls.find((call) => call.kind === "insert").payload;
  assert.equal(inserted.slug, id);
  assert.equal(inserted.id, id);
  assert.equal(Object.hasOwn(inserted, "affiliation"), false);
  assert.equal(Object.hasOwn(inserted, "approval_status"), false);
  assert.equal(Object.hasOwn(inserted, "expert_url"), false);
  assert.equal(createResult.row.slug, id);
  assert.equal(createResult.row.approval_status, "approved");
});
test("image reuse, metadata and response loss compare the whole saved row", async () => {
  const shared = harness({ refs: 1 });
  const reused = await shared.saveCounselor(form({ image_path: fresh }));
  assert.equal(reused.state, "rejected");
  assert.equal(
    shared.calls.some((call) => call.kind === "update"),
    false,
  );
  const bad = harness({ info: { size: 0, contentType: "image/png" } });
  assert.equal(
    (await bad.saveCounselor(form({ image_path: fresh }))).state,
    "rejected",
  );
  const unknownInfo = harness({
    infoError: { message: "network" },
    info: null,
  });
  assert.equal(
    (await unknownInfo.saveCounselor(form({ image_path: fresh }))).state,
    "unknown",
  );
  const same = harness();
  assert.equal((await same.saveCounselor(form())).state, "saved");
  assert.equal(same.infoCalls(), 0);
  let discarded = 0;
  const lost = await submit.submitCounselorAttempt(
    {
      upload: async () => fresh,
      save: async () => {
        throw Error("lost");
      },
      discard: async () => {
        discarded += 1;
        return true;
      },
    },
    oldPath,
    true,
  );
  assert.equal(lost.result.state, "unknown");
  assert.equal(lost.uploaded, fresh);
  assert.equal(discarded, 0);
  const rejected = await submit.submitCounselorAttempt(
    {
      upload: async () => fresh,
      save: async () => ({ state: "rejected", message: "거부" }),
      discard: async () => {
        discarded += 1;
        return true;
      },
    },
    oldPath,
    true,
  );
  assert.equal(rejected.uploaded, null);
  assert.equal(discarded, 1);
  const kept = await submit.submitCounselorAttempt(
    {
      upload: async () => fresh,
      save: async () => ({
        state: "conflict",
        message: "이미 저장",
        row: { ...row, image_path: fresh },
      }),
      discard: async () => {
        discarded += 1;
        return true;
      },
    },
    oldPath,
    true,
  );
  assert.equal(kept.uploaded, fresh);
  assert.equal(discarded, 1);
});
test("cleanup preserves references and retries without saving again", async () => {
  const h = harness();
  const reserved = await h.prepareCounselorUpload("jpg");
  assert.equal(reserved.path, fresh);
  assert.equal(await reserved.cleanup(), true);
  assert.deepEqual(h.removed, [[fresh]]);
  const shared = harness({ refs: 1 });
  const token = await shared.prepareCounselorUpload("png");
  assert.equal(await token.cleanup(), true);
  assert.equal(shared.removed.length, 0);
  const outsider = harness({ admin: false });
  assert.equal(
    await outsider.removeUnreferenced(
      {
        from() {
          throw Error("no");
        },
      },
      "notices/11111111-1111-4111-8111-111111111111.png",
    ),
    false,
  );
  assert.equal(
    await outsider.removeUnreferenced(
      {
        from() {
          throw Error("no");
        },
      },
      "../counselors/secret.png",
    ),
    false,
  );
  const failed = harness({ removeError: { message: "storage" } });
  const changed = await failed.saveCounselor(form({ image_path: "" }));
  assert.equal(changed.state, "saved");
  assert.equal(typeof changed.cleanup, "function");
  assert.equal(failed.calls.filter((call) => call.kind === "update").length, 1);
  assert.equal(await changed.cleanup(), false);
  failed.removed.length = 0;
  const retryDb = harness();
  const again = await retryDb.saveCounselor(form({ image_path: "" }));
  assert.equal(again.cleanup, undefined);
  assert.deepEqual(retryDb.removed, [[oldPath]]);
  const ready = harness();
  const loaded = await ready.reloadCounselor(id);
  const expected = form({ image_path: fresh });
  const saved = {
    ...row,
    image_path: fresh,
    is_active: true,
    updated_at: nextVersion,
  };
  ready.setCurrent(saved);
  assert.equal(
    await loaded.recovery(form({ image_path: fresh, name: "다른 이름" })),
    false,
  );
  assert.equal(ready.removed.length, 0);
  assert.equal(await loaded.recovery(expected), true);
  assert.deepEqual(ready.removed.at(-1), [oldPath]);
  assert.equal(
    ready.calls.some((call) => call.kind === "update"),
    false,
  );
  const referenced = harness({ refs: 1 });
  const kept = await referenced.reloadCounselor(id);
  referenced.setCurrent(saved);
  assert.equal(await kept.recovery(expected), true);
  assert.equal(referenced.removed.length, 0);
});
test("public counselor query keeps the public client conditions", () => {
  const source = readFileSync(
    new URL("../lib/data/counselors.ts", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes('eq("is_active", true)'), true);
  assert.equal(source.includes('eq("approval_status", "approved")'), true);
  assert.equal(source.includes("fields,tags,careers"), true);
  assert.equal(source.includes("image_path"), true);
  const actionSource = readFileSync(
    new URL("../lib/counselors/actions.ts", import.meta.url),
    "utf8",
  );
  assert.equal(actionSource.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(actionSource.includes("supabase/admin"), false);
  assert.equal(actionSource.includes(".upsert("), false);
  assert.equal(actionSource.includes("slug: id"), true);
});
