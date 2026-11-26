import "server-only";

export const reservationMailFrom =
  "쪽집게천사 운세통 <noreply@mail.angelsaju.com>";

const resendEndpoint = "https://api.resend.com/emails";

export type OutboundMail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendMailResult =
  { ok: true } | { ok: false; reason: "missing_key" | "request_failed" };

export async function sendResendMail(
  mail: OutboundMail,
  deps?: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  },
): Promise<SendMailResult> {
  const env = deps?.env ?? process.env;
  const key = env.RESEND_API_KEY;
  if (typeof key !== "string" || key.trim() === "")
    return { ok: false, reason: "missing_key" };
  try {
    const response = await (deps?.fetchImpl ?? fetch)(resendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: reservationMailFrom,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, reason: "request_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "request_failed" };
  }
}
