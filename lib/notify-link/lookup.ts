import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { InquiryCategory, InquiryResult } from "@/lib/inquiries/types";
import {
  reservationLookupColumns,
  toPublicResult,
} from "@/lib/reservations/lookup/public-result";
import type { LookupResult } from "@/lib/reservations/lookup/types";
import { verifyNotifyToken } from "./token";

const inquiryColumns =
  "inquiry_no,category,created_at,status,reservation_no,content,answer,answered_at";

function isCategory(value: unknown): value is InquiryCategory {
  return (
    value === "reservation_payment" ||
    value === "cancellation_refund" ||
    value === "consultation" ||
    value === "shop" ||
    value === "other"
  );
}

function toInquiryResult(row: unknown): InquiryResult | null {
  if (!row || typeof row !== "object") return null;
  const data = row as Record<string, unknown>;
  if (typeof data.inquiry_no !== "string" || typeof data.content !== "string")
    return null;
  if (!isCategory(data.category)) return null;
  if (data.status !== "pending" && data.status !== "answered") return null;
  if (typeof data.created_at !== "string") return null;
  const reservationNo =
    data.reservation_no === null
      ? null
      : typeof data.reservation_no === "string"
        ? data.reservation_no
        : undefined;
  if (reservationNo === undefined) return null;
  const answered = data.status === "answered";
  let answer: string | null = null;
  let answeredAt: string | null = null;
  if (answered) {
    if (typeof data.answer !== "string" || typeof data.answered_at !== "string")
      return null;
    answer = data.answer;
    answeredAt = data.answered_at;
  }
  return {
    inquiryNo: data.inquiry_no,
    category: data.category,
    createdAt: data.created_at,
    status: data.status,
    reservationNo,
    content: data.content,
    answer,
    answeredAt,
  };
}

export async function readNotifyInquiry(
  token: string,
): Promise<InquiryResult | null> {
  const verified = verifyNotifyToken(token, "inquiry");
  if (!verified) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("inquiries")
      .select(inquiryColumns)
      .eq("id", verified.id)
      .maybeSingle();
    if (error || !data) return null;
    return toInquiryResult(data);
  } catch {
    return null;
  }
}

export async function readNotifyReservation(
  token: string,
): Promise<LookupResult | null> {
  const verified = verifyNotifyToken(token, "reservation");
  if (!verified) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("reservations")
      .select(reservationLookupColumns)
      .eq("id", verified.id)
      .maybeSingle();
    if (error || !data || typeof data !== "object") return null;
    const reservationNo = (data as { reservation_no?: unknown }).reservation_no;
    if (typeof reservationNo !== "string") return null;
    return toPublicResult(data, reservationNo);
  } catch {
    return null;
  }
}
