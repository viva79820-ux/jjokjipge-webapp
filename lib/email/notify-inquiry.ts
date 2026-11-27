import "server-only";

import { headers } from "next/headers";
import { resolveTrustedOrigin } from "@/lib/member-auth/redirect";
import { isValidEmail } from "@/lib/reservations/rules";
import { siteConfig } from "@/lib/site-config";
import { productionOrigin } from "@/lib/site-origin";
import { createNotifyToken, notifyLookupHref } from "@/lib/notify-link/token";
import { createMemoryDeliveryStore, deliverOnce } from "./deliver-once";
import { inquiryAnsweredContent } from "./inquiry-answered-message";
import { sendResendMail } from "./send-resend";

const deliveries = createMemoryDeliveryStore();

export type InquiryAnswerNotice = {
  id: string;
  email: string;
};

export type MailOutcome = "sent" | "failed" | "skipped";

async function siteOrigin() {
  try {
    const origin = resolveTrustedOrigin(await headers());
    if (origin) return origin;
  } catch {
    // 요청 주소를 못 읽으면 운영 도메인의 문의 조회 링크를 쓴다.
  }
  return productionOrigin;
}

// 답변을 처음 저장할 때만 서버 액션이 호출한다. 수정 저장은 다시 보내지 않는다.
// 같은 서버 프로세스에서 같은 문의의 성공한 발송은 한 번만 나간다.
export async function notifyInquiryAnswered(
  notice: InquiryAnswerNotice,
): Promise<MailOutcome> {
  try {
    const email = notice.email.trim().toLowerCase();
    if (!notice.id || !isValidEmail(email)) return "failed";
    const origin = await siteOrigin();
    const token = createNotifyToken({ kind: "inquiry", id: notice.id });
    const content = inquiryAnsweredContent({
      lookupUrl: notifyLookupHref(origin, "inquiry", token),
      phone: siteConfig.phone,
    });
    return await deliverOnce(notice.id, deliveries, async () => {
      const result = await sendResendMail({
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      return result.ok;
    });
  } catch {
    return "failed";
  }
}
