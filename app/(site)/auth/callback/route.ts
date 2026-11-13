import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  callbackReason,
  decideCallback,
  type CallbackDecision,
} from "@/lib/member-auth/callback";
import { logAuthFailure } from "@/lib/member-auth/errors";
import { resolveTrustedOrigin } from "@/lib/member-auth/redirect";

const unavailableMessage =
  "인증 주소를 확인하지 못했어요. 서비스 주소 설정이 필요해요.";

function flowId(value: string | null) {
  if (!value || !/^[a-zA-Z0-9_-]{8,64}$/.test(value)) return null;
  return value;
}

function location(origin: string, decision: CallbackDecision) {
  if (decision.type === "unavailable") return null;
  return new URL(decision.path, origin);
}

export async function GET(request: NextRequest) {
  const origin = resolveTrustedOrigin(request.headers);
  const params = request.nextUrl.searchParams;
  const codes = params.getAll("code").filter((value) => value.length > 0);
  let exchange:
    | { ok: true; redirectType: string | null; confirmed: boolean }
    | { ok: false; reason: "invalid" | "expired" | "pkce" | "session" }
    | null = null;

  if (origin && !params.get("error") && codes.length === 1) {
    try {
      const supabase = await createClient();
      const id = flowId(params.get("sb_flow_id"));
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        codes[0],
        id ? { flowId: id } : undefined,
      );
      if (error || !data.session || !data.user) {
        logAuthFailure("member callback failed", error);
        exchange = { ok: false, reason: callbackReason(error) };
      } else {
        const confirmed = await supabase.auth.getUser();
        const payload = data as { redirectType?: unknown };
        const redirectType =
          payload.redirectType === "recovery" ? "recovery" : null;
        const verified = Boolean(
          !confirmed.error && confirmed.data.user?.email_confirmed_at,
        );
        if (!verified) await supabase.auth.signOut({ scope: "local" });
        exchange = {
          ok: true,
          redirectType,
          confirmed: verified,
        };
      }
    } catch (error) {
      logAuthFailure("member callback failed", error);
      exchange = { ok: false, reason: "invalid" };
    }
  }

  const decision = decideCallback({
    origin,
    codes,
    next: params.get("next"),
    providerError: Boolean(params.get("error")),
    providerErrorCode: params.get("error_code"),
    exchange,
  });
  const target = origin ? location(origin, decision) : null;
  if (!target) {
    return new NextResponse(unavailableMessage, {
      status: 400,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  }
  const response = NextResponse.redirect(target);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
