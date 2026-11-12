"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  columns,
  parseProduct,
  sameProduct,
  scalar,
  uuid,
  type ProductRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: ProductRecord;
  errors?: Record<string, string>;
  missing?: boolean;
  resetAttempt?: boolean;
};

const denied: Result = {
  state: "rejected",
  message: "관리자 권한이 필요합니다.",
};
const unknown: Result = {
  state: "unknown",
  message: "결과를 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
};
const conflict: Result = {
  state: "conflict",
  message: "다른 작업으로 상담 상품이 변경됐습니다. 최신 내용을 확인해 주세요.",
};
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const rejectedCodes = ["23514", "23502", "42501", "23503", "22P02", "22003"];

function customerPaths(slug: string) {
  if (!slug || slug.length > 100 || !slugPattern.test(slug)) return [];
  return [`/consult/${slug}`, `/consult/${slug}/book`];
}

function invalidate(slug: string, counselorId: string, productId: string) {
  for (const path of [
    "/admin/counselors",
    `/admin/counselors/${counselorId}`,
    `/admin/counselors/${counselorId}/products`,
    `/admin/counselors/${counselorId}/products/${productId}`,
    "/",
    "/consult",
    ...customerPaths(slug),
  ])
    revalidatePath(path);
}

function rejectedWrite(code?: string): Result | null {
  if (!code) return null;
  if (rejectedCodes.includes(code))
    return {
      state: "rejected",
      message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
    };
  if (code === "PGRST116") return conflict;
  return null;
}

export async function reloadProduct(
  counselorId: string,
  productId: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(counselorId) || !uuid(productId))
    return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const db = await createClient();
    const counselor = await db
      .from("counselors")
      .select("id")
      .eq("id", counselorId)
      .maybeSingle();
    if (counselor.error) return unknown;
    if (!counselor.data)
      return {
        state: "rejected",
        message: "상담사가 없습니다.",
        missing: true,
      };
    const product = await db
      .from("consult_products")
      .select(columns)
      .eq("id", productId)
      .maybeSingle();
    if (product.error) return unknown;
    if (!product.data || product.data.counselor_id !== counselorId)
      return {
        state: "rejected",
        message: "상담 상품이 없습니다.",
        missing: true,
      };
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row: product.data as ProductRecord,
    };
  } catch {
    return unknown;
  }
}

export async function saveProduct(form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  const counselorId = scalar(form, "counselor_id");
  const id = scalar(form, "id");
  const version = scalar(form, "version");
  const mode = scalar(form, "mode");
  if (
    !uuid(counselorId) ||
    !uuid(id) ||
    (mode !== "create" && mode !== "update") ||
    (mode === "update" && (!version || !versionValid(version)))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const parsed = parseProduct(form);
  if (Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  const db = await createClient();
  try {
    const counselor = await db
      .from("counselors")
      .select("id,slug")
      .eq("id", counselorId)
      .maybeSingle();
    if (counselor.error) return unknown;
    if (!counselor.data)
      return {
        state: "rejected",
        message: "상담사가 없습니다.",
        missing: true,
      };
    const read = await db
      .from("consult_products")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (read.error) return unknown;
    const current = read.data as ProductRecord | null;
    const savedCounselorId = counselor.data.id;
    if (mode === "create" && current) {
      if (sameProduct(current, savedCounselorId, parsed.patch)) {
        invalidate(counselor.data.slug, savedCounselorId, current.id);
        return {
          state: "saved",
          message: "상담 상품을 저장했습니다.",
          row: current,
        };
      }
      if (current.counselor_id !== savedCounselorId)
        return {
          state: "rejected",
          message:
            "이미 사용 중인 상품 번호입니다. 새 등록으로 다시 시도해 주세요.",
          resetAttempt: true,
        };
      return {
        state: "conflict",
        message:
          "이미 다른 내용으로 저장된 상품입니다. 최신 내용을 확인해 주세요.",
        row: current,
      };
    }
    if (mode === "update" && !current)
      return {
        state: "rejected",
        message: "상담 상품이 없습니다.",
        missing: true,
      };
    if (mode === "update" && current?.counselor_id !== savedCounselorId)
      return { state: "rejected", message: "이 상담사의 상품이 아닙니다." };
    if (mode === "update" && current?.updated_at !== version) return conflict;
    const payload = {
      name: parsed.patch.name,
      minutes: parsed.patch.minutes,
      price: parsed.patch.price,
      sort_order: parsed.patch.sort_order,
      is_active: parsed.patch.is_active,
    };
    const query =
      mode === "create"
        ? db.from("consult_products").insert({
            id,
            counselor_id: savedCounselorId,
            ...payload,
          })
        : db
            .from("consult_products")
            .update(payload)
            .eq("id", id)
            .eq("counselor_id", savedCounselorId)
            .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error?.code === "23505") {
      const again = await db
        .from("consult_products")
        .select(columns)
        .eq("id", id)
        .maybeSingle();
      if (again.error) return unknown;
      const existing = again.data as ProductRecord | null;
      if (existing && sameProduct(existing, savedCounselorId, parsed.patch)) {
        invalidate(counselor.data.slug, savedCounselorId, existing.id);
        return {
          state: "saved",
          message: "상담 상품을 저장했습니다.",
          row: existing,
        };
      }
      if (existing && existing.counselor_id === savedCounselorId)
        return {
          state: "conflict",
          message:
            "이미 다른 내용으로 저장된 상품입니다. 최신 내용을 확인해 주세요.",
          row: existing,
        };
      return {
        state: "rejected",
        message:
          "이미 사용 중인 상품 번호입니다. 새 등록으로 다시 시도해 주세요.",
        resetAttempt: true,
      };
    }
    const rejected = rejectedWrite(result.error?.code);
    if (result.error) return rejected || unknown;
    if (!result.data) return conflict;
    const saved = result.data as ProductRecord;
    invalidate(counselor.data.slug, savedCounselorId, saved.id);
    return {
      state: "saved",
      message: "상담 상품을 저장했습니다.",
      row: saved,
    };
  } catch {
    return unknown;
  }
}
