import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const memberId = "22222222-2222-4222-8222-222222222222";

function load(specifier, adapters) {
  const cache = new Map();
  function resolveFile(name, parent) {
    const raw = name.startsWith("@/")
      ? new URL(`../${name.slice(2)}`, import.meta.url)
      : new URL(name, parent);
    const path = fileURLToPath(raw);
    const found = [path, `${path}.ts`, `${path}.tsx`].find((item) =>
      existsSync(item),
    );
    if (!found) throw new Error(`Missing module: ${name}`);
    return found;
  }
  function instantiate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const commonjs = { exports: {} };
    cache.set(filename, commonjs);
    const parent = new URL(`file:///${filename.replaceAll("\\", "/")}`);
    new Function("require", "exports", "module", compiled)(
      (name) => {
        if (name in adapters) return adapters[name];
        if (name.startsWith(".") || name.startsWith("@/"))
          return instantiate(resolveFile(name, parent));
        throw new Error(`Unexpected dependency: ${name}`);
      },
      commonjs.exports,
      commonjs,
    );
    return commonjs.exports;
  }
  return instantiate(resolveFile(specifier, import.meta.url));
}

function redirectError(path) {
  const error = new Error("NEXT_REDIRECT");
  error.digest = `NEXT_REDIRECT;replace;${path};307;`;
  return error;
}

function accountModule(client) {
  return load("../lib/member-auth/account.ts", {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "next/navigation": {
      redirect(path) {
        throw redirectError(path);
      },
      unstable_rethrow(error) {
        if (String(error?.digest ?? "").startsWith("NEXT_REDIRECT"))
          throw error;
      },
    },
    "@/lib/supabase/server": { createClient: async () => client },
  });
}

