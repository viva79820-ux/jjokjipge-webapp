import { bookingConfig } from "@/lib/booking-config";
import { siteConfig } from "@/lib/site-config";

export const honeypotField = "companyWebsite";
export const openedAtField = "openedAt";

export function phoneKey(phone: string) {
  return phone.replace(/-/g, "");
}

export function emailKey(email: string) {
  return email.toLowerCase();
}

export function samePendingContact(
  row: { customer_phone?: unknown; customer_email?: unknown },
  phone: string,
  email: string,
) {
  const rowPhone =
    typeof row.customer_phone === "string" ? phoneKey(row.customer_phone) : "";
  const rowEmail =
    typeof row.customer_email === "string" ? emailKey(row.customer_email) : "";
  const phoneMatches = rowPhone !== "" && rowPhone === phoneKey(phone);
  const emailMatches = rowEmail !== "" && rowEmail === emailKey(email);
  return phoneMatches || emailMatches;
}

export function pendingWindowStart(now: number) {
  return new Date(
    now - bookingConfig.depositHours * 60 * 60 * 1000,
  ).toISOString();
}

export function pendingLimitMessage() {
  return `입금 대기 중인 예약이 ${bookingConfig.maxPendingPerContact}건 있어요. 입금하거나 기존 예약을 정리한 뒤 다시 예약해 주세요. 문의 ${siteConfig.phone}`;
}

export function isHoneypotTripped(form: FormData) {
  const value = form.get(honeypotField);
  if (typeof value !== "string") return value != null;
  return value.trim() !== "";
}

export function isSubmitTooFast(form: FormData, now: number) {
  const raw = form.get(openedAtField);
  if (typeof raw !== "string" || !/^\d{1,16}$/.test(raw)) return true;
  const opened = Number(raw);
  if (!Number.isSafeInteger(opened)) return true;
  return now - opened < bookingConfig.minSubmitSeconds * 1000;
}
