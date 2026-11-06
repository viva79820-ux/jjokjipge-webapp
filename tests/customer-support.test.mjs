import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function loadModule(file, adapters = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}
const validation = loadModule("../lib/inquiries/validation.ts");
const valid = {
  category: "reservation_payment",
  name: "테스트",
  email: "test@example.invalid",
  phone: "010-1234-5678",
  reservationNo: "",
  content: "첫 줄\n둘째 줄",
  privacyConsent: "on",
};
function formOf(values = valid) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
const validLookup = { inquiryNo: "I-20261106-0001", email: valid.email };
const verifiedId = "11111111-1111-4111-8111-111111111111";
const stored = {
  inquiry_no: validLookup.inquiryNo,
  category: valid.category,
  created_at: "2026-11-06T01:00:00Z",
  status: "pending",
  reservation_no: null,
  content: valid.content,
  answer: null,
  answered_at: null,
  id: "internal",
  user_id: verifiedId,
  customer_name: "private",
  customer_phone: valid.phone,
  customer_email: valid.email,
  answered_by: "private-admin",
};
function harness({
  row = stored,
  error = null,
  session = {
    data: { user: null },
    error: { name: "AuthSessionMissingError" },
  },
  throwAuth = false,
  throwDb = false,
} = {}) {
  const steps = [],
    inserts = [];
  let authCalls = 0,
    dbCalls = 0;
  const query = {
    select(columns) {
      steps.push(["select", columns]);
      return this;
    },
    eq(...args) {
      steps.push(["eq", ...args]);
      return this;
    },
    insert(values) {
      inserts.push(values);
      return this;
    },
    async single() {
      return { data: row, error };
    },
    async maybeSingle() {
      const matches =
        row &&
        steps
          .filter(([method]) => method === "eq")
          .every(([, key, value]) => row[key] === value);
      return { data: matches ? row : null, error };
    },
  };
  const actions = loadModule("../lib/inquiries/actions.ts", {
    "server-only": {},
    "./validation": validation,
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        dbCalls++;
        if (throwDb) throw new Error("private DB error");
        return {
          from: (table) => {
            assert.equal(table, "inquiries");
            return query;
          },
        };
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => {
            authCalls++;
            if (throwAuth) throw new Error("private token");
            return session;
          },
        },
      }),
    },
  });
  return {
    ...actions,
    steps,
    inserts,
    dbCalls: () => dbCalls,
    authCalls: () => authCalls,
  };
}

