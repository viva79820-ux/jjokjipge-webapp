export type AuthFailure =
  | "rate"
  | "unconfirmed"
  | "credentials"
  | "exists"
  | "weak"
  | "same"
  | "expired"
  | "pkce"
  | "unavailable"
  | "unknown";

type AuthLike = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

export function authFailure(error: unknown): AuthFailure {
  if (!error || typeof error !== "object") return "unknown";
  const value = error as AuthLike;
  const code = typeof value.code === "string" ? value.code : "";
  const name = typeof value.name === "string" ? value.name : "";
  const status = typeof value.status === "number" ? value.status : 0;
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    status === 429
  ) {
    return "rate";
  }
  if (code === "email_not_confirmed") return "unconfirmed";
  if (code === "invalid_credentials") return "credentials";
  if (code === "user_already_exists" || code === "email_exists")
    return "exists";
  if (code === "weak_password" || name === "AuthWeakPasswordError")
    return "weak";
  if (code === "same_password") return "same";
  if (
    code === "otp_expired" ||
    code === "flow_state_expired" ||
    code === "flow_state_not_found"
  ) {
    return "expired";
  }
  if (
    code === "bad_code_verifier" ||
    name === "AuthPKCECodeVerifierMissingError" ||
    name === "AuthPKCEGrantCodeExchangeError"
  ) {
    return "pkce";
  }
  if (name === "AuthRetryableFetchError" || (status >= 500 && status <= 599)) {
    return "unavailable";
  }
  return "unknown";
}

export function logAuthFailure(scope: string, error: unknown) {
  const value =
    error && typeof error === "object" ? (error as AuthLike) : undefined;
  const code = typeof value?.code === "string" ? value.code : "unknown";
  const status = typeof value?.status === "number" ? value.status : 0;
  console.error(scope, { code, status });
}

export const messages = {
  invalidInput: "입력한 내용을 확인해 주세요.",
  rate: "요청이 많아 지금은 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
  loginRate: "요청이 많아 잠시 후 다시 시도해 주세요.",
  unavailable: "일시적인 문제로 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  credentials: "이메일 또는 비밀번호가 맞지 않아요.",
  unconfirmed: "이메일 인증을 마친 뒤 로그인해 주세요.",
  weak: "비밀번호가 보안 기준에 맞지 않아요. 더 복잡한 비밀번호를 입력해 주세요.",
  same: "이전에 쓰던 비밀번호와 다르게 입력해 주세요.",
  origin:
    "인증 메일을 보낼 주소를 확인하지 못했어요. 서비스 주소 설정이 필요해요.",
  logout: "로그아웃하지 못했어요. 다시 시도해 주세요.",
  session: "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.",
  resetAccepted:
    "요청을 접수했어요. 가입된 주소라면 비밀번호 재설정 메일을 보내요. 메일이 없으면 스팸함을 확인하거나 잠시 후 다시 시도해 주세요.",
  expiredLink:
    "링크가 만료됐거나 로그인 상태가 아니에요. 비밀번호 재설정을 다시 요청해 주세요.",
} as const;
