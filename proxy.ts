import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { legacyProductionRedirect } from "@/lib/site-origin";
export async function proxy(request: NextRequest) {
  const legacyTarget = legacyProductionRedirect(
    request.headers.get("host"),
    request.nextUrl,
  );
  if (legacyTarget) return NextResponse.redirect(legacyTarget, 308);
  // Server layouts cannot read the URL directly. Always replace untrusted input.
  request.headers.set("x-admin-path", request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return withNotifyLinkHeaders(response, request);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
  await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (
    path === "/mypage" ||
    path.startsWith("/mypage/") ||
    path === "/login" ||
    path === "/signup" ||
    path === "/forgot-password" ||
    path === "/auth" ||
    path.startsWith("/auth/")
  ) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (path === "/auth/confirm") {
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return withNotifyLinkHeaders(response, request);
}

function withNotifyLinkHeaders(response: NextResponse, request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    (path === "/support/lookup" || path === "/booking/lookup") &&
    request.nextUrl.searchParams.has("t")
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
