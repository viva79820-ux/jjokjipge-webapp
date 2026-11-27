import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const password = "Test-Pass-88";

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
  error.digest = `NEXT_REDIRECT;push;${path};303;`;
  return error;
}

function isRedirect(error) {
  return (
    error &&
    typeof error === "object" &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT;")
  );
}

async function settle(promise) {
  try {
    return { state: await promise };
  } catch (error) {
    if (!isRedirect(error)) throw error;
    return { redirect: error.digest.split(";")[2] };
  }
}

function form(entries) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

function harness(options = {}) {
  const calls = [];
  const client = {
    auth: {
      async signInWithPassword(body) {
        calls.push(["signIn", body.email, body.password]);
        if (options.signInError) return { error: options.signInError };
        return { error: null };
      },
      async signOut() {
        calls.push(["signOut"]);
        return { error: options.signOutError ?? null };
      },
      async getClaims() {
        calls.push(["getClaims"]);
        if (!options.userId)
          return { data: { claims: null }, error: { message: "none" } };
        return {
          data: {
            claims: { sub: options.userId, email: options.userEmail ?? "" },
          },
          error: null,
        };
      },
    },
    from(table) {
      calls.push(["from", table]);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: options.profile ?? null, error: null };
        },
      };
    },
  };
  const actions = load("../lib/admin/actions.ts", {
    "next/navigation": {
      redirect(path) {
        throw redirectError(path);
      },
    },
    "next/headers": { headers: async () => ({ get: () => null }) },
    "@/lib/supabase/server": { createClient: async () => client },
    "server-only": {},
  });
  return { ...actions, calls };
}

test("admin login failure keeps the typed email and omits the password", async () => {
  const typed = "Admin@Example.Invalid";
  const failed = harness({ signInError: { message: "invalid" } });
  const result = await settle(
    failed.login(
      {},
      form([
        ["email", typed],
        ["password", password],
        ["next", "/admin/reservations"],
      ]),
    ),
  );
  assert.equal(result.state.message, "이메일 또는 비밀번호가 맞지 않아요.");
  assert.equal(result.state.email, typed);
  assert.equal(Object.hasOwn(result.state, "password"), false);
  assert.equal(Object.hasOwn(result.state, "next"), false);
  assert.equal(JSON.stringify(result.state).includes(password), false);
  assert.equal(result.redirect, undefined);
  assert.deepEqual(failed.calls.find((call) => call[0] === "signIn").slice(1), [
    "admin@example.invalid",
    password,
  ]);
  assert.equal(
    failed.calls.some((call) => call[0] === "getClaims"),
    false,
  );

  const invalid = harness();
  const rejected = await settle(
    invalid.login(
      {},
      form([
        ["email", "not-an-email"],
        ["password", ""],
        ["next", "/admin"],
      ]),
    ),
  );
  assert.equal(rejected.state.email, "not-an-email");
  assert.match(rejected.state.errors.email, /이메일/);
  assert.equal(Object.hasOwn(rejected.state, "password"), false);
  assert.equal(
    invalid.calls.some((call) => call[0] === "signIn"),
    false,
  );
});

test("admin login still sends members away and keeps the safe next path", async () => {
  const admin = harness({
    userId: "11111111-1111-4111-8111-111111111111",
    userEmail: "admin@example.invalid",
    profile: { role: "admin" },
  });
  const result = await settle(
    admin.login(
      {},
      form([
        ["email", "admin@example.invalid"],
        ["password", password],
        ["next", "/admin/reservations"],
      ]),
    ),
  );
  assert.equal(result.redirect, "/admin/reservations");
  assert.equal(JSON.stringify(result).includes(password), false);

  const member = harness({
    userId: "22222222-2222-4222-8222-222222222222",
    profile: { role: "user" },
  });
  const refused = await settle(
    member.login(
      {},
      form([
        ["email", "Member@Example.Invalid"],
        ["password", password],
        ["next", "https://evil.example"],
      ]),
    ),
  );
  assert.equal(refused.state.message, "관리자 계정이 아니에요.");
  assert.equal(refused.state.email, "Member@Example.Invalid");
  assert.equal(Object.hasOwn(refused.state, "password"), false);
  assert.equal(JSON.stringify(refused.state).includes(password), false);
  assert.equal(refused.redirect, undefined);
  assert.equal(
    member.calls.some((call) => call[0] === "signOut"),
    true,
  );
});
