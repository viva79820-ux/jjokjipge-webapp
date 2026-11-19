import { authFailure } from "./errors";
import { safeNext } from "./redirect";

export type CallbackDecision =
  { type: "redirect"; path: string } | { type: "unavailable" };

const reasonPath = {
  invalid: "/auth/error?reason=invalid",
  expired: "/auth/error?reason=expired",
  pkce: "/auth/error?reason=pkce",
  session: "/auth/error?reason=session",
} as const;

export function callbackReason(error: unknown) {
  const failure = authFailure(error);
  if (failure === "expired") return "expired" as const;
  if (failure === "pkce") return "pkce" as const;
  return "invalid" as const;
}

export function providerErrorReason(errorCode: string | null) {
  if (
    errorCode === "otp_expired" ||
    errorCode === "flow_state_expired" ||
    errorCode === "flow_state_not_found"
  ) {
    return "expired" as const;
  }
  return "invalid" as const;
}

export function decideCallback(input: {
  origin: string | null;
  codes: string[];
  next: unknown;
  providerError: boolean;
  providerErrorCode: string | null;
  exchange:
    | { ok: true; redirectType: string | null; confirmed: boolean }
    | { ok: false; reason: "invalid" | "expired" | "pkce" | "session" }
    | null;
}): CallbackDecision {
  if (!input.origin) return { type: "unavailable" };
  if (input.providerError) {
    return {
      type: "redirect",
      path: reasonPath[providerErrorReason(input.providerErrorCode)],
    };
  }
  const code = input.codes.length === 1 ? input.codes[0] : "";
  if (!code || input.codes.length !== 1) {
    return { type: "redirect", path: reasonPath.invalid };
  }
  if (!input.exchange || !input.exchange.ok) {
    const reason = input.exchange?.reason ?? "invalid";
    return { type: "redirect", path: reasonPath[reason] };
  }
  if (!input.exchange.confirmed) {
    return { type: "redirect", path: reasonPath.session };
  }
  if (input.exchange.redirectType === "recovery") {
    return { type: "redirect", path: "/auth/update-password" };
  }
  return {
    type: "redirect",
    path: safeNext(input.next, "/mypage"),
  };
}
