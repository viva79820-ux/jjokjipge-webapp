import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as crypto from "node:crypto";
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
const rules = load("../lib/notices/rules.ts");
const submit = load("../lib/notices/submit.ts");
const upload = load("../lib/notices/upload.ts", { "./rules": rules });
test("image signatures, MIME, decode and upload options execute without binary action data", async () => {
  const prior = globalThis.createImageBitmap;
  let closed = 0;
  globalThis.createImageBitmap = async () => ({
    width: 2,
    height: 3,
    close() {
      closed++;
    },
  });
  try {
    const png = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
      "ignored.svg",
      { type: "image/png" },
    );
    assert.equal((await upload.inspectImage(png)).ext, "png");
    for (const file of [
      new File([], "x.png", { type: "image/png" }),
      new File([new Uint8Array(5242881)], "x.png", { type: "image/png" }),
      new File(["GIF89a"], "x.png", { type: "image/png" }),
      new File([await png.arrayBuffer()], "x.png", { type: "image/gif" }),
    ])
      await assert.rejects(() => upload.inspectImage(file));
    let sent;
    await upload.uploadImage(
      {
        storage: {
          from(b) {
            assert.equal(b, "public-images");
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
      "notices/11111111-1111-4111-8111-111111111111.png",
    );
    assert.equal(sent.file, png);
    assert.equal(sent.options.upsert, false);
    assert.equal(sent.options.contentType, "image/png");
    assert.ok(closed > 0);
    globalThis.createImageBitmap = async () => {
      throw Error("decode");
    };
    await assert.rejects(() => upload.inspectImage(png));
  } finally {
    globalThis.createImageBitmap = prior;
  }
});
const id = "11111111-1111-4111-8111-111111111111",
  version = "2026-11-09T00:00:00.123456+00:00",
  old = `notices/${id}.png`,
  fresh = "notices/22222222-2222-4222-8222-222222222222.png";
const row = {
  id,
  title: "제목",
  body: "본문",
  image_path: old,
  image_alt: "설명",
  is_pinned: false,
  is_published: false,
  published_at: null,
  created_at: version,
  updated_at: version,
};
function form(extra = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    version,
    mode: "update",
    title: "제목",
    body: "본문",
    image_path: old,
    image_alt: "설명",
    is_pinned: "false",
    is_published: "true",
    ...extra,
  }))
    f.set(k, v);
  return f;
}
function harness({
  admin = true,
  current = row,
  mutation = row,
  mutationError = null,
  readError = null,
  refs = 0,
  removeError = null,
  infoError = null,
} = {}) {
  const calls = [],
    paths = [];
  const db = {
    from(table) {
      const q = { kind: "read", steps: [["from", table]] };
      calls.push(q);
      for (const m of [
        "select",
        "eq",
        "order",
        "range",
        "insert",
        "update",
        "delete",
      ]) {
        q[m] = (...args) => {
          q.steps.push([m, ...args]);
          if (["insert", "update", "delete"].includes(m)) q.kind = m;
          return q;
        };
      }
      q.maybeSingle = async () => ({
        data: q.kind === "read" ? current : mutation,
        error: q.kind === "read" ? readError : mutationError,
      });
      q.then = (resolve) =>
        Promise.resolve({ data: [], count: refs, error: readError }).then(
          resolve,
        );
      return q;
    },
    storage: {
      from(b) {
        assert.equal(b, "public-images");
        return {
          info: async () => ({
            data: { size: 1200000, contentType: "image/png" },
            error: infoError,
          }),
          remove: async (p) => {
            calls.push({ removed: p });
            return { error: removeError };
          },
        };
      },
    },
  };
  const cleanup = load("../lib/notices/cleanup.ts", {
    "server-only": {},
    "@/lib/admin/auth": {
      requireAdmin: async () => (admin ? { userId: id } : null),
    },
    "@/lib/supabase/server": { createClient: async () => db },
    "./rules": rules,
  });
  const actions = load("../lib/notices/actions.ts", {
    "./cleanup": cleanup,
    "server-only": {},
    "@/lib/admin/auth": {
      requireAdmin: async () => (admin ? { userId: id } : null),
    },
    "@/lib/supabase/server": { createClient: async () => db },
    "next/cache": { revalidatePath: (p) => paths.push(p) },
    "node:crypto": crypto,
    "./rules": rules,
    "@/lib/admin/support-rules": { versionValid: (s) => s === version },
  });
  const data = load("../lib/notices/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": { requireAdmin: async () => (admin ? {} : null) },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/public": { createPublicClient: () => db },
    "./rules": rules,
  });
  return {
    ...actions,
    ...data,
    calls,
    paths,
    setCurrent(value, error = null) {
      current = value;
      readError = error;
    },
  };
}
test("recovery uses normalized saved fields including null images and rejects mismatches", () => {
  const empty = { ...row, image_path: null, image_alt: null };
  const f = form({
    image_path: "",
    image_alt: "",
    is_published: "false",
    title: "  제목  ",
    body: " 본문\n둘째 줄 ",
  });
  assert.equal(
    rules.noticeMatches({ ...empty, body: "본문\n둘째 줄" }, f),
    true,
  );
  assert.equal(rules.noticeMatches({ ...empty, body: "다른 내용" }, f), false);
  assert.equal(rules.noticeMatches({ ...empty, image_path: fresh }, f), false);
  f.append("title", "중복");
  assert.equal(rules.noticeMatches(empty, f), false);
});
test("recovered cleanup verifies the server snapshot version and persisted outcome before removing", async () => {
  const h = harness();
  const prior = (await h.reloadNotice(id)).recovery;
  const expected = form({ image_path: fresh, is_published: "false" });
  const saved = {
    ...row,
    image_path: fresh,
    updated_at: "2026-11-09T00:00:01.654321+00:00",
  };
  for (const value of [row, { ...saved, title: "다른 제목" }, null]) {
    h.setCurrent(value);
    assert.equal(await prior(expected), false);
  }
  h.setCurrent(saved, {});
  assert.equal(await prior(expected), false);
  h.setCurrent(saved);
  assert.equal(
    await prior(form({ image_path: fresh, version: "다른 버전" })),
    false,
  );
  assert.equal(await prior(expected), true);
  assert.deepEqual(
    h.calls.filter((c) => c.removed).map((c) => c.removed),
    [[old]],
  );
  assert.equal(
    h.calls.some((c) => ["update", "insert", "delete"].includes(c.kind)),
    false,
  );
  const refreshed = (await h.reloadNotice(id)).recovery;
  h.setCurrent(null);
  assert.equal(
    await refreshed(form({ mode: "delete", version: saved.updated_at })),
    true,
  );
  assert.deepEqual(h.calls.filter((c) => c.removed).at(-1).removed, [fresh]);
  const shared = harness({ refs: 1 });
  const preserve = (await shared.reloadNotice(id)).recovery;
  shared.setCurrent(saved);
  assert.equal(await preserve(expected), true);
  assert.equal(
    shared.calls.some((c) => c.removed),
    false,
  );
});
test("upload response loss preserves a known reserved path when cleanup fails", async () => {
  let pending = fresh,
    saved = 0;
  const r = await submit.submitNoticeAttempt(
    {
      upload: async () => {
        throw Error("response lost after upload");
      },
      save: async () => {
        saved++;
      },
      discard: async () => false,
      pendingUpload: () => pending,
    },
    old,
    true,
  );
  assert.equal(r.uploaded, fresh);
  assert.equal(saved, 0);
  assert.equal(r.result.state, "rejected");
});
test("notice scalar validation and safe URLs", () => {
  assert.deepEqual(
    rules.parseNotice(
      form({
        title: "가".repeat(100),
        body: "가".repeat(5000),
        image_alt: "가".repeat(200),
      }),
    ).errors,
    {},
  );
  for (const [key, val] of [
    ["title", " "],
    ["title", "가".repeat(101)],
    ["body", "가".repeat(5001)],
    ["image_path", "https://evil.invalid"],
    ["image_alt", "가".repeat(201)],
  ])
    assert.ok(
      Object.keys(rules.parseNotice(form({ [key]: val })).errors).length,
    );
  for (const key of ["title", "body", "image_path", "is_published"]) {
    for (const type of ["duplicate", "file", "missing"]) {
      const f = form();
      if (type === "duplicate") f.append(key, "x");
      if (type === "file") f.set(key, new File(["x"], "x"));
      if (type === "missing") f.delete(key);
      assert.ok(Object.keys(rules.parseNotice(f).errors).length);
    }
  }
  assert.equal(rules.returnUrl("//evil.invalid"), "/admin/notices");
  assert.equal(rules.filters({ page: ["1", "2"] }), null);
  assert.equal(
    rules.returnUrl("/admin/notices?status=private&notice=saved"),
    "/admin/notices?status=private",
  );
});