function confirmedClient(extra = {}) {
  const calls = [];
  const client = {
    auth: {
      async getUser() {
        calls.push(["getUser"]);
        return {
          data: {
            user: {
              id: memberId,
              email: "member@example.invalid",
              email_confirmed_at: "2026-11-25T00:00:00.000Z",
            },
          },
          error: null,
        };
      },
      async signOut() {
        calls.push(["signOut"]);
        return { error: null };
      },
    },
    from(table) {
      calls.push(["from", table]);
      return {
        update(payload) {
          calls.push(["update", payload]);
          return {
            eq(column, value) {
              calls.push(["eq", column, value]);
              return {
                select() {
                  return {
                    async maybeSingle() {
                      return { data: { id: memberId }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name) {
      calls.push(["rpc", name]);
      return { error: null };
    },
    ...extra,
  };
  return { calls, client };
}

test("회원정보 수정은 이름과 연락처만 저장하고 등급은 막는다", async () => {
  const { calls, client } = confirmedClient();
  const { updateProfile } = accountModule(client);
  const blocked = new FormData();
  blocked.set("name", "테스트");
  blocked.set("phone", "010-1111-2222");
  blocked.set("role", "admin");
  const rejected = await updateProfile({}, blocked);
  assert.equal(rejected.message, "회원 등급은 변경할 수 없어요.");
  assert.deepEqual(calls, []);

  const form = new FormData();
  form.set("name", " 바꾼이름 ");
  form.set("phone", "01011112222");
  const saved = await updateProfile({}, form);
  assert.equal(saved.status, "saved");
  assert.deepEqual(
    calls.filter((call) => call[0] === "update"),
    [["update", { name: "바꾼이름", phone: "010-1111-2222" }]],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === "eq"),
    ["eq", "id", memberId],
  );
  assert.equal(
    calls.some((call) => JSON.stringify(call).includes("role")),
    false,
  );
});

test("빈 연락처는 지우고 잘못된 번호는 저장하지 않는다", async () => {
  const { calls, client } = confirmedClient();
  const { updateProfile } = accountModule(client);
  const empty = new FormData();
  empty.set("name", "테스트");
  empty.set("phone", " ");
  const cleared = await updateProfile({}, empty);
  assert.equal(cleared.status, "saved");
  assert.deepEqual(
    calls.filter((call) => call[0] === "update"),
    [["update", { name: "테스트", phone: null }]],
  );

  const invalid = new FormData();
  invalid.set("name", "테스트");
  invalid.set("phone", "02-000-0000");
  const updates = calls.filter((call) => call[0] === "update").length;
  const failed = await updateProfile({}, invalid);
  assert.equal(failed.errors.phone.includes("010"), true);
  assert.equal(calls.filter((call) => call[0] === "update").length, updates);
});

test("탈퇴는 본인 함수만 호출하고 로그인 화면으로 보낸다", async () => {
  const { calls, client } = confirmedClient();
  const { withdrawAccount } = accountModule(client);
  const missing = new FormData();
  const ignored = await withdrawAccount({}, missing);
  assert.equal(ignored.message, "입력한 내용을 확인해 주세요.");
  assert.equal(
    calls.some((call) => call[0] === "rpc"),
    false,
  );

  const form = new FormData();
  form.set("confirm", "withdraw");
  await assert.rejects(
    () => withdrawAccount({}, form),
    (error) => String(error.digest).includes("/login?notice=withdrawn"),
  );
  assert.deepEqual(
    calls.filter((call) => call[0] === "rpc" || call[0] === "signOut"),
    [["rpc", "delete_own_account"], ["signOut"]],
  );
});

test("로그인한 문의 접수는 세션 계정에 연결하고 조회 방식은 유지한다", async () => {
  const inserts = [];
  const filters = [];
  const { createInquiry, lookupInquiry } = load("../lib/inquiries/actions.ts", {
    "server-only": {},
    "@/lib/supabase/admin": {
      createAdminClient() {
        return {
          from() {
            return {
              insert(payload) {
                inserts.push(payload);
                return {
                  select() {
                    return {
                      async single() {
                        return {
                          data: {
                            inquiry_no: "I-20261125-0001",
                            created_at: "2026-11-25T00:00:00.000Z",
                          },
                          error: null,
                        };
                      },
                    };
                  },
                };
              },
              select() {
                return {
                  eq(column, value) {
                    filters.push([column, value]);
                    return this;
                  },
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      },
    },
    "@/lib/supabase/server": {
      async createClient() {
        return {
          auth: {
            async getUser() {
              return {
                data: { user: { id: memberId } },
                error: null,
              };
            },
          },
        };
      },
    },
  });
  const form = new FormData();
  form.set("category", "other");
  form.set("name", "테스트");
  form.set("email", "member@example.invalid");
  form.set("phone", "010-1111-2222");
  form.set("content", "로그인 문의");
  form.set("privacyConsent", "on");
  form.set("user_id", "33333333-3333-4333-8333-333333333333");
  const created = await createInquiry(form);
  assert.equal(created.success.inquiryNo, "I-20261125-0001");
  assert.equal(inserts[0].user_id, memberId);
  assert.equal(
    Object.hasOwn(inserts[0], "user_id") &&
      inserts[0].user_id !== "33333333-3333-4333-8333-333333333333",
    true,
  );

  const lookup = new FormData();
  lookup.set("inquiryNo", "I-20261125-0001");
  lookup.set("email", "guest@example.invalid");
  await lookupInquiry(lookup);
  assert.deepEqual(filters, [
    ["inquiry_no", "I-20261125-0001"],
    ["customer_email", "guest@example.invalid"],
  ]);
});

test("내 문의 조회는 본인 아이디로만 요청한다", async () => {
  const calls = [];
  const { getMemberInquiries } = load("../lib/member-auth/inquiries.ts", {
    "server-only": {},
    "@/lib/supabase/server": {
      async createClient() {
        const query = {
          select(columns) {
            calls.push(["select", columns]);
            return query;
          },
          eq(column, value) {
            calls.push(["eq", column, value]);
            return query;
          },
          order(column, options) {
            calls.push(["order", column, options]);
            return query;
          },
          async returns() {
            return {
              data: [
                {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
                  inquiry_no: "I-20261125-0001",
                  category: "other",
                  created_at: "2026-11-25T00:00:00.000Z",
                  status: "answered",
                  content: "문의",
                  answer: "답변",
                  answered_at: "2026-11-25T01:00:00.000Z",
                },
              ],
              error: null,
            };
          },
        };
        return {
          from(table) {
            calls.push(["from", table]);
            return query;
          },
        };
      },
    },
  });
  const rows = await getMemberInquiries(memberId);
  assert.equal(rows[0].answer, "답변");
  assert.deepEqual(
    calls.find((call) => call[0] === "eq"),
    ["eq", "user_id", memberId],
  );
});
