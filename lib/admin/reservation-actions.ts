"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { notifyReservationConfirmed } from "@/lib/email/notify-reservation";
import type { CounselorRelation } from "@/lib/email/reservation-confirmed-message";
import { createClient } from "@/lib/supabase/server";
import {
  conflictMessage,
  isUuid,
  transitionPatch,
  type TransitionRow,
} from "./reservation-rules";

type ConfirmationSource = TransitionRow & {
  updated_at: string;
  reservation_no: string;
  product_name: string;
  customer_email: string;
  counselors: CounselorRelation;
};

export type ActionResult = { success: boolean; message: string };
export async function changeReservation(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (!(await requireAdmin()))
    return { success: false, message: "관리자 권한이 필요합니다." };
  const id = form.get("id"),
    action = form.get("action"),
    version = form.get("version"),
    reason = form.get("reason");
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    typeof action !== "string" ||
    !["confirm", "complete", "cancel"].includes(action) ||
    typeof version !== "string" ||
    version.length > 50 ||
    !Number.isFinite(Date.parse(version)) ||
    (reason !== null && typeof reason !== "string")
  )
    return { success: false, message: "요청 내용을 다시 확인해 주세요." };
  let result: ActionResult;
  let confirmation: {
    id: string;
    reservationNo: string;
    counselors: CounselorRelation;
    productName: string;
    startsAt: string;
    confirmedAt: string;
    email: string;
  } | null = null;
  try {
    const db = await createClient();
    const { data: row, error } = await db
      .from("reservations")
      .select(
        "status,payment_method,starts_at,ends_at,updated_at,reservation_no,product_name,customer_email,counselors(name)",
      )
      .eq("id", id)
      .returns<ConfirmationSource[]>()
      .maybeSingle();
    if (error)
      return {
        success: false,
        message: "예약을 확인하지 못했습니다. 다시 시도해 주세요.",
      };
    if (!row) return { success: false, message: "예약을 찾을 수 없습니다." };
    if (row.updated_at !== version)
      return { success: false, message: conflictMessage };
    const change = transitionPatch(
      row,
      action,
      typeof reason === "string" ? reason : "",
      new Date(),
    );
    if (!change.patch) return { success: false, message: change.error };
    const { data, error: updateError } = await db
      .from("reservations")
      .update(change.patch)
      .eq("id", id)
      .eq("status", row.status)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError)
      return {
        success: false,
        message: "예약 상태를 변경하지 못했습니다. 다시 확인해 주세요.",
      };
    if (!data?.length) return { success: false, message: conflictMessage };
    result = { success: true, message: "예약 상태를 변경했습니다." };
    if (
      action === "confirm" &&
      "confirmed_at" in change.patch &&
      typeof change.patch.confirmed_at === "string"
    )
      confirmation = {
        id,
        reservationNo: row.reservation_no,
        counselors: row.counselors,
        productName: row.product_name,
        startsAt: row.starts_at,
        confirmedAt: change.patch.confirmed_at,
        email: row.customer_email,
      };
  } catch {
    return {
      success: false,
      message:
        "처리 중 연결 오류가 발생했습니다. 새로고침하여 예약 상태를 확인해 주세요.",
    };
  }
  if (confirmation) {
    let outcome: "sent" | "failed" | "skipped" = "failed";
    try {
      outcome = await notifyReservationConfirmed(confirmation);
    } catch {
      outcome = "failed";
    }
    if (outcome === "sent")
      result = {
        success: true,
        message: "예약 상태를 변경했습니다. 확정 메일을 보냈습니다.",
      };
    else if (outcome === "failed")
      result = {
        success: true,
        message: "예약 상태를 변경했습니다. 확정 메일은 보내지 못했습니다.",
      };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  return result;
}
