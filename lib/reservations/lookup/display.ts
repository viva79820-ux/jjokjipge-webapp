import type { PaymentMethod, ReservationStatus } from "./types";

export const statusLabels = {
  pending_payment: "입금 대기",
  confirmed: "예약 확정",
  completed: "상담 완료",
  cancelled: "예약 취소",
} satisfies Record<ReservationStatus, string>;
export const paymentLabels = {
  bank_transfer: "무통장입금",
  card: "카드결제",
} satisfies Record<PaymentMethod, string>;
const seoulDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});
const seoulTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function formatSeoulDate(iso: string) {
  return seoulDate.format(new Date(iso));
}
export function formatSeoulTime(iso: string) {
  return seoulTime.format(new Date(iso));
}
export function formatSchedule(startsAt: string, endsAt: string) {
  const startDate = formatSeoulDate(startsAt);
  const endDate = formatSeoulDate(endsAt);
  return {
    date: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
    startTime: formatSeoulTime(startsAt),
    endTime: formatSeoulTime(endsAt),
  };
}
