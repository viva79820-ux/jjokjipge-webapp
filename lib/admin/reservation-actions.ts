"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { createClient } from "@/lib/supabase/server";
import {
  conflictMessage,
  isUuid,
  transitionPatch,
  type TransitionRow,
} from "./reservation-rules";

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
  try {
    const db = await createClient();
    const { data: row, error } = await db
      .from("reservations")
      .select("status,payment_method,starts_at,ends_at,updated_at")
      .eq("id", id)
      .returns<(TransitionRow & { updated_at: string })[]>()
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
  } catch {
    return {
      success: false,
      message:
        "처리 중 연결 오류가 발생했습니다. 새로고침하여 예약 상태를 확인해 주세요.",
    };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${id}`);
  return result;
}
