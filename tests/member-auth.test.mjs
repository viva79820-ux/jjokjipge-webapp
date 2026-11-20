import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const password = "Test-Pass-88";
const userId = "22222222-2222-4222-8222-222222222222";

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
function authError(code, status = 400) {
  return { name: "AuthApiError", code, status, message: `raw ${password}` };
}

const headerState = {
  host: "127.0.0.1:4333",
  forwardedHost: null,
  forwardedProto: null,
};
function headers() {
  return {
    get(name) {
      if (name === "host") return headerState.host;
      if (name === "x-forwarded-host") return headerState.forwardedHost;
      if (name === "x-forwarded-proto") return headerState.forwardedProto;
      return null;
    },
  };
}

function harness(options = {}) {
  const calls = [];
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args);
  let current = options.user ?? null;
  const client = {
    auth: {
      async signUp(body) {
        calls.push(["signUp", body]);
        if (options.signUpError)
          return {
            data: { user: null, session: null },
            error: options.signUpError,
          };
        if (options.throwSignUp) throw new Error(`boom ${password}`);
        return {
          data: {
            user: {
              id: userId,
              email: body.email,
              email_confirmed_at: null,
              identities: options.emptyIdentities
                ? []
                : [{ provider: "email" }],
            },
            session: options.signupSession ? { access_token: "session" } : null,
          },
          error: null,
        };
      },
      async signInWithPassword(body) {
        calls.push(["signIn", body]);
        if (options.signInError)
          return {
            data: { user: null, session: null },
            error: options.signInError,
          };
        current = {
          id: userId,
          email: body.email,
          email_confirmed_at: options.unconfirmed
            ? null
            : "2026-11-13T00:00:00.000Z",
        };
        return {
          data: { user: current, session: { access_token: "session" } },
          error: null,
        };
      },
      async getUser() {
        calls.push(["getUser"]);
        if (options.getUserError)
          return { data: { user: null }, error: options.getUserError };
        return {
          data: { user: current },
          error: current ? null : { code: "session_not_found", status: 401 },
        };
      },
      async signOut(scope) {
        calls.push(["signOut", scope]);
        if (options.signOutError) return { error: options.signOutError };
        current = null;
        return { error: null };
      },
      async resetPasswordForEmail(email, settings) {
        calls.push(["reset", email, settings]);
        if (options.resetError)
          return { data: null, error: options.resetError };
        return { data: {}, error: null };
      },
      async updateUser(attributes) {
        calls.push(["updateUser", attributes]);
        if (options.updateError)
          return { data: { user: null }, error: options.updateError };
        return { data: { user: current }, error: null };
      },
      getSession() {
        calls.push(["getSession"]);
        throw new Error("getSession");
      },
    },
    from(table) {
      calls.push(["from", table]);
      const query = {
        select(columns) {
          calls.push(["select", columns]);
          return query;
        },
        eq(column, value) {
          calls.push(["eq", column, value]);
          return query;
        },
        async maybeSingle() {
          calls.push(["maybeSingle"]);
          return (
            options.profile ?? { data: { name: "테스트회원" }, error: null }
          );
        },
        update(values) {
          calls.push(["update", values]);
          throw new Error("profile update");
        },
        insert(values) {
          calls.push(["insert", values]);
          throw new Error("profile insert");
        },
        delete() {
          throw new Error("profile delete");
        },
      };
      return query;
    },
  };
  const restored = [];
  const env = {
    VERCEL: undefined,
    VERCEL_URL: undefined,
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
    VERCEL_BRANCH_URL: undefined,
    ...options.env,
  };
  for (const [key, value] of Object.entries(env)) {
    restored.push([key, process.env[key]]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const actions = load("../lib/member-auth/actions.ts", {
    "next/cache": {
      revalidatePath(path, type) {
        calls.push(["revalidate", path, type]);
      },
    },
    "next/headers": { headers: async () => headers() },
    "next/navigation": {
      redirect(path) {
        throw redirectError(path);
      },
      unstable_rethrow(error) {
        if (isRedirect(error)) throw error;
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => client,
    },
    "server-only": {},
  });
  return {
    ...actions,
    calls,
    logs,
    restore() {
      console.error = original;
      for (const [key, value] of restored) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

test("signup validates input and sends only the name metadata", async () => {
  const auth = harness();
  try {
    const missing = await settle(
      auth.signUp(
        {},
        form([
          ["email", "Member@Test.Invalid"],
          ["password", password],
        ]),
      ),
    );
    assert.equal(missing.state.message, "입력한 내용을 확인해 주세요.");
    assert.equal(
      auth.calls.some((call) => call[0] === "signUp"),
      false,
    );

    const file = new FormData();
    file.set("name", "테스트");
    file.set("email", "member@example.invalid");
    file.set("password", new File([password], "secret.txt"));
    file.set("passwordConfirm", password);
    const rejectedFile = await settle(auth.signUp({}, file));
    assert.equal(rejectedFile.state.message, "입력한 내용을 확인해 주세요.");
    assert.equal(JSON.stringify(rejectedFile.state).includes(password), false);

    const duplicate = form([
      ["name", "테스트"],
      ["email", "one@example.invalid"],
      ["email", "two@example.invalid"],
      ["password", password],
      ["passwordConfirm", password],
      ["role", "admin"],
    ]);
    const rejectedDuplicate = await settle(auth.signUp({}, duplicate));
    assert.equal(
      rejectedDuplicate.state.message,
      "입력한 내용을 확인해 주세요.",
    );

    const longPassword = "가".repeat(25);
    const tooLong = await settle(
      auth.signUp(
        {},
        form([
          ["name", " 테스트회원 "],
          ["email", " Member@Test.Invalid "],
          ["password", longPassword],
          ["passwordConfirm", longPassword],
          ["role", "admin"],
          ["user_id", userId],
        ]),
      ),
    );
    assert.match(tooLong.state.errors.password, /허용 길이/);
    assert.equal(JSON.stringify(tooLong.state).includes(longPassword), false);

    const spaced = ` ${password}`;
    const created = await settle(
      auth.signUp(
        {},
        form([
          ["name", " 테스트회원 "],
          ["email", " Member@Test.Invalid "],
          ["password", spaced],
          ["passwordConfirm", spaced],
          ["role", "admin"],
          ["user_id", userId],
        ]),
      ),
    );
    assert.equal(created.redirect, "/auth/verify");
    const payload = auth.calls.find((call) => call[0] === "signUp")[1];
    assert.equal(payload.email, "member@test.invalid");
    assert.equal(payload.password, spaced);
    assert.deepEqual(payload.options.data, { name: "테스트회원" });
    assert.equal(
      payload.options.emailRedirectTo,
      "http://127.0.0.1:4333/auth/callback?next=%2Fmypage",
    );
    assert.equal(JSON.stringify(payload.options.data).includes("admin"), false);
    assert.equal(
      auth.calls.some((call) => call[0] === "update" || call[0] === "insert"),
      false,
    );
    assert.equal(JSON.stringify(auth.logs).includes(password), false);
  } finally {
    auth.restore();
  }
});

test("signup does not claim mail was sent for duplicates, limits, or failures", async () => {
  const duplicate = harness({ emptyIdentities: true });
  try {
    const result = await settle(duplicate.signUp({}, signupForm()));
    assert.equal(result.redirect, "/auth/verify");
    assert.equal(result.state, undefined);
  } finally {
    duplicate.restore();
  }

  const limited = harness({
    signUpError: authError("over_email_send_rate_limit", 429),
  });
  try {
    const result = await settle(limited.signUp({}, signupForm()));
    assert.match(result.state.message, /보내지 못했어요/);
    assert.equal(result.state.message.includes("보냈어요"), false);
    assert.equal(JSON.stringify(result.state).includes(password), false);
  } finally {
    limited.restore();
  }

  const failed = harness({ signUpError: authError("unexpected_failure", 500) });
  try {
    const result = await settle(failed.signUp({}, signupForm()));
    assert.match(result.state.message, /일시적인 문제/);
    assert.equal(JSON.stringify(failed.logs).includes(password), false);
    assert.equal(JSON.stringify(failed.logs).includes("raw "), false);
  } finally {
    failed.restore();
  }
});

test("login checks the confirmed user and keeps members out of admin", async () => {
  const failed = harness({ signInError: authError("invalid_credentials") });
  try {
    const result = await settle(
      failed.login(
        {},
        form([
          ["email", "member@example.invalid"],
          ["password", password],
          ["next", "https://evil.example/phish"],
        ]),
      ),
    );
    assert.equal(result.state.message, "이메일 또는 비밀번호가 맞지 않아요.");
    assert.equal(result.redirect, undefined);
    assert.equal(
      failed.calls.some((call) => call[0] === "getSession"),
      false,
    );
    assert.equal(JSON.stringify(result.state).includes(password), false);
  } finally {
    failed.restore();
  }

  const unconfirmed = harness({
    signInError: authError("email_not_confirmed"),
  });
  try {
    const result = await settle(unconfirmed.login({}, loginForm()));
    assert.match(result.state.message, /이메일 인증을 마친 뒤/);
  } finally {
    unconfirmed.restore();
  }

  const signedIn = harness();
  try {
    const result = await settle(
      signedIn.login(
        {},
        form([...loginPairs(), ["next", "/admin/reservations"]]),
      ),
    );
    assert.equal(result.redirect, "/mypage");
    assert.equal(
      signedIn.calls.some((call) => call[0] === "getUser"),
      true,
    );
    assert.equal(
      signedIn.calls.some((call) => call[0] === "getSession"),
      false,
    );
    assert.deepEqual(
      signedIn.calls.find((call) => call[0] === "revalidate"),
      ["revalidate", "/", "layout"],
    );
  } finally {
    signedIn.restore();
  }
});

test("logout ends only the local session and password recovery stays on the user session", async () => {
  const auth = harness({
    user: {
      id: userId,
      email: "member@example.invalid",
      email_confirmed_at: "2026-11-13T00:00:00.000Z",
    },
  });
  try {
    const reset = await settle(
      auth.requestPasswordReset(
        {},
        form([["email", "Member@Example.Invalid"]]),
      ),
    );
    assert.equal(reset.state.status, "accepted");
    const resetCall = auth.calls.find((call) => call[0] === "reset");
    assert.equal(resetCall[1], "member@example.invalid");
    assert.equal(
      resetCall[2].redirectTo,
      "http://127.0.0.1:4333/auth/callback?next=%2Fauth%2Fupdate-password",
    );
    assert.equal(
      JSON.stringify(reset.state).includes("member@example.invalid"),
      false,
    );

    const changed = await settle(
      auth.updatePassword(
        {},
        form([
          ["password", `${password}!`],
          ["passwordConfirm", `${password}!`],
          ["email", "other@example.invalid"],
          ["user_id", userId],
        ]),
      ),
    );
    assert.equal(changed.redirect, "/mypage?notice=password");
    assert.deepEqual(auth.calls.find((call) => call[0] === "updateUser")[1], {
      password: `${password}!`,
    });

    const signedOut = await settle(auth.logout());
    assert.equal(signedOut.redirect, "/login");
    assert.deepEqual(auth.calls.find((call) => call[0] === "signOut")[1], {
      scope: "local",
    });
  } finally {
    auth.restore();
  }
});

test("password update and reset do not claim success when the provider refuses", async () => {
  const missing = harness();
  try {
    const result = await settle(
      missing.updatePassword(
        {},
        form([
          ["password", password],
          ["passwordConfirm", password],
        ]),
      ),
    );
    assert.match(result.state.message, /만료됐거나/);
    assert.equal(
      missing.calls.some((call) => call[0] === "updateUser"),
      false,
    );
  } finally {
    missing.restore();
  }

  const weak = harness({
    user: {
      id: userId,
      email: "member@example.invalid",
      email_confirmed_at: "2026-11-13T00:00:00.000Z",
    },
    updateError: authError("weak_password", 422),
  });
  try {
    const result = await settle(
      weak.updatePassword(
        {},
        form([
          ["password", password],
          ["passwordConfirm", password],
        ]),
      ),
    );
    assert.match(result.state.errors.password, /보안 기준/);
    assert.equal(JSON.stringify(result.state).includes("raw "), false);
  } finally {
    weak.restore();
  }

  const limited = harness({
    resetError: authError("over_request_rate_limit", 429),
  });
  try {
    const result = await settle(
      limited.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.equal(result.state.status, undefined);
    assert.match(result.state.message, /보내지 못했어요/);
  } finally {
    limited.restore();
  }
});

test("callback and redirect allow only trusted origins and internal paths", async () => {
  const redirect = load("../lib/member-auth/redirect.ts", {});
  const callback = load("../lib/member-auth/callback.ts", {});
  const saved = {
    VERCEL: process.env.VERCEL,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  delete process.env.VERCEL;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "127.0.0.1:4333" : null),
      }),
      "http://127.0.0.1:4333",
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "evil.example" : null),
      }),
      null,
    );
    assert.equal(
      redirect.safeNext("https://evil.example", "/mypage"),
      "/mypage",
    );
    assert.equal(redirect.safeNext("//evil.example", "/mypage"), "/mypage");
    assert.equal(redirect.safeNext("/admin", "/mypage"), "/mypage");
    assert.equal(
      redirect.safeNext("/%2F%2Fevil.example", "/mypage"),
      "/mypage",
    );
    assert.equal(redirect.safeNext("/\\admin", "/mypage"), "/mypage");
    assert.equal(redirect.safeNext("/mypage", "/login"), "/mypage");
    assert.equal(
      redirect.safeNext("/auth/update-password", "/mypage"),
      "/auth/update-password",
    );

    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "member-preview.vercel.app";
    process.env.VERCEL_BRANCH_URL = "branch-preview.vercel.app";
    assert.equal(
      redirect.resolveTrustedOrigin({
        get(name) {
          if (name === "x-forwarded-host") return "evil.example";
          if (name === "x-forwarded-proto") return "https";
          if (name === "host") return "member-preview.vercel.app";
          return null;
        },
      }),
      "https://member-preview.vercel.app",
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get(name) {
          if (name === "x-forwarded-host") return "branch-preview.vercel.app";
          if (name === "x-forwarded-proto") return "https";
          return null;
        },
      }),
      "https://branch-preview.vercel.app",
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "127.0.0.1:4333" : null),
      }),
      null,
    );

    const code = "auth-code-secret";
    const expired = callback.decideCallback({
      origin: "http://127.0.0.1:4333",
      codes: [code],
      next: "/mypage",
      providerError: false,
      providerErrorCode: null,
      exchange: { ok: false, reason: "expired" },
    });
    assert.equal(expired.path, "/auth/error?reason=expired");
    assert.equal(expired.path.includes(code), false);
    const reused = callback.decideCallback({
      origin: "http://127.0.0.1:4333",
      codes: [code, code],
      next: "/mypage",
      providerError: false,
      providerErrorCode: null,
      exchange: null,
    });
    assert.equal(reused.path, "/auth/error?reason=invalid");
    const pkce = callback.decideCallback({
      origin: "http://127.0.0.1:4333",
      codes: [code],
      next: "/mypage",
      providerError: false,
      providerErrorCode: null,
      exchange: { ok: false, reason: "pkce" },
    });
    assert.equal(pkce.path, "/auth/error?reason=pkce");
    const recovery = callback.decideCallback({
      origin: "http://127.0.0.1:4333",
      codes: [code],
      next: "/admin",
      providerError: false,
      providerErrorCode: null,
      exchange: { ok: true, redirectType: "recovery", confirmed: true },
    });
    assert.equal(recovery.path, "/auth/update-password");
    const confirmed = callback.decideCallback({
      origin: "http://127.0.0.1:4333",
      codes: [code],
      next: "https://evil.example",
      providerError: false,
      providerErrorCode: null,
      exchange: { ok: true, redirectType: null, confirmed: true },
    });
    assert.equal(confirmed.path, "/mypage");
    assert.equal(
      callback.decideCallback({
        origin: null,
        codes: [code],
        next: "/mypage",
        providerError: false,
        providerErrorCode: null,
        exchange: { ok: true, redirectType: null, confirmed: true },
      }).type,
      "unavailable",
    );
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a normal member is not an admin and member code does not use the secret key", async () => {
  const calls = [];
  const admin = load("../lib/admin/auth.ts", {
    "server-only": {},
    "next/headers": {
      headers: async () => ({ get: () => "/admin" }),
    },
    "next/navigation": {
      redirect(path) {
        throw redirectError(path);
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          async getClaims() {
            return {
              data: {
                claims: { sub: userId, email: "member@example.invalid" },
              },
              error: null,
            };
          },
        },
        from(table) {
          calls.push(table);
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: { role: "user" }, error: null };
                    },
                  };
                },
              };
            },
            update() {
              throw new Error("role update");
            },
          };
        },
      }),
    },
  });
  assert.equal(await admin.getAdmin(), null);
  assert.deepEqual(calls, ["profiles"]);
  const source = [
    "lib/member-auth/actions.ts",
    "lib/member-auth/session.ts",
    "lib/member-auth/callback.ts",
    "app/(site)/auth/callback/route.ts",
  ]
    .map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
    .join("\n");
  assert.equal(source.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(source.includes("auth.admin"), false);
  assert.equal(source.includes(".update("), false);
});

function signupForm() {
  return form([
    ["name", "테스트회원"],
    ["email", "member@example.invalid"],
    ["password", password],
    ["passwordConfirm", password],
  ]);
}
function loginPairs() {
  return [
    ["email", "member@example.invalid"],
    ["password", password],
  ];
}
function loginForm() {
  return form(loginPairs());
}