test("inquiry categories, required fields, whitespace and length boundaries", () => {
  for (const category of Object.keys(validation.categoryLabels))
    assert.deepEqual(
      validation.validateInquiry(formOf({ ...valid, category })).errors,
      {},
    );
  for (const category of ["", "__proto__", "invalid", " consultation "])
    assert.ok(
      validation.validateInquiry(formOf({ ...valid, category })).errors
        .category,
    );
  for (const field of ["name", "email", "phone", "content"])
    for (const value of ["", " \t\n "])
      assert.ok(
        validation.validateInquiry(formOf({ ...valid, [field]: value })).errors[
          field
        ],
        field,
      );
  for (const [field, limit] of [
    ["name", 30],
    ["reservationNo", 50],
    ["content", 5000],
  ]) {
    assert.equal(
      validation.validateInquiry(
        formOf({ ...valid, [field]: "가".repeat(limit) }),
      ).errors[field],
      undefined,
    );
    assert.ok(
      validation.validateInquiry(
        formOf({ ...valid, [field]: "가".repeat(limit + 1) }),
      ).errors[field],
    );
    assert.ok(
      validation.validateInquiry(
        formOf({ ...valid, [field]: " ".repeat(limit) + "가" }),
      ).errors[field],
    );
    assert.ok(
      validation.validateInquiry(formOf({ ...valid, [field]: "a\0b" })).errors[
        field
      ],
    );
  }
});
test("normalization keeps internal line breaks and treats blank reference as NULL", () => {
  const result = validation.validateInquiry(
    formOf({
      ...valid,
      name: " 테스트 ",
      email: " Test@EXAMPLE.invalid ",
      phone: "010 1234 5678",
      content: " 첫 줄\n\n둘째 줄 ",
      reservationNo: " \t ",
    }),
  );
  assert.deepEqual(result.errors, {});
  assert.equal(result.values.name, "테스트");
  assert.equal(result.values.email, valid.email);
  assert.equal(result.values.phone, valid.phone);
  assert.equal(result.values.content, "첫 줄\n\n둘째 줄");
  assert.equal(result.values.reservationNo, null);
  const noOptional = formOf();
  noOptional.delete("reservationNo");
  assert.deepEqual(validation.validateInquiry(noOptional).errors, {});
});
test("email validation matches DB dot-atom rules and rejects direct overflow", () => {
  const boundary = `${"a".repeat(242)}@example.com`;
  assert.equal(boundary.length, 254);
  for (const email of [
    boundary,
    "A.B+tag@Sub.EXAMPLE.com",
    " test@example.invalid ",
    "a!#$%&'*+/=?^_`{|}~-@example.com",
  ])
    assert.equal(validation.isValidInquiryEmail(email), true, email);
  for (const email of [
    "a..b@example.com",
    ".a@example.com",
    "a.@example.com",
    "a@-example.com",
    "a@example-.com",
    "a@example..com",
    "a@localhost",
    "a b@example.com",
    "a@ex_ample.com",
    "가@example.com",
    `a${boundary}`,
  ]) {
    assert.ok(
      validation.validateInquiry(formOf({ ...valid, email })).errors.email,
      email,
    );
    assert.ok(
      validation.validateLookup(formOf({ ...validLookup, email })).errors.email,
      email,
    );
  }
});
test("phone accepts only 010 with eleven digits and permitted separators", () => {
  for (const phone of ["01012345678", valid.phone, "010 1234 5678"])
    assert.equal(validation.normalizePhone(phone), valid.phone);
  for (const phone of [
    "01112345678",
    "0101234567",
    "010123456789",
    "010-1234-56789",
    "010a1234b5678",
    "010.1234.5678",
    "(010)12345678",
    "010--1234-5678",
    "010\n1234\n5678",
  ])
    assert.equal(
      validation.validateInquiry(formOf({ ...valid, phone })).errors.phone,
      validation.phoneMessage,
    );
});
test("consent, duplicate scalars, missing scalars and File values fail before auth or DB", async () => {
  for (const field of Object.keys(valid)) {
    const duplicate = formOf();
    duplicate.append(field, valid[field]);
    const file = formOf();
    file.set(field, new File(["test"], "test.txt"));
    const missing = formOf();
    missing.delete(field);
    for (const form of [
      duplicate,
      file,
      ...(field === "reservationNo" ? [] : [missing]),
    ]) {
      const h = harness();
      assert.ok((await h.createInquiry(form)).errors[field], field);
      assert.equal(h.authCalls(), 0);
      assert.equal(h.dbCalls(), 0);
    }
  }
  for (const value of ["", "true", "off"])
    assert.ok(
      validation.validateInquiry(formOf({ ...valid, privacyConsent: value }))
        .errors.privacyConsent,
    );
  assert.ok((await harness().createInquiry(null)).message);
});
test("oversized direct requests are rejected without truncation or persistence", async () => {
  for (const [field, value] of [
    ["name", "가".repeat(31)],
    ["email", "a".repeat(255)],
    ["phone", "010123456789"],
    ["reservationNo", "R".repeat(51)],
    ["content", "가".repeat(5001)],
  ]) {
    const h = harness();
    assert.ok(
      (await h.createInquiry(formOf({ ...valid, [field]: value }))).errors[
        field
      ],
    );
    assert.equal(h.dbCalls(), 0);
  }
});
test("anonymous and verified sessions set user_id only from server identity", async () => {
  for (const [session, expected] of [
    [{ data: { user: null }, error: null }, null],
    [
      { data: { user: null }, error: { name: "AuthSessionMissingError" } },
      null,
    ],
    [{ data: { user: { id: verifiedId } }, error: null }, verifiedId],
  ]) {
    const h = harness({ session });
    const form = formOf();
    form.set("user_id", "forged");
    assert.ok((await h.createInquiry(form)).success);
    assert.equal(h.inserts[0].user_id, expected);
    assert.equal(h.authCalls(), 1);
  }
});
test("authentication failures and malformed verified identities stop persistence", async () => {
  for (const session of [
    { data: { user: null }, error: { name: "AuthApiError" } },
    {
      data: { user: { id: verifiedId } },
      error: { name: "AuthSessionMissingError" },
    },
    { data: { user: { id: "forged" } }, error: null },
    { data: { user: {} }, error: null },
    { data: null, error: null },
  ]) {
    const h = harness({ session });
    assert.equal((await h.createInquiry(formOf())).success, undefined);
    assert.equal(h.dbCalls(), 0);
  }
  const thrown = harness({ throwAuth: true });
  assert.equal((await thrown.createInquiry(formOf())).success, undefined);
  assert.equal(thrown.dbCalls(), 0);
});
test("INSERT allowlist ignores forged fields and never accesses reservation data", async () => {
  const h = harness();
  const form = formOf({ ...valid, reservationNo: "unknown-reference" });
  for (const key of [
    "user_id",
    "inquiry_no",
    "status",
    "answer",
    "answered_at",
    "answered_by",
    "created_at",
    "updated_at",
  ])
    form.set(key, "forged");
  await h.createInquiry(form);
  assert.deepEqual(Object.keys(h.inserts[0]).sort(), [
    "category",
    "content",
    "customer_email",
    "customer_name",
    "customer_phone",
    "reservation_no",
    "user_id",
  ]);
  assert.equal(h.inserts[0].reservation_no, "unknown-reference");
  assert.equal(h.dbCalls(), 1);
  assert.deepEqual(h.steps, [["select", "inquiry_no,created_at"]]);
});
test("creation returns only DB-issued number and timestamp; DB failures are sanitized", async () => {
  const h = harness({ row: { ...stored, inquiry_no: "I-20261106-98765" } });
  assert.deepEqual(await h.createInquiry(formOf()), {
    success: { inquiryNo: "I-20261106-98765", createdAt: stored.created_at },
  });
  for (const options of [
    { error: { code: "23514", message: "private email/token" } },
    { throwDb: true },
    { row: null },
  ])
    assert.deepEqual(await harness(options).createInquiry(formOf()), {
      message: validation.createFailure,
    });
});
test("lookup normalizes both conditions and supports five or nineteen digit serials", async () => {
  for (const serial of ["0001", "10000", "9223372036854775807"]) {
    const inquiryNo = `I-20261106-${serial}`;
    const h = harness({ row: { ...stored, inquiry_no: inquiryNo } });
    assert.ok(
      (
        await h.lookupInquiry(
          formOf({
            inquiryNo: inquiryNo.toLowerCase(),
            email: " Test@EXAMPLE.invalid ",
          }),
        )
      ).result,
    );
    assert.deepEqual(
      h.steps.filter(([method]) => method === "eq"),
      [
        ["eq", "inquiry_no", inquiryNo],
        ["eq", "customer_email", valid.email],
      ],
    );
    assert.equal(h.authCalls(), 0);
  }
  assert.equal(
    validation.validateLookupValues({
      ...validLookup,
      inquiryNo: " I-20261106-0001 ",
    }).inquiryNo,
    undefined,
  );
});
test("bad numbers, overflow, duplicate/File lookup fields are rejected before DB", async () => {
  for (const inquiryNo of [
    "R-20261106-0001",
    "I-20261106-001",
    "I-20261106-0000",
    "I-20260230-0001",
    "I-20261106-9223372036854775808",
    "I-20261106-99999999999999999999",
    "I-20261106-0001,customer_email.eq.x",
  ]) {
    const h = harness();
    assert.ok(
      (await h.lookupInquiry(formOf({ ...validLookup, inquiryNo }))).errors
        .inquiryNo,
      inquiryNo,
    );
    assert.equal(h.dbCalls(), 0);
  }
  for (const field of Object.keys(validLookup)) {
    const duplicate = formOf(validLookup);
    duplicate.append(field, validLookup[field]);
    const file = formOf(validLookup);
    file.set(field, new File(["test"], "test.txt"));
    const missing = formOf(validLookup);
    missing.delete(field);
    for (const form of [duplicate, file, missing]) {
      const h = harness();
      assert.ok((await h.lookupInquiry(form)).errors[field]);
      assert.equal(h.dbCalls(), 0);
    }
  }
  assert.ok((await harness().lookupInquiry({})).message);
});
test("unknown number and mismatched email give the same response; failures differ", async () => {
  const absent = await harness().lookupInquiry(
    formOf({ ...validLookup, inquiryNo: "I-20261106-9999" }),
  );
  const mismatch = await harness().lookupInquiry(
    formOf({ ...validLookup, email: "other@example.invalid" }),
  );
  assert.deepEqual(absent, { message: validation.lookupMismatch });
  assert.deepEqual(mismatch, absent);
  for (const options of [
    { error: { message: "private DB data" } },
    { throwDb: true },
  ])
    assert.deepEqual(
      await harness(options).lookupInquiry(formOf(validLookup)),
      { message: validation.lookupFailure },
    );
});
test("lookup allowlist excludes internal IDs and contact data for pending and answered", async () => {
  for (const status of ["pending", "answered"]) {
    const h = harness({
      row: {
        ...stored,
        status,
        answer: "답변\n둘째 줄",
        answered_at: stored.created_at,
      },
    });
    const { result } = await h.lookupInquiry(formOf(validLookup));
    assert.deepEqual(Object.keys(result).sort(), [
      "answer",
      "answeredAt",
      "category",
      "content",
      "createdAt",
      "inquiryNo",
      "reservationNo",
      "status",
    ]);
    assert.equal(result.answer, status === "answered" ? "답변\n둘째 줄" : null);
    assert.equal(
      result.answeredAt,
      status === "answered" ? stored.created_at : null,
    );
    assert.equal(result.status, status);
    assert.equal(
      h.steps.find(([method]) => method === "select")[1],
      "inquiry_no,category,created_at,status,reservation_no,content,answer,answered_at",
    );
  }
});

