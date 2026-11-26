import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
      async verifyOtp(params) {
        calls.push(["verifyOtp", params]);
        if (options.verifyError) {
          return {
            data: { user: null, session: null },
            error: options.verifyError,
          };
        }
        current = {
          id: userId,
          email: "member@example.invalid",
          email_confirmed_at: options.unconfirmedVerify
            ? null
            : "2026-11-13T00:00:00.000Z",
        };
        return {
          data: {
            user: current,
            session:
              options.verifySession === false
                ? null
                : { access_token: "session" },
          },
          error: null,
        };
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
    VERCEL_ENV: undefined,
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
    "./consents": {
      async recordSignupConsent(id) {
        calls.push(["recordSignupConsent", id]);
        if (options.consentError) throw options.consentError;
      },
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

    const unchecked = await settle(
      auth.signUp(
        {},
        form([
          ["name", "테스트회원"],
          ["email", "member@example.invalid"],
          ["password", password],
          ["passwordConfirm", password],
        ]),
      ),
    );
    assert.match(unchecked.state.errors.ageConfirmed, /14세/);
    assert.match(unchecked.state.errors.termsAgreed, /이용약관/);
    assert.match(unchecked.state.errors.privacyAgreed, /개인정보/);
    assert.equal(
      auth.calls.some((call) => call[0] === "signUp"),
      false,
    );

    const forgedAgreement = signupForm();
    forgedAgreement.set("termsAgreed", "true");
    const rejectedAgreement = await settle(auth.signUp({}, forgedAgreement));
    assert.equal(
      rejectedAgreement.state.message,
      "입력한 내용을 확인해 주세요.",
    );
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
          ["ageConfirmed", "accepted"],
          ["termsAgreed", "accepted"],
          ["privacyAgreed", "accepted"],
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
    assert.deepEqual(
      auth.calls.find((call) => call[0] === "recordSignupConsent"),
      ["recordSignupConsent", userId],
    );
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
    assert.equal(
      duplicate.calls.some((call) => call[0] === "recordSignupConsent"),
      false,
    );
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

  const consentFailed = harness({
    consentError: new Error("consent unavailable"),
  });
  try {
    const result = await settle(consentFailed.signUp({}, signupForm()));
    assert.match(result.state.message, /일시적인 문제/);
    assert.equal(result.redirect, undefined);
    assert.deepEqual(
      consentFailed.calls.find((call) => call[0] === "recordSignupConsent"),
      ["recordSignupConsent", userId],
    );
  } finally {
    consentFailed.restore();
  }
});

test("signup consent recording fixes both versions and removes an inconsistent new account", async () => {
  const calls = [];
  let insertError = null;
  let cleanupError = null;
  const consent = load("../lib/member-auth/consents.ts", {
    "server-only": {},
    "@/lib/supabase/admin": {
      createAdminClient() {
        return {
          from(table) {
            calls.push(["from", table]);
            return {
              async insert(values) {
                calls.push(["insert", values]);
                return { error: insertError };
              },
            };
          },
          auth: {
            admin: {
              async deleteUser(id) {
                calls.push(["deleteUser", id]);
                return { error: cleanupError };
              },
            },
          },
        };
      },
    },
  });

  await consent.recordSignupConsent(userId);
  assert.deepEqual(calls, [
    ["from", "member_consents"],
    [
      "insert",
      {
        user_id: userId,
        terms_version: "1.0",
        privacy_version: "1.0",
      },
    ],
  ]);

  calls.length = 0;
  insertError = new Error("insert failed");
  await assert.rejects(
    () => consent.recordSignupConsent(userId),
    /insert failed/,
  );
  assert.deepEqual(calls.at(-1), ["deleteUser", userId]);

  calls.length = 0;
  cleanupError = new Error("cleanup failed");
  await assert.rejects(
    () => consent.recordSignupConsent(userId),
    AggregateError,
  );
  assert.deepEqual(calls.at(-1), ["deleteUser", userId]);
});

