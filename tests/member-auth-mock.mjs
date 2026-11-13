import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const publicKey = "fixture-member-public";
const secretKey = "fixture-member-secret";

function json(res, value, status = 200) {
  const body = value === undefined ? "" : JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  });
  res.end(body);
}
function fail(res, status, code) {
  json(res, { code, error_code: code, msg: "rejected" }, status);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
function challenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}
function tokenFor(user) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url");
  const signature = Buffer.from("mock-signature").toString("base64url");
  return `${header}.${payload}.${signature}`;
}
function publicUser(user, obfuscated = false) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.confirmed ? "2026-11-13T00:00:00.000Z" : null,
    user_metadata: { name: user.name },
    identities: obfuscated ? [] : [{ provider: "email", identity_id: user.id }],
    created_at: "2026-11-13T00:00:00.000Z",
    updated_at: "2026-11-13T00:00:00.000Z",
  };
}

export function startAuthMock() {
  const users = new Map();
  const usersById = new Map();
  const codes = new Map();
  const sessions = new Map();
  const refreshes = new Map();
  const requests = [];
  const unexpected = [];
  let latest = null;
  let delayMs = 0;
  let signupMode = "ok";
  let writes = 0;

  function remember(kind, body, extra = {}) {
    requests.push({
      kind,
      email: typeof body.email === "string" ? body.email : undefined,
      data: body.data ?? null,
      hasPassword: typeof body.password === "string",
      passwordLength:
        typeof body.password === "string" ? body.password.length : 0,
      challenge:
        typeof body.code_challenge === "string" ? body.code_challenge : null,
      ...extra,
    });
  }
  function issue(user) {
    const access = tokenFor(user);
    const refresh = randomBytes(18).toString("base64url");
    sessions.set(access, user.id);
    refreshes.set(refresh, user.id);
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: "bearer",
      user: publicUser(user),
    };
  }
  function bearer(req) {
    const value = req.headers.authorization ?? "";
    return value.replace(/^Bearer\s+/i, "");
  }
  function userFromRequest(req) {
    const id = sessions.get(bearer(req));
    return id ? usersById.get(id) : null;
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      unexpected.push(error instanceof Error ? error.name : "mock-error");
      fail(res, 500, "unexpected_failure");
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__test/latest") return json(res, latest);
    if (url.pathname === "/__test/requests")
      return json(res, { requests, unexpected, writes });
    if (url.pathname === "/__test/mode") {
      const body = await readBody(req);
      if (typeof body.delay === "number") delayMs = body.delay;
      if (typeof body.signup === "string") signupMode = body.signup;
      return json(res, { ok: true });
    }
    if (url.pathname === "/__test/expire") {
      if (latest?.code && codes.has(latest.code))
        codes.get(latest.code).expired = true;
      return json(res, { ok: Boolean(latest?.code) });
    }
    if (url.pathname === "/__test/revoke") {
      sessions.clear();
      refreshes.clear();
      return json(res, { ok: true });
    }

    const apiKey = req.headers.apikey;
    if (url.pathname === "/rest/v1/reservations") {
      if (req.method !== "GET") {
        writes += 1;
        return fail(res, 405, "no_write");
      }
      if (apiKey !== secretKey) return fail(res, 401, "no_authorization");
      const number = url.searchParams.get("reservation_no");
      const email = decodeURIComponent(
        (url.searchParams.get("customer_email") ?? "").replace(/^eq\./, ""),
      );
      if (
        number === "eq.R-20261113-0001" &&
        email === "guest-test@example.invalid"
      ) {
        return json(res, [
          {
            reservation_no: "R-20261113-0001",
            status: "confirmed",
            product_name: "테스트 상담",
            minutes: 30,
            price: 10000,
            starts_at: "2026-11-13T03:00:00.000Z",
            ends_at: "2026-11-13T03:30:00.000Z",
            payment_method: "bank_transfer",
            cancel_reason: null,
            counselors: { name: "테스트상담사" },
          },
        ]);
      }
      return json(res, []);
    }

    if (url.pathname === "/rest/v1/profiles") {
      if (req.method !== "GET") {
        writes += 1;
        return fail(res, 405, "no_write");
      }
      if (apiKey !== publicKey) return fail(res, 401, "no_authorization");
      const user = userFromRequest(req);
      const id = url.searchParams.get("id");
      if (!user || id !== `eq.${user.id}`) return json(res, []);
      return json(res, [{ name: user.name, role: "user" }]);
    }

    if (!url.pathname.startsWith("/auth/v1/")) {
      unexpected.push(`${req.method} ${url.pathname}`);
      return fail(res, 404, "not_found");
    }
    if (apiKey !== publicKey) return fail(res, 401, "no_authorization");

    if (url.pathname === "/auth/v1/logout") {
      sessions.delete(bearer(req));
      res.writeHead(204, { "cache-control": "private, no-store" });
      res.end();
      requests.push({ kind: "logout", scope: url.searchParams.get("scope") });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/v1/user") {
      const user = userFromRequest(req);
      if (!user) return fail(res, 401, "session_not_found");
      return json(res, publicUser(user));
    }

    const body = await readBody(req);
    if (url.pathname === "/auth/v1/signup") {
      remember("signup", body, {
        redirectTo: url.searchParams.get("redirect_to"),
      });
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (signupMode === "rate")
        return fail(res, 429, "over_email_send_rate_limit");
      if (signupMode === "weak") return fail(res, 422, "weak_password");
      const email = String(body.email ?? "");
      const existing = users.get(email);
      if (existing) return json(res, publicUser(existing, true));
      if (typeof body.code_challenge !== "string" || !body.code_challenge)
        return fail(res, 400, "validation_failed");
      const user = {
        id: randomUUID(),
        email,
        password: body.password,
        name: body.data?.name ?? "",
        confirmed: false,
      };
      users.set(email, user);
      usersById.set(user.id, user);
      const code = randomBytes(18).toString("base64url");
      codes.set(code, {
        email,
        challenge: body.code_challenge,
        kind: "signup",
        used: false,
        expired: false,
      });
      latest = {
        email,
        code,
        kind: "signup",
        redirectTo: url.searchParams.get("redirect_to"),
      };
      return json(res, publicUser(user));
    }

    if (url.pathname === "/auth/v1/recover") {
      remember("recover", body, {
        redirectTo: url.searchParams.get("redirect_to"),
      });
      const user = users.get(String(body.email ?? ""));
      if (user && typeof body.code_challenge === "string") {
        const code = randomBytes(18).toString("base64url");
        codes.set(code, {
          email: user.email,
          challenge: body.code_challenge,
          kind: "recovery",
          used: false,
          expired: false,
        });
        latest = {
          email: user.email,
          code,
          kind: "recovery",
          redirectTo: url.searchParams.get("redirect_to"),
        };
      } else {
        latest = {
          email: String(body.email ?? ""),
          code: null,
          kind: "recovery",
          redirectTo: url.searchParams.get("redirect_to"),
        };
      }
      return json(res, {});
    }

    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        remember("password", body);
        const user = users.get(String(body.email ?? ""));
        if (!user || user.password !== body.password)
          return fail(res, 400, "invalid_credentials");
        if (!user.confirmed) return fail(res, 400, "email_not_confirmed");
        return json(res, issue(user));
      }
      if (grant === "pkce") {
        const entry = codes.get(body.auth_code);
        const actual =
          typeof body.code_verifier === "string"
            ? challenge(body.code_verifier)
            : "";
        requests.push({
          kind: "pkce",
          matched: Boolean(entry && actual === entry.challenge),
          used: Boolean(entry?.used),
          expired: Boolean(entry?.expired),
        });
        if (!entry || entry.used) return fail(res, 400, "flow_state_not_found");
        if (entry.expired) return fail(res, 400, "flow_state_expired");
        if (actual !== entry.challenge)
          return fail(res, 400, "bad_code_verifier");
        entry.used = true;
        const user = users.get(entry.email);
        if (!user) return fail(res, 400, "user_not_found");
        if (entry.kind === "signup") user.confirmed = true;
        return json(res, issue(user));
      }
      if (grant === "refresh_token") {
        const id = refreshes.get(body.refresh_token);
        const user = id ? usersById.get(id) : null;
        if (!user) return fail(res, 401, "refresh_token_not_found");
        return json(res, issue(user));
      }
      return fail(res, 400, "validation_failed");
    }

    if (req.method === "PUT" && url.pathname === "/auth/v1/user") {
      remember("update-user", body);
      const user = userFromRequest(req);
      if (!user || typeof body.password !== "string")
        return fail(res, 401, "session_not_found");
      user.password = body.password;
      return json(res, publicUser(user));
    }

    unexpected.push(`${req.method} ${url.pathname}`);
    return fail(res, 404, "not_found");
  }

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
        publicKey,
        secretKey,
      });
    });
  });
}
