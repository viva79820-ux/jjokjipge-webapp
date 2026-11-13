"use server";

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupFailure, lookupMismatch, validateLookup } from "./validation";
import type {
  LookupResult,
  LookupState,
  PaymentMethod,
  ReservationStatus,
} from "./types";

const lookupColumns =
  "reservation_no,status,product_name,minutes,price,starts_at,ends_at,payment_method,cancel_reason,counselors(name)";

function hasBlockedControl(value: string) {
  return /[\u0000-\u0008\u000E-\u001F\u007F]/.test(value);
}
function isPublicText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !hasBlockedControl(value)
  );
}
function isStatus(value: unknown): value is ReservationStatus {
  return (
    value === "pending_payment" ||
    value === "confirmed" ||
    value === "completed" ||
    value === "cancelled"
  );
}
function isPayment(value: unknown): value is PaymentMethod {
  return value === "bank_transfer" || value === "card";
}
function isInteger(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
function counselorName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as { name?: unknown }).name;
  return isPublicText(name, 2000) ? name.trim() : null;
}
function publicReason(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    hasBlockedControl(value)
  )
    return null;
  const trimmed = value.trim();
  return trimmed || undefined;
}
function toPublicResult(
  row: unknown,
  reservationNo: string,
): LookupResult | null {
  if (!row || typeof row !== "object") return null;
  const data = row as Record<string, unknown>;
  if (data.reservation_no !== reservationNo || !isStatus(data.status))
    return null;
  const name = counselorName(data.counselors);
  if (!name || !isPublicText(data.product_name, 2000)) return null;
  if (
    !isInteger(data.minutes, 1, 2147483647) ||
    !isInteger(data.price, 0, 2147483647)
  )
    return null;
  if (typeof data.starts_at !== "string" || typeof data.ends_at !== "string")
    return null;
  const start = Date.parse(data.starts_at);
  const end = Date.parse(data.ends_at);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end - start !== data.minutes * 60000
  )
    return null;
  if (!isPayment(data.payment_method)) return null;
  const result: LookupResult = {
    reservationNo,
    status: data.status,
    counselorName: name,
    productName: data.product_name.trim(),
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    minutes: data.minutes,
    price: data.price,
    paymentMethod: data.payment_method,
  };
  if (data.status !== "cancelled") return result;
  const reason = publicReason(data.cancel_reason);
  if (reason === null) return null;
  if (reason) result.cancelReason = reason;
  return result;
}

export async function lookupReservation(form: FormData): Promise<LookupState> {
  if (!(form instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateLookup(form);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    // 상담사 이름은 예약 행과 함께 읽는다. 공개 상담사 조회로 거르면 비공개 상담사의 과거 예약이 빠진다.
    const { data, error } = await createAdminClient()
      .from("reservations")
      .select(lookupColumns)
      .eq("reservation_no", values.reservationNo)
      .eq("customer_email", values.email)
      .maybeSingle();
    if (error) return { message: lookupFailure };
    if (!data) return { message: lookupMismatch };
    const result = toPublicResult(data, values.reservationNo);
    if (!result) return { message: lookupFailure };
    return { result };
  } catch {
    // 원문 DB 오류, 입력값, 인증 정보는 응답하거나 기록하지 않는다.
    return { message: lookupFailure };
  }
}