test("legal documents keep the approved terms and match signup collection fields", () => {
  const terms = readFileSync(
    new URL("../content/legal/terms-of-service.md", import.meta.url),
    "utf8",
  );
  const privacy = readFileSync(
    new URL("../content/legal/privacy-consent-signup.md", import.meta.url),
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(terms).digest("hex"),
    "013008b36cf209325a726f29dccb9dd733976818465dc321577794e14c6b51d9",
  );
  assert.match(terms, /대표자 \[대표자명\]/);
  assert.match(terms, /사업자등록번호 \[사업자등록번호\]/);
  assert.match(privacy, /필수: 이메일, 비밀번호\(암호화하여 저장\), 이름/);
  assert.equal(privacy.includes("휴대전화번호"), false);

  const signup = readFileSync(
    new URL("../components/member-auth/signup-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(signup, /href="\/terms"/);
  assert.match(signup, /href="\/privacy-consent"/);
  assert.match(signup, /가입하고 인증 메일 받기/);
  assert.match(signup, /만 14세 이상/);
});

test("signup and password reset explain unsupported email delivery", async () => {
  const expected =
    "지금은 이 주소로 메일을 보낼 수 없어요. 잠시 후 다시 시도하거나 매장으로 문의해 주세요.";
  const signup = harness({
    signUpError: authError("email_address_not_authorized", 403),
  });
  try {
    const result = await settle(signup.signUp({}, signupForm()));
    assert.equal(result.state.message, expected);
    assert.equal(JSON.stringify(result.state).includes("raw "), false);
  } finally {
    signup.restore();
  }

  const reset = harness({
    resetError: authError("email_address_not_authorized", 403),
  });
  try {
    const result = await settle(
      reset.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.equal(result.state.message, expected);
    assert.equal(result.state.status, undefined);
    assert.equal(JSON.stringify(result.state).includes("raw "), false);
  } finally {
    reset.restore();
  }
});

test("signup and recovery prefer the production host over a trusted Vercel alias", async () => {
  const savedHeaders = { ...headerState };
  const vercelEnv = {
    VERCEL: "1",
    VERCEL_URL: "member-preview.vercel.app",
    VERCEL_BRANCH_URL: "branch-preview.vercel.app",
  };
  headerState.host = "angelsaju.com";
  headerState.forwardedHost = "member-preview.vercel.app";
  headerState.forwardedProto = "https";
  const auth = harness({ env: vercelEnv });
  try {
    const signup = await settle(auth.signUp({}, signupForm()));
    assert.equal(signup.redirect, "/auth/verify");
    assert.equal(
      auth.calls.find((call) => call[0] === "signUp")[1].options
        .emailRedirectTo,
      "https://angelsaju.com/auth/callback?next=%2Fmypage",
    );

    const recovery = await settle(
      auth.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.equal(recovery.state.status, "accepted");
    assert.equal(
      auth.calls.find((call) => call[0] === "reset")[2].redirectTo,
      "https://angelsaju.com/auth/callback?next=%2Fauth%2Fupdate-password",
    );
  } finally {
    auth.restore();
    Object.assign(headerState, savedHeaders);
  }

  headerState.host = "member-preview.vercel.app";
  headerState.forwardedHost = "branch-preview.vercel.app";
  headerState.forwardedProto = "https";
  const preview = harness({ env: vercelEnv });
  try {
    const signup = await settle(preview.signUp({}, signupForm()));
    assert.equal(signup.redirect, "/auth/verify");
    assert.equal(
      preview.calls.find((call) => call[0] === "signUp")[1].options
        .emailRedirectTo,
      "https://branch-preview.vercel.app/auth/callback?next=%2Fmypage",
    );

    const recovery = await settle(
      preview.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.equal(recovery.state.status, "accepted");
    assert.equal(
      preview.calls.find((call) => call[0] === "reset")[2].redirectTo,
      "https://branch-preview.vercel.app/auth/callback?next=%2Fauth%2Fupdate-password",
    );
  } finally {
    preview.restore();
    Object.assign(headerState, savedHeaders);
  }

  headerState.host = "attacker.example";
  headerState.forwardedHost = "forged.example";
  headerState.forwardedProto = "https";
  const rejected = harness();
  try {
    const signup = await settle(rejected.signUp({}, signupForm()));
    assert.match(signup.state.message, /서비스 주소 설정/);
    const recovery = await settle(
      rejected.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.match(recovery.state.message, /서비스 주소 설정/);
    assert.equal(
      rejected.calls.some(
        (call) => call[0] === "signUp" || call[0] === "reset",
      ),
      false,
    );
  } finally {
    rejected.restore();
    Object.assign(headerState, savedHeaders);
  }
});

test("production signup and recovery stay on the apex host", async () => {
  const savedHeaders = { ...headerState };
  const productionEnv = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_URL: "jjokjipge-webapp-deploy.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "www.angelsaju.com",
    VERCEL_BRANCH_URL: "jjokjipge-webapp-git-main.vercel.app",
  };
  headerState.host = "angelsaju.com";
  headerState.forwardedHost = "jjokjipge-webapp-deploy.vercel.app";
  headerState.forwardedProto = "https";
  const auth = harness({ env: productionEnv });
  try {
    const signup = await settle(auth.signUp({}, signupForm()));
    assert.equal(signup.redirect, "/auth/verify");
    assert.equal(
      auth.calls.find((call) => call[0] === "signUp")[1].options
        .emailRedirectTo,
      "https://angelsaju.com/auth/callback?next=%2Fmypage",
    );
    const recovery = await settle(
      auth.requestPasswordReset(
        {},
        form([["email", "member@example.invalid"]]),
      ),
    );
    assert.equal(recovery.state.status, "accepted");
    assert.equal(
      auth.calls.find((call) => call[0] === "reset")[2].redirectTo,
      "https://angelsaju.com/auth/callback?next=%2Fauth%2Fupdate-password",
    );
  } finally {
    auth.restore();
    Object.assign(headerState, savedHeaders);
  }

  for (const host of ["www.angelsaju.com", "jjokjipge-webapp.vercel.app"]) {
    headerState.host = host;
    headerState.forwardedHost = "jjokjipge-webapp-deploy.vercel.app";
    headerState.forwardedProto = "https";
    const refused = harness({ env: productionEnv });
    try {
      const signup = await settle(refused.signUp({}, signupForm()));
      assert.match(signup.state.message, /서비스 주소 설정/);
      const recovery = await settle(
        refused.requestPasswordReset(
          {},
          form([["email", "member@example.invalid"]]),
        ),
      );
      assert.match(recovery.state.message, /서비스 주소 설정/);
      assert.equal(
        refused.calls.some(
          (call) => call[0] === "signUp" || call[0] === "reset",
        ),
        false,
      );
    } finally {
      refused.restore();
      Object.assign(headerState, savedHeaders);
    }
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

  const same = harness({
    user: {
      id: userId,
      email: "member@example.invalid",
      email_confirmed_at: "2026-11-13T00:00:00.000Z",
    },
    updateError: authError("same_password", 422),
  });
  try {
    const result = await settle(
      same.updatePassword(
        {},
        form([
          ["password", password],
          ["passwordConfirm", password],
        ]),
      ),
    );
    assert.equal(result.redirect, undefined);
    assert.equal(
      result.state.errors.password,
      "이전에 쓰던 비밀번호와 다르게 입력해 주세요.",
    );
    assert.equal(JSON.stringify(result.state).includes("raw "), false);
    assert.equal(JSON.stringify(result.state).includes(password), false);
  } finally {
    same.restore();
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
  const site = load("../lib/site-origin.ts", {});
  const productionOrigin = "https://angelsaju.com";
  const saved = {
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    assert.equal(site.productionOrigin, productionOrigin);
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "angelsaju.com" : null),
      }),
      productionOrigin,
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "jjokjipge-webapp.vercel.app" : null),
      }),
      null,
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "www.angelsaju.com" : null),
      }),
      null,
    );
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
      redirect.safeNext("/mypage/reviews/new", "/mypage"),
      "/mypage/reviews/new",
    );
    assert.equal(
      redirect.safeNext(
        "/mypage/reviews/new/11111111-1111-4111-8111-111111111111",
        "/mypage",
      ),
      "/mypage",
    );
    assert.equal(
      redirect.safeNext("/auth/update-password", "/mypage"),
      "/auth/update-password",
    );

    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "member-preview.vercel.app";
    process.env.VERCEL_BRANCH_URL = "branch-preview.vercel.app";
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "angelsaju.com" : null),
      }),
      productionOrigin,
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get(name) {
          if (name === "x-forwarded-host") return "member-preview.vercel.app";
          if (name === "x-forwarded-proto") return "https";
          if (name === "host") return "angelsaju.com";
          return null;
        },
      }),
      productionOrigin,
    );
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
          if (name === "host") return "member-preview.vercel.app";
          return null;
        },
      }),
      "https://branch-preview.vercel.app",
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
        get(name) {
          if (name === "x-forwarded-host") return "forged.example";
          if (name === "x-forwarded-proto") return "https";
          if (name === "host") return "attacker.example";
          return null;
        },
      }),
      null,
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get: (name) => (name === "host" ? "127.0.0.1:4333" : null),
      }),
      null,
    );

    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "jjokjipge-webapp-deploy.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "www.angelsaju.com";
    assert.equal(
      redirect.resolveTrustedOrigin({
        get(name) {
          if (name === "x-forwarded-host")
            return "jjokjipge-webapp-deploy.vercel.app";
          if (name === "x-forwarded-proto") return "https";
          if (name === "host") return "angelsaju.com";
          return null;
        },
      }),
      productionOrigin,
    );
    assert.equal(
      redirect.resolveTrustedOrigin({
        get(name) {
          if (name === "x-forwarded-host") return "www.angelsaju.com";
          if (name === "x-forwarded-proto") return "https";
          if (name === "host") return "jjokjipge-webapp.vercel.app";
          return null;
        },
      }),
      null,
    );
    assert.equal(
      site.publicAbsoluteOrigin({
        VERCEL_ENV: "production",
        VERCEL_URL: "jjokjipge-webapp-deploy.vercel.app",
      }),
      productionOrigin,
    );
    assert.equal(
      site.publicAbsoluteOrigin({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "member-preview.vercel.app",
        VERCEL_BRANCH_URL: "branch-preview.vercel.app",
      }),
      "https://branch-preview.vercel.app",
    );
    assert.equal(
      site.publicAbsoluteOrigin({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "member-preview.vercel.app",
      }),
      "https://member-preview.vercel.app",
    );
    assert.equal(site.publicAbsoluteOrigin({}), null);
    const legacyHost = "jjokjipge-webapp.vercel.app";
    assert.equal(
      site.legacyProductionRedirect(
        legacyHost,
        new URL(
          `https://${legacyHost}/auth/callback?next=%2Fauth%2Fupdate-password`,
        ),
      ).href,
      "https://angelsaju.com/auth/callback?next=%2Fauth%2Fupdate-password",
    );
    assert.equal(
      site.legacyProductionRedirect(
        legacyHost,
        new URL(`https://${legacyHost}/consult?field=tarot`),
      ).href,
      "https://angelsaju.com/consult?field=tarot",
    );
    assert.equal(
      site.legacyProductionRedirect(
        "www.angelsaju.com",
        new URL("https://www.angelsaju.com/login?from=home"),
      ),
      null,
    );
    assert.equal(
      site.legacyProductionRedirect(
        "angelsaju.com",
        new URL("https://angelsaju.com/login"),
      ),
      null,
    );
    assert.equal(
      site.legacyProductionRedirect(
        "branch-preview.vercel.app",
        new URL("https://branch-preview.vercel.app/login?x=1"),
      ),
      null,
    );
    assert.equal(
      site.legacyProductionRedirect(
        "jjokjipge-webapp.vercel.app.evil.example",
        new URL("https://jjokjipge-webapp.vercel.app.evil.example/login"),
      ),
      null,
    );
    assert.equal(
      site.legacyProductionRedirect(
        "jjokjipge-webapp.vercel.app, evil.example",
        new URL(`https://${legacyHost}/login`),
      ),
      null,
    );
    assert.equal(
      site.legacyProductionRedirect(
        " jjokjipge-webapp.vercel.app",
        new URL(`https://${legacyHost}/login`),
      ),
      null,
    );
    const projectConfig = JSON.parse(
      readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
    );
    assert.equal(projectConfig.redirects.length, 1);
    assert.deepEqual(projectConfig.redirects[0].has, [
      { type: "host", value: site.legacyProductionHost },
    ]);
    assert.equal(
      projectConfig.redirects[0].destination,
      `${productionOrigin}/$1`,
    );
    assert.equal(projectConfig.redirects[0].permanent, true);
    assert.equal(
      JSON.stringify(projectConfig.redirects).includes("www.angelsaju.com"),
      false,
    );
    const layout = readFileSync(
      new URL("../app/layout.tsx", import.meta.url),
      "utf8",
    );
    const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
    assert.equal(layout.includes("publicAbsoluteOrigin"), true);
    assert.equal(layout.includes("jjokjipge-webapp.vercel.app"), false);
    assert.equal(
      proxy.indexOf('request.headers.get("host")') <
        proxy.indexOf("createServerClient("),
      true,
    );

    assert.equal(
      redirect.callbackUrl(productionOrigin, "/mypage"),
      `${productionOrigin}/auth/callback?next=%2Fmypage`,
    );
    assert.equal(
      redirect.callbackUrl(productionOrigin, "/admin"),
      `${productionOrigin}/auth/callback?next=%2Fmypage`,
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
    "lib/member-auth/confirm.ts",
    "app/(site)/auth/callback/route.ts",
    "app/(site)/auth/confirm/page.tsx",
  ]
    .map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
    .join("\n");
  assert.equal(source.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(source.includes("auth.admin"), false);
  assert.equal(source.includes(".update("), false);
  const confirmPage = readFileSync(
    new URL("../app/(site)/auth/confirm/page.tsx", import.meta.url),
    "utf8",
  );
  const confirmForm = readFileSync(
    new URL("../components/member-auth/confirm-form.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(confirmPage.includes("verifyOtp"), false);
  assert.equal(confirmForm.includes("verifyOtp"), false);
  assert.equal(source.includes("exchangeCodeForSession"), true);
});

test("email confirmation keeps ordinary and PKCE tokens until the confirm button and rejects reuse or bad redirects", async () => {
  const confirm = load("../lib/member-auth/confirm.ts", {});
  const token = "ab".repeat(28);
  const pkceToken = `pkce_${token}`;
  const preview = confirm.readConfirmLink({
    tokenHashes: [token],
    types: ["email"],
    nextValues: ["/mypage"],
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.tokenHash, token);
  assert.equal(preview.path, "/mypage");
  const recoveryPreview = confirm.readConfirmLink({
    tokenHashes: [pkceToken],
    types: ["recovery"],
    nextValues: [],
  });
  assert.equal(recoveryPreview.ok, true);
  assert.equal(recoveryPreview.tokenHash, pkceToken);
  assert.equal(recoveryPreview.path, "/auth/update-password");

  const blocked = [
    ["email", "https://evil.example"],
    ["email", "//evil.example"],
    ["email", "/admin"],
    ["email", "/auth/update-password"],
    ["recovery", "/mypage"],
    ["recovery", "https://angelsaju.com/auth/update-password"],
  ];
  for (const [type, next] of blocked) {
    const decision = confirm.readConfirmLink({
      tokenHashes: [token],
      types: [type],
      nextValues: [next],
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.reason, "redirect");
    assert.equal(JSON.stringify(decision).includes(token), false);
  }
  assert.equal(
    confirm.readConfirmLink({
      tokenHashes: [token, token],
      types: ["email"],
      nextValues: ["/mypage"],
    }).reason,
    "invalid",
  );
  assert.equal(
    confirm.readConfirmLink({
      tokenHashes: [token],
      types: ["signup"],
      nextValues: ["/mypage"],
    }).reason,
    "invalid",
  );
  for (const invalidToken of [
    `PKCE_${token}`,
    `pkce_pkce_${token}`,
    "pkce_",
    `pkce_${"ab".repeat(15)}`,
    `pkce_${"ab".repeat(65)}`,
  ]) {
    assert.equal(
      confirm.readConfirmLink({
        tokenHashes: [invalidToken],
        types: ["email"],
        nextValues: ["/mypage"],
      }).reason,
      "invalid",
    );
  }

  const signup = harness();
  try {
    const result = await settle(
      signup.confirmEmail(
        {},
        form([
          ["token_hash", token],
          ["type", "email"],
          ["next", "/mypage"],
        ]),
      ),
    );
    assert.equal(result.redirect, "/mypage");
    assert.deepEqual(signup.calls.find((call) => call[0] === "verifyOtp")[1], {
      token_hash: token,
      type: "email",
    });
    assert.equal(
      signup.calls.filter((call) => call[0] === "verifyOtp").length,
      1,
    );
    assert.equal(JSON.stringify(signup.logs).includes(token), false);
    assert.equal(JSON.stringify(result).includes(token), false);
  } finally {
    signup.restore();
  }

  const recovery = harness();
  try {
    const result = await settle(
      recovery.confirmEmail(
        {},
        form([
          ["token_hash", pkceToken],
          ["type", "recovery"],
        ]),
      ),
    );
    assert.equal(result.redirect, "/auth/update-password");
    assert.deepEqual(
      recovery.calls.find((call) => call[0] === "verifyOtp")[1],
      {
        token_hash: pkceToken,
        type: "recovery",
      },
    );
    assert.equal(JSON.stringify(recovery.logs).includes(pkceToken), false);
    assert.equal(JSON.stringify(result).includes(pkceToken), false);
  } finally {
    recovery.restore();
  }

  const wrongTarget = harness();
  try {
    const result = await settle(
      wrongTarget.confirmEmail(
        {},
        form([
          ["token_hash", token],
          ["type", "email"],
          ["next", "https://evil.example/mypage"],
        ]),
      ),
    );
    assert.match(result.state.message, /이동할 주소/);
    assert.equal(
      wrongTarget.calls.some((call) => call[0] === "verifyOtp"),
      false,
    );
    assert.equal(JSON.stringify(result.state).includes(token), false);
  } finally {
    wrongTarget.restore();
  }

  const expired = harness({ verifyError: authError("otp_expired", 403) });
  try {
    const first = await settle(
      expired.confirmEmail(
        {},
        form([
          ["token_hash", pkceToken],
          ["type", "email"],
          ["next", "/mypage"],
        ]),
      ),
    );
    const second = await settle(
      expired.confirmEmail(
        {},
        form([
          ["token_hash", pkceToken],
          ["type", "email"],
          ["next", "/mypage"],
        ]),
      ),
    );
    assert.equal(first.redirect, undefined);
    assert.match(first.state.message, /만료됐거나 이미 사용/);
    assert.match(second.state.message, /만료됐거나 이미 사용/);
    assert.equal(
      expired.calls.filter((call) => call[0] === "verifyOtp").length,
      2,
    );
    assert.equal(JSON.stringify(expired.logs).includes(pkceToken), false);
  } finally {
    expired.restore();
  }

  const unconfirmed = harness({ unconfirmedVerify: true });
  try {
    const result = await settle(
      unconfirmed.confirmEmail(
        {},
        form([
          ["token_hash", token],
          ["type", "email"],
          ["next", "/mypage"],
        ]),
      ),
    );
    assert.match(result.state.message, /로그인 상태/);
    assert.deepEqual(
      unconfirmed.calls.find((call) => call[0] === "signOut")[1],
      { scope: "local" },
    );
  } finally {
    unconfirmed.restore();
  }
});

function signupForm() {
  return form([
    ["name", "테스트회원"],
    ["email", "member@example.invalid"],
    ["password", password],
    ["passwordConfirm", password],
    ["ageConfirmed", "accepted"],
    ["termsAgreed", "accepted"],
    ["privacyAgreed", "accepted"],
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
