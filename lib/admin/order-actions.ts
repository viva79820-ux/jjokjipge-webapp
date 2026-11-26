"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import {
  isOrderUuid,
  orderConflictMessage,
  orderTransitionPatch,
  type OrderTransitionRow,
} from "./order-rules";

export type OrderActionResult = { success: boolean; message: string };

export async function changeOrder(
  _previous: OrderActionResult,
  form: FormData,
): Promise<OrderActionResult> {
  if (!(await requireAdmin()))
    return { success: false, message: "관리자 권한이 필요합니다." };
  if (!(form instanceof FormData))
    return { success: false, message: "요청 내용을 다시 확인해 주세요." };
  const id = form.get("id");
  const action = form.get("action");
  const version = form.get("version");
  const trackingNumber = form.get("trackingNumber");
  if (
    typeof id !== "string" ||
    !isOrderUuid(id) ||
    typeof action !== "string" ||
    !["confirm", "ship", "complete", "cancel"].includes(action) ||
    typeof version !== "string" ||
    version.length > 50 ||
    !Number.isFinite(Date.parse(version)) ||
    (trackingNumber !== null && typeof trackingNumber !== "string")
  )
    return { success: false, message: "요청 내용을 다시 확인해 주세요." };

  try {
    const db = await createClient();
    const { data: row, error } = await db
      .from("orders")
      .select("status,tracking_number,updated_at")
      .eq("id", id)
      .returns<(OrderTransitionRow & { updated_at: string })[]>()
      .maybeSingle();
    if (error)
      return {
        success: false,
        message: "주문을 확인하지 못했습니다. 다시 시도해 주세요.",
      };
    if (!row) return { success: false, message: "주문을 찾을 수 없습니다." };
    if (row.updated_at !== version)
      return { success: false, message: orderConflictMessage };
    const change = orderTransitionPatch(
      row,
      action,
      typeof trackingNumber === "string" ? trackingNumber : "",
    );
    if (!change.patch) return { success: false, message: change.error };
    const { data, error: updateError } = await db
      .from("orders")
      .update(change.patch)
      .eq("id", id)
      .eq("status", row.status)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError)
      return {
        success: false,
        message: "주문 상태를 변경하지 못했습니다. 다시 확인해 주세요.",
      };
    if (!data?.length) return { success: false, message: orderConflictMessage };
  } catch {
    return {
      success: false,
      message:
        "처리 중 연결 오류가 발생했습니다. 새로고침하여 주문 상태를 확인해 주세요.",
    };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/shop/order/lookup");
  return { success: true, message: "주문 상태를 변경했습니다." };
}
