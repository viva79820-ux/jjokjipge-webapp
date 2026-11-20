import {
  httpsHost,
  legacyProductionHost,
  productionOrigin,
} from "@/lib/site-origin";

const localOrigins = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:4333",
  "http://127.0.0.1:4333",
] as const;

const allowedNext = new Set([
  "/login",
  "/mypage",
  "/auth/update-password",
  "/auth/verify",
]);

export function trustedOrigins(env: NodeJS.ProcessEnv = process.env) {
  const origins = [productionOrigin];
  if (env.VERCEL_ENV !== "production") {
    for (const origin of [
      httpsHost(env.VERCEL_URL),
      httpsHost(env.VERCEL_BRANCH_URL),
    ]) {
      if (origin) origins.push(origin);
    }
  }
  if (!env.VERCEL) origins.push(...localOrigins);
  return origins;
}

function singleHeader(value: string | null) {
  if (!value || value !== value.trim() || value.includes(",")) return null;
  return value;
}

export function resolveTrustedOrigin(
  headers: {
    get(name: string): string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
) {
  const allowed = new Set(trustedOrigins(env));
  const forwardedHost = singleHeader(headers.get("x-forwarded-host"));
  const host = singleHeader(headers.get("host"));
  const forwardedProto = singleHeader(headers.get("x-forwarded-proto"));
  const hostProto =
    forwardedProto ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  const preferHost =
    hostProto === "https" && `${hostProto}://${host}` === productionOrigin;
  const candidates = (
    preferHost ? [host, forwardedHost] : [forwardedHost, host]
  ).filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate === legacyProductionHost) continue;
    const proto =
      forwardedProto ??
      (candidate.startsWith("localhost") || candidate.startsWith("127.0.0.1")
        ? "http"
        : "https");
    if (proto !== "http" && proto !== "https") continue;
    const origin = `${proto}://${candidate}`;
    if (allowed.has(origin)) return origin;
  }
  return null;
}

export function safeNext(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.length > 200) return fallback;
  if (value.includes("%") || value.includes("\\") || value.includes("//"))
    return fallback;
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (!value.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(value, "https://member.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://member.invalid") return fallback;
  if (url.username || url.password || url.search || url.hash) return fallback;
  if (url.pathname !== value) return fallback;
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))
    return fallback;
  if (!allowedNext.has(url.pathname)) return fallback;
  return url.pathname;
}

export function callbackUrl(origin: string, next: string) {
  const path = safeNext(next, "/mypage");
  return `${origin}/auth/callback?next=${encodeURIComponent(path)}`;
}
