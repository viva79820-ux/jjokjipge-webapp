import "server-only";

import { headers } from "next/headers";
import { resolveTrustedOrigin } from "@/lib/member-auth/redirect";
import { isValidEmail } from "@/lib/reservations/rules";
import { siteConfig } from "@/lib/site-config";
import { productionOrigin } from "@/lib/site-origin";
import { createMemoryDeliveryStore, deliverOnce } from "./deliver-once";
import {
  readCounselorName,
  reservationConfirmedContent,
  type CounselorRelation,
} from "./reservation-confirmed-message";
import { sendResendMail } from "./send-resend";

const deliveries = createMemoryDeliveryStore();

export type ReservationConfirmation = {
  id: string;
  reservationNo: string;
  counselors: CounselorRelation;
  productName: string;
  startsAt: string;
  confirmedAt: string;
  email: string;
};

export type MailOutcome = "sent" | "failed" | "skipped";

function oneLine(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function seoulWhen(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

async function siteOrigin() {
  try {
    const origin = resolveTrustedOrigin(await headers());
    if (origin) return origin;
  } catch {
    // 요청 주소를 못 읽으면 운영 도메인의 예약 조회 링크를 쓴다.
  }
  return productionOrigin;
}

// 같은 서버 프로세스에서 같은 확정 시각은 한 번만 보낸다.
// 예약 상태가 이미 확정이면 서버 액션이 다시 호출하지 않는다.
// 발송 성공·실패를 남겨 관리자 화면에 보이는 기록은 다음 단계에서 둔다.
export async function notifyReservationConfirmed(
  notice: ReservationConfirmation,
): Promise<MailOutcome> {
  try {
    const email = notice.email.trim().toLowerCase();
    const reservationNo = oneLine(notice.reservationNo);
    const productName = oneLine(notice.productName);
    const confirmedAt = notice.confirmedAt.trim();
    const when = seoulWhen(notice.startsAt);
    if (
      !notice.id ||
      !reservationNo ||
      !productName ||
      !confirmedAt ||
      !when ||
      !isValidEmail(email)
    )
      return "failed";
    const origin = await siteOrigin();
    const content = reservationConfirmedContent({
      reservationNo,
      counselorName: readCounselorName(notice.counselors),
      productName,
      when,
      lookupUrl: new URL("/booking/lookup", origin).href,
      phone: siteConfig.phone,
    });
    return await deliverOnce(
      `${notice.id}:${confirmedAt}`,
      deliveries,
      async () => {
        const result = await sendResendMail({
          to: email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
        return result.ok;
      },
    );
  } catch {
    return "failed";
  }
}
