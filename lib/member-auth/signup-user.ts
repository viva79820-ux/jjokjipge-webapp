export type SignupUserSnapshot = {
  identities?: unknown[] | null;
  created_at?: string | null;
  confirmation_sent_at?: string | null;
};

export type SignupEmailKind = "created" | "duplicate" | "resent";

// 인증을 마친 주소는 identities가 빈 배열로 돌아오고 메일은 다시 가지 않는다.
// 아직 인증하지 않은 주소는 identity가 남는다. 그 주소로 다시 가입하면
// 인증 메일이 재발송되고 confirmation_sent_at만 뒤로 움직인다.
// 첫 가입은 같은 요청 안에서 두 시각이 거의 같다.
export const confirmationResendGapMs = 5_000;

export function classifySignupUser(user: SignupUserSnapshot): SignupEmailKind {
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return "duplicate";
  }
  const created = timestamp(user.created_at);
  const sent = timestamp(user.confirmation_sent_at);
  if (
    created !== null &&
    sent !== null &&
    sent - created >= confirmationResendGapMs
  ) {
    return "resent";
  }
  return "created";
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
