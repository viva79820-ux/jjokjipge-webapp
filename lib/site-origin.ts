export const productionOrigin = "https://angelsaju.com";

export const legacyProductionHost = "jjokjipge-webapp.vercel.app";

export function httpsHost(value: string | undefined) {
  if (!value || !/^[a-z0-9.-]+$/i.test(value)) return null;
  if (
    value.includes("..") ||
    value.startsWith("-") ||
    value.endsWith("-") ||
    value.startsWith(".") ||
    value.endsWith(".")
  ) {
    return null;
  }
  return `https://${value}`;
}

export function publicAbsoluteOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.VERCEL_ENV === "production") return productionOrigin;
  if (!env.VERCEL) return null;
  return httpsHost(env.VERCEL_BRANCH_URL) ?? httpsHost(env.VERCEL_URL);
}

// www는 Vercel 도메인 설정에서만 방향을 바꾼다. 여기서 www까지 보내면
// 기존의 apex → www 리디렉션과 순환한다.
export function legacyProductionRedirect(host: string | null, url: URL) {
  if (!host || host !== host.trim() || host.includes(",")) return null;
  if (host !== legacyProductionHost) return null;
  const destination = new URL(url.pathname + url.search, productionOrigin);
  if (destination.origin !== productionOrigin) return null;
  if (destination.username || destination.password) return null;
  return destination;
}