function faqHarness({ rows = [], error = null, fail = false } = {}) {
  const steps = [];
  const query = {};
  for (const method of ["select", "eq", "order", "returns"])
    query[method] = (...args) => {
      steps.push([method, ...args]);
      return query;
    };
  query.then = (resolve) => {
    let data = rows.filter((row) =>
      steps
        .filter(([m]) => m === "eq")
        .every(([, key, value]) => row[key] === value),
    );
    data = data.sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
    );
    return Promise.resolve({ data, error }).then(resolve);
  };
  const data = loadModule("../lib/data/faqs.ts", {
    "server-only": {},
    "@/lib/supabase/public": {
      createPublicClient: () => {
        if (fail) throw new Error("private data");
        return {
          from: (table) => {
            assert.equal(table, "faqs");
            return query;
          },
        };
      },
    },
  });
  return { ...data, steps };
}
test("public FAQ read explicitly filters active rows and uses stable ascending sort", async () => {
  const h = faqHarness({
    rows: [
      { id: "z", sort_order: 0, is_active: false },
      { id: "b", sort_order: 1, is_active: true },
      { id: "a", sort_order: 1, is_active: true },
      { id: "c", sort_order: 0, is_active: true },
    ],
  });
  const result = await h.getFaqs();
  assert.equal(result.error, false);
  assert.deepEqual(
    result.faqs.map((row) => row.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(h.steps, [
    ["select", "id,category,question,answer"],
    ["eq", "is_active", true],
    ["order", "sort_order", { ascending: true }],
    ["order", "id", { ascending: true }],
    ["returns"],
  ]);
});
test("all inactive FAQ is empty success; DB failures stay distinct", async () => {
  assert.deepEqual(
    await faqHarness({ rows: [{ is_active: false }] }).getFaqs(),
    { faqs: [], error: false },
  );
  assert.deepEqual(await faqHarness().getFaqs(), { faqs: [], error: false });
  for (const options of [{ error: { message: "private" } }, { fail: true }])
    assert.deepEqual(await faqHarness(options).getFaqs(), {
      faqs: [],
      error: true,
    });
});
