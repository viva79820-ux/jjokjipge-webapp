import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
const ts = createRequire(import.meta.url)("typescript");
function load(file, adapters = {}) {
  const code = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    assert.ok(name in adapters, `Unexpected dependency ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}
const labels = {
  reservation_payment: "예약·입금",
  cancellation_refund: "취소·환불",
  consultation: "상담 방식",
  shop: "타로샵",
  other: "기타",
};
const rules = load("../lib/admin/support-rules.ts", {
  "../inquiries/validation": { categoryLabels: labels },
});
test("saved navigation keeps only approved filters and fixed notice codes", () => {
  assert.equal(
    rules.supportSavedUrl(
      "faqs",
      "/admin/support/faqs?category=shop&status=private&page=2",
    ),
    "/admin/support/faqs?category=shop&status=private&page=2&notice=saved",
  );
  assert.equal(
    rules.supportSavedUrl(
      "inquiries",
      "/admin/support/inquiries?category=shop&status=pending&page=3",
    ),
    "/admin/support/inquiries?category=shop&status=answered&notice=saved",
  );
  assert.equal(
    rules.supportSavedUrl("inquiries", "//external.invalid"),
    "/admin/support/inquiries?status=answered&notice=saved",
  );
  for (const notice of ["arbitrary", ["saved", "saved"]])
    assert.equal(rules.supportListQuery({ notice }).valid, false);
  const parsed = rules.supportListQuery({ category: "shop", notice: "saved" });
  assert.equal(parsed.saved, true);
  assert.ok(rules.parseSupportFilters("faqs", parsed.filters));
  assert.equal(
    rules.supportReturn("faqs", "/admin/support/faqs?notice=saved"),
    "/admin/support/faqs",
  );
});
const id = "11111111-1111-4111-8111-111111111111",
  version = "2026-11-06T01:02:03.123456+00:00";
const faq = {
  id,
  category: "shop",
  question: "테스트",
  answer: "답변\n두 줄",
  sort_order: 0,
  is_active: false,
  updated_at: version,
};
const inquiry = {
  ...faq,
  status: "pending",
  answer: null,
  inquiry_no: "I-20261106-0001",
};
function form(values = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    mode: "update",
    id,
    version,
    category: "shop",
    question: "테스트",
    answer: "새 답변\n두 줄",
    sort_order: "0",
    is_active: "false",
    ...values,
  }))
    f.set(k, v);
  return f;
}
function harness({
  admin = { userId: id },
  current = faq,
  result = [faq],
  error = null,
  readError = null,
  responses = [],
} = {}) {
  const calls = [],
    invalidations = [];
  let clients = 0;
  const db = {
    from(table) {
      const steps = [["from", table]];
      calls.push(steps);
      const q = {};
      for (const method of [
        "select",
        "eq",
        "order",
        "range",
        "returns",
        "insert",
        "update",
        "delete",
      ])
        q[method] = (...a) => {
          steps.push([method, ...a]);
          return q;
        };
      q.maybeSingle = async () => ({ data: current, error: readError });
      q.then = (resolve) =>
        Promise.resolve(
          responses.shift() ?? { data: result, error, count: 21 },
        ).then(resolve);
      return q;
    },
  };
  const adapters = {
    "server-only": {},
    "./auth": { requireAdmin: async () => admin },
    "@/lib/supabase/server": {
      createClient: async () => {
        clients++;
        return db;
      },
    },
    "./support-rules": rules,
  };
  const data = load("../lib/admin/support-data.ts", adapters);
  const actions = load("../lib/admin/support-actions.ts", {
    ...adapters,
    "./support-data": data,
    "next/cache": { revalidatePath: (p) => invalidations.push(p) },
  });
  return { ...data, ...actions, calls, invalidations, clients: () => clients };
}
test("all customer support reads and actions stop for non-admin before DB", async () => {
  const h = harness({ admin: null });
  for (const name of ["getFaqList", "getInquiryList"])
    assert.equal(await h[name]({ category: "", status: "", page: 1 }), null);
  for (const name of ["getFaqDetail", "getInquiryDetail"])
    assert.equal(await h[name](id), null);
  for (const name of ["saveFaq", "deleteFaq", "saveInquiryAnswer"])
    assert.equal((await h[name](form())).success, false);
  for (const name of ["reloadFaq", "reloadInquiry"])
    assert.equal((await h[name](id)).success, false);
  assert.equal(h.clients(), 0);
});
test("FAQ input limits, categories, order, duplicates, missing fields and Files", async () => {
  for (const [key, value] of [
    ["category", "other"],
    ["question", " "],
    ["question", "가".repeat(301)],
    ["answer", "가".repeat(5001)],
    ["sort_order", "-1"],
    ["sort_order", "1.1"],
    ["sort_order", "2147483648"],
    ["sort_order", "1e2"],
    ["is_active", "on"],
  ]) {
    const h = harness();
    assert.equal((await h.saveFaq(form({ [key]: value }))).success, false);
    assert.equal(h.clients(), 0);
  }
  for (const key of [
    "category",
    "question",
    "answer",
    "sort_order",
    "is_active",
    "id",
    "version",
    "mode",
  ])
    for (const mutation of ["duplicate", "missing", "file"]) {
      const f = form();
      if (mutation === "duplicate") f.append(key, "x");
      else if (mutation === "missing") f.delete(key);
      else f.set(key, new File(["x"], "test.txt"));
      const h = harness();
      assert.equal((await h.saveFaq(f)).success, false, `${key}/${mutation}`);
      assert.equal(h.clients(), 0);
    }
  for (const [key, value] of [
    ["question", "가".repeat(300)],
    ["answer", "가".repeat(5000)],
    ["sort_order", "2147483647"],
  ])
    assert.deepEqual(rules.parseFaq(form({ [key]: value })).errors, {});
});
test("FAQ create writes only five fields with explicit non-public value", async () => {
  const h = harness();
  const f = form({
    mode: "create",
    updated_at: "forged",
    created_at: "forged",
  });
  assert.equal((await h.saveFaq(f)).success, true);
  const patch = h.calls[0].find((s) => s[0] === "insert")[1];
  assert.deepEqual(Object.keys(patch).sort(), [
    "answer",
    "category",
    "is_active",
    "question",
    "sort_order",
  ]);
  assert.equal(patch.is_active, false);
  assert.equal(patch.answer, "새 답변\n두 줄");
  assert.deepEqual(h.invalidations, [
    "/admin/support/faqs",
    `/admin/support/faqs/${id}`,
    "/support",
  ]);
});
test("FAQ update/delete preserve exact version in precheck and mutation; stale and racing updates fail", async () => {
  for (const action of ["saveFaq", "deleteFaq"]) {
    const h = harness();
    assert.equal((await h[action](form())).success, true);
    assert.ok(
      h.calls[1].some(
        (s) => s[0] === "eq" && s[1] === "updated_at" && s[2] === version,
      ),
    );
    assert.ok(
      h.calls[1].some((s) => s[0] === "eq" && s[1] === "id" && s[2] === id),
    );
    const stale = harness({
      current: { ...faq, updated_at: "2026-11-07T00:00:00Z" },
    });
    assert.equal((await stale[action](form())).message, rules.conflict.faqs);
    assert.equal(stale.calls.length, 1);
    const race = harness({ result: [] });
    assert.equal((await race[action](form())).conflict, true);
    assert.deepEqual(race.invalidations, []);
  }
});
test("answer writes only allowed fields with verified author/server time; no-op and conflict", async () => {
  const h = harness({
    current: inquiry,
    result: [{ ...inquiry, status: "answered", answer: "새 답변" }],
  });
  assert.equal(
    (
      await h.saveInquiryAnswer(
        form({
          answered_by: "forged",
          answered_at: "forged",
          status: "pending",
        }),
      )
    ).success,
    true,
  );
  const patch = h.calls[1].find((s) => s[0] === "update")[1];
  assert.deepEqual(Object.keys(patch).sort(), [
    "answer",
    "answered_at",
    "answered_by",
    "status",
  ]);
  assert.equal(patch.answered_by, id);
  assert.equal(patch.status, "answered");
  assert.ok(Number.isFinite(Date.parse(patch.answered_at)));
  assert.ok(
    h.calls[1].some(
      (s) => s[0] === "eq" && s[1] === "status" && s[2] === "pending",
    ),
  );
  assert.ok(
    h.calls[1].some(
      (s) => s[0] === "eq" && s[1] === "updated_at" && s[2] === version,
    ),
  );
  assert.deepEqual(h.invalidations, [
    "/admin/support/inquiries",
    `/admin/support/inquiries/${id}`,
    "/admin",
  ]);
  const noop = harness({
    current: { ...inquiry, status: "answered", answer: "새 답변\n두 줄" },
  });
  assert.match((await noop.saveInquiryAnswer(form())).message, /변경된 내용/);
  assert.equal(noop.calls.length, 1);
  for (const options of [
    { current: { ...inquiry, updated_at: "2026-11-07T00:00:00Z" } },
    { current: inquiry, result: [] },
  ])
    assert.equal(
      (await harness(options).saveInquiryAnswer(form())).message,
      rules.conflict.inquiries,
    );
  const edit = harness({
    current: { ...inquiry, status: "answered", answer: "기존" },
  });
  assert.equal((await edit.saveInquiryAnswer(form())).success, true);
  for (const value of ["", " ", "가".repeat(5001)]) {
    const invalid = harness();
    assert.ok(
      (await invalid.saveInquiryAnswer(form({ answer: value }))).errors.answer,
    );
    assert.equal(invalid.clients(), 0);
  }
});
test("lists use DB filters, stable sort, 20-row ranges and minimal inquiry columns", async () => {
  const f = { category: "shop", status: "", page: 2 };
  const h = harness();
  await h.getFaqList({ ...f, status: "private" });
  await h.getInquiryList({ ...f, status: "pending" });
  assert.deepEqual(
    h.calls[0].filter((s) => s[0] === "order"),
    [
      ["order", "sort_order", { ascending: true }],
      ["order", "id", { ascending: true }],
    ],
  );
  assert.ok(
    h.calls[0].some(
      (s) => s[0] === "eq" && s[1] === "is_active" && s[2] === false,
    ),
  );
  assert.deepEqual(
    h.calls[1].filter((s) => s[0] === "order"),
    [
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
    ],
  );
  for (const call of h.calls)
    assert.deepEqual(
      call.find((s) => s[0] === "range"),
      ["range", 20, 39],
    );
  assert.equal(
    h.calls[1].find((s) => s[0] === "select")[1],
    "id,inquiry_no,customer_name,category,created_at,status",
  );
  const all = harness();
  await all.getFaqList({ ...f, category: "", page: 1 });
  assert.equal(
    all.calls[0].some((s) => s[0] === "eq"),
    false,
  );
});
test("out-of-range pages recount with the same filters so empty last pages can redirect", async () => {
  for (const kind of ["faqs", "inquiries"]) {
    const h = harness({
      responses: [
        { data: null, error: { code: "PGRST103" }, count: null },
        { data: null, error: null, count: 20 },
      ],
    });
    const filters = {
      category: "shop",
      status: kind === "faqs" ? "private" : "pending",
      page: 2,
    };
    const list = kind === "faqs" ? h.getFaqList : h.getInquiryList;
    assert.deepEqual(await list(filters), { data: [], count: 20 });
    assert.deepEqual(h.calls[1], [
      ["from", kind],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "category", "shop"],
      [
        "eq",
        kind === "faqs" ? "is_active" : "status",
        kind === "faqs" ? false : "pending",
      ],
    ]);
    const broken = harness({
      responses: [
        { data: null, error: { code: "PGRST103" }, count: null },
        { data: null, error: { code: "unavailable" }, count: null },
      ],
    });
    await assert.rejects(() =>
      (kind === "faqs" ? broken.getFaqList : broken.getInquiryList)(filters),
    );
  }
});
test("filter and return URL allowlists reject duplicated or malformed values", () => {
  for (const kind of ["faqs", "inquiries"]) {
    for (const search of [
      { page: "0" },
      { page: "1.2" },
      { page: ["1", "2"] },
      { category: "__proto__" },
      { status: "bad" },
      { email: "private" },
    ])
      assert.equal(rules.parseSupportFilters(kind, search), null);
    for (const url of [
      "https://evil.invalid/admin/support/faqs",
      "//evil.invalid",
      "/admin/support/faqs\\evil",
      `/admin/support/${kind}?page=1&page=2`,
      `/admin/support/${kind}?status=bad`,
    ])
      assert.equal(rules.supportReturn(kind, url), `/admin/support/${kind}`);
    const f = rules.parseSupportFilters(kind, { category: "shop", page: "2" });
    assert.equal(
      rules.supportReturn(kind, rules.supportUrl(kind, f)),
      rules.supportUrl(kind, f),
    );
  }
});
test("missing details, malformed UUIDs, DB errors and reload results remain distinct", async () => {
  const missing = harness({ current: null });
  assert.equal(await missing.getFaqDetail(id), null);
  assert.equal(await missing.getInquiryDetail(id), null);
  const invalid = harness();
  assert.equal(await invalid.getFaqDetail("bad"), null);
  assert.equal(invalid.clients(), 0);
  for (const method of ["getFaqDetail", "getInquiryDetail"])
    await assert.rejects(() =>
      harness({ readError: { message: "private" } })[method](id),
    );
  for (const action of ["saveFaq", "deleteFaq", "saveInquiryAnswer"]) {
    assert.match(
      (await harness({ current: null })[action](form())).message,
      /찾을 수 없/,
    );
    assert.match(
      (await harness({ readError: { message: "private" } })[action](form()))
        .message,
      /저장하지 못/,
    );
    assert.equal(
      (
        await harness({
          error: { message: "private" },
          current: action === "saveInquiryAnswer" ? inquiry : faq,
        })[action](form())
      ).success,
      false,
    );
  }
  assert.equal((await harness().reloadFaq(id)).row.updated_at, version);
  assert.equal(
    (await harness({ current: inquiry }).reloadInquiry(id)).row.status,
    "pending",
  );
});
test("answer and delete reject duplicate, missing, File, invalid identity/version before DB", async () => {
  for (const action of ["saveInquiryAnswer", "deleteFaq"]) {
    for (const key of action === "deleteFaq"
      ? ["id", "version"]
      : ["id", "version", "answer"]) {
      for (const kind of ["duplicate", "missing", "file"]) {
        const f = form();
        if (kind === "duplicate") f.append(key, "extra");
        else if (kind === "missing") f.delete(key);
        else f.set(key, new File(["x"], "test.txt"));
        const h = harness();
        assert.equal((await h[action](f)).success, false);
        assert.equal(h.clients(), 0);
      }
    }
    for (const values of [{ id: "invalid" }, { version: "invalid" }]) {
      const h = harness();
      assert.equal((await h[action](form(values))).success, false);
      assert.equal(h.clients(), 0);
    }
    const h = harness();
    assert.equal((await h[action](null)).success, false);
    assert.equal(h.clients(), 0);
  }
});