test("cleanup capabilities retain server-scoped path, administrator and expiry", async () => {
  let userId = id,
    accessed = 0;
  const scoped = load("../lib/notices/cleanup.ts", {
    "server-only": {},
    "@/lib/admin/auth": {
      requireAdmin: async () => (userId ? { userId } : null),
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        accessed++;
        throw Error("must not reach DB");
      },
    },
    "./rules": rules,
  });
  const capability = scoped.cleanupAction(old, id);
  userId = "22222222-2222-4222-8222-222222222222";
  assert.equal(await capability(), false);
  userId = null;
  assert.equal(await capability(), false);
  userId = id;
  assert.equal(await scoped.cleanupAction(old, id, 0)(), false);
  assert.equal(await scoped.cleanupAction("stores/unrelated.png", id)(), false);
  assert.equal(accessed, 0);
});
test("non admins never reach notice DB or Storage", async () => {
  const h = harness({ admin: false });
  await h.saveNotice(form());
  await h.reloadNotice(id);
  assert.equal(await h.prepareNoticeUpload("png"), null);
  await h.noticeList(1, "", true);
  await h.noticeDetail(id, true);
  assert.equal(h.calls.length, 0);
});
test("public notice reads explicitly filter published and sort/page in DB", async () => {
  const h = harness();
  await h.noticeList(2);
  const steps = h.calls[0].steps;
  assert.ok(
    steps.some(
      (s) => s[0] === "eq" && s[1] === "is_published" && s[2] === true,
    ),
  );
  assert.deepEqual(
    steps.filter((s) => s[0] === "order").map((s) => s[1]),
    ["is_pinned", "published_at", "id"],
  );
  assert.deepEqual(
    steps.find((s) => s[0] === "range"),
    ["range", 20, 39],
  );
  assert.equal(steps.find((s) => s[0] === "select")[1].includes("body"), false);
  await h.noticeDetail(id);
  assert.ok(
    h.calls[1].steps.some((s) => s[0] === "eq" && s[1] === "is_published"),
  );
});
test("save allowlist, precise CAS and first publication server time", async () => {
  const h = harness();
  const r = await h.saveNotice(
    form({ published_at: "forged", created_at: "forged" }),
  );
  assert.equal(r.state, "saved");
  const update = h.calls.find((q) => q.kind === "update");
  const payload = update.steps.find((s) => s[0] === "update")[1];
  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      "title",
      "body",
      "image_path",
      "image_alt",
      "is_pinned",
      "is_published",
      "published_at",
    ].sort(),
  );
  assert.ok(Date.parse(payload.published_at));
  assert.notEqual(payload.published_at, "forged");
  assert.ok(
    update.steps.some(
      (s) => s[0] === "eq" && s[1] === "updated_at" && s[2] === version,
    ),
  );
  await h.refreshNotices(id);
  assert.ok(h.paths.includes("/notices"));
});
test("private and republish retain first publication timestamp", async () => {
  for (const is_published of ["false", "true"]) {
    const h = harness({ current: { ...row, published_at: version } });
    await h.saveNotice(form({ is_published }));
    assert.equal(
      h.calls
        .find((q) => q.kind === "update")
        .steps.find((s) => s[0] === "update")[1].published_at,
      version,
    );
  }
});
test("new draft ID remains stable; repeated create cannot upsert an existing notice", async () => {
  const h = harness({ current: null });
  const r = await h.saveNotice(
    form({
      mode: "create",
      is_published: "false",
      image_path: "",
      image_alt: "",
    }),
  );
  assert.equal(r.state, "saved");
  const insert = h.calls
    .find((q) => q.kind === "insert")
    .steps.find((s) => s[0] === "insert")[1];
  assert.equal(insert.id, id);
  assert.equal(insert.published_at, null);
  assert.equal(insert.is_pinned, false);
  const repeat = harness();
  assert.equal(
    (await repeat.saveNotice(form({ mode: "create" }))).state,
    "conflict",
  );
  assert.equal(
    repeat.calls.some((q) => q.kind === "insert"),
    false,
  );
});
test("stale and zero row mutations do not clean old files", async () => {
  for (const options of [
    { current: { ...row, updated_at: "older" } },
    { mutation: null },
  ]) {
    const h = harness(options);
    assert.equal(
      (await h.saveNotice(form({ image_path: fresh }))).state,
      "conflict",
    );
    assert.equal(
      h.calls.some((c) => c.removed),
      false,
    );
  }
});
test("replace/remove/delete clean only after DB success, retry does not write DB", async () => {
  for (const extra of [
    { image_path: fresh },
    { image_path: "", image_alt: "" },
    { mode: "delete" },
  ]) {
    const h = harness({ removeError: {} });
    const r = await h.saveNotice(form(extra));
    assert.equal(r.state, "saved");
    assert.ok(r.cleanup);
    assert.deepEqual(h.calls.find((c) => c.removed).removed, [old]);
    const mutations = h.calls.filter((q) =>
      ["update", "delete"].includes(q.kind),
    ).length;
    await r.cleanup();
    assert.equal(
      h.calls.filter((q) => ["update", "delete"].includes(q.kind)).length,
      mutations,
    );
  }
});
test("referenced paths and reference query failures never remove files", async () => {
  for (const options of [{ refs: 1 }, { readError: {} }]) {
    const h = harness(options);
    const reserved = await h.prepareNoticeUpload("png");
    await reserved.cleanup();
    assert.equal(
      h.calls.some((c) => c.removed),
      false,
    );
  }
});
test("image info failure rejects replacement; errors remain uncertain", async () => {
  const h = harness({ infoError: {} });
  assert.equal(
    (await h.saveNotice(form({ image_path: fresh }))).state,
    "rejected",
  );
  assert.equal(
    h.calls.some((q) => q.kind === "update"),
    false,
  );
  const u = harness({ mutationError: { code: "FETCH" } });
  assert.equal((await u.saveNotice(form())).state, "unknown");
  assert.equal(
    u.calls.some((c) => c.removed),
    false,
  );
});
test("browser orchestration preserves binary boundary and files on lost responses", async () => {
  for (const state of ["saved", "unknown", "rejected", "conflict"]) {
    const removed = [];
    const r = await submit.submitNoticeAttempt(
      {
        upload: async () => fresh,
        save: async (p) => {
          assert.equal(typeof p, "string");
          return { state, message: state };
        },
        discard: async (p) => {
          removed.push(p);
          return true;
        },
      },
      old,
      true,
    );
    assert.equal(
      removed.length,
      ["rejected", "conflict"].includes(state) ? 1 : 0,
    );
    assert.equal(r.result.state, state);
  }
  let saved = false;
  await submit.submitNoticeAttempt(
    {
      upload: async () => {
        throw Error();
      },
      save: async () => {
        saved = true;
      },
      discard: async () => true,
    },
    old,
    true,
  );
  assert.equal(saved, false);
  const r = await submit.submitNoticeAttempt(
    {
      upload: async () => fresh,
      save: async () => {
        throw Error();
      },
      discard: async () => {
        throw Error("must not delete");
      },
    },
    old,
    true,
  );
  assert.equal(r.result.state, "unknown");
  assert.equal(r.uploaded, fresh);
});
