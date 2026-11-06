"use server";
import "server-only";
import { requireAdmin } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  scalar,
  uuid,
  versionValid,
  parseFaq,
  answerError,
  conflict,
} from "./support-rules";
import {
  faqColumns,
  inquiryColumns,
  getFaqDetail,
  getInquiryDetail,
} from "./support-data";
import type { FaqRow, InquiryDetail, SupportResult } from "./support-types";
const denied = { success: false, message: "관리자 권한이 필요합니다." };
const bad = { success: false, message: "요청 내용을 다시 확인해 주세요." };
const failed = {
  success: false,
  message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export async function reloadFaq(id: string): Promise<SupportResult<FaqRow>> {
  if (!(await requireAdmin())) return denied;
  try {
    const row = await getFaqDetail(id);
    return row
      ? { success: true, message: "최신 내용을 불러왔습니다.", row }
      : { success: false, message: "FAQ를 찾을 수 없습니다." };
  } catch {
    return failed;
  }
}
export async function reloadInquiry(
  id: string,
): Promise<SupportResult<InquiryDetail>> {
  if (!(await requireAdmin())) return denied;
  try {
    const row = await getInquiryDetail(id);
    return row
      ? { success: true, message: "최신 내용을 불러왔습니다.", row }
      : { success: false, message: "문의를 찾을 수 없습니다." };
  } catch {
    return failed;
  }
}
export async function saveFaq(form: FormData): Promise<SupportResult<FaqRow>> {
  if (!(await requireAdmin())) return denied;
  if (!(form instanceof FormData)) return bad;
  const mode = scalar(form, "mode");
  const id = scalar(form, "id"),
    version = scalar(form, "version");
  if (
    (mode !== "create" && mode !== "update") ||
    (mode === "update" &&
      (!id || !uuid(id) || !version || !versionValid(version)))
  )
    return bad;
  const { errors, patch } = parseFaq(form);
  if (Object.keys(errors).length) return { ...bad, errors };
  let saved: FaqRow;
  try {
    const db = await createClient();
    if (mode === "update") {
      const current = await db
        .from("faqs")
        .select("id,updated_at")
        .eq("id", id!)
        .maybeSingle();
      if (current.error) return failed;
      if (!current.data)
        return { success: false, message: "FAQ를 찾을 수 없습니다." };
      if (current.data.updated_at !== version)
        return { success: false, conflict: true, message: conflict.faqs };
    }
    const query =
      mode === "create"
        ? db.from("faqs").insert(patch)
        : db
            .from("faqs")
            .update(patch)
            .eq("id", id!)
            .eq("updated_at", version!);
    const result = await query.select(faqColumns).returns<FaqRow[]>();
    if (result.error) return failed;
    if (!result.data?.length)
      return { success: false, conflict: true, message: conflict.faqs };
    saved = result.data[0];
  } catch {
    return failed;
  }
  revalidatePath("/admin/support/faqs");
  revalidatePath(`/admin/support/faqs/${saved.id}`);
  revalidatePath("/support");
  return { success: true, message: "FAQ를 저장했습니다.", row: saved };
}
export async function deleteFaq(
  form: FormData,
): Promise<SupportResult<FaqRow>> {
  if (!(await requireAdmin())) return denied;
  if (!(form instanceof FormData)) return bad;
  const id = scalar(form, "id"),
    version = scalar(form, "version");
  if (!id || !uuid(id) || !version || !versionValid(version)) return bad;
  try {
    const db = await createClient();
    const current = await db
      .from("faqs")
      .select("id,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (current.error) return failed;
    if (!current.data)
      return { success: false, message: "FAQ를 찾을 수 없습니다." };
    if (current.data.updated_at !== version)
      return { success: false, conflict: true, message: conflict.faqs };
    const result = await db
      .from("faqs")
      .delete()
      .eq("id", id)
      .eq("updated_at", version)
      .select("id");
    if (result.error) return failed;
    if (!result.data?.length)
      return { success: false, conflict: true, message: conflict.faqs };
  } catch {
    return failed;
  }
  revalidatePath("/admin/support/faqs");
  revalidatePath(`/admin/support/faqs/${id}`);
  revalidatePath("/support");
  return { success: true, deleted: true, message: "FAQ를 삭제했습니다." };
}
export async function saveInquiryAnswer(
  form: FormData,
): Promise<SupportResult<InquiryDetail>> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData)) return bad;
  const id = scalar(form, "id"),
    version = scalar(form, "version"),
    answer = scalar(form, "answer");
  if (!id || !uuid(id) || !version || !versionValid(version)) return bad;
  if (answer === null || answerError(answer))
    return {
      ...bad,
      errors: {
        answer: answer === null ? "답변을 입력해 주세요." : answerError(answer),
      },
    };
  let saved: InquiryDetail;
  try {
    const db = await createClient();
    const current = await db
      .from("inquiries")
      .select("status,answer,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (current.error) return failed;
    if (!current.data)
      return { success: false, message: "문의를 찾을 수 없습니다." };
    if (current.data.updated_at !== version)
      return { success: false, conflict: true, message: conflict.inquiries };
    if (
      current.data.status === "answered" &&
      current.data.answer === answer.trim()
    )
      return { success: false, message: "변경된 내용이 없습니다." };
    if (!["pending", "answered"].includes(current.data.status)) return bad;
    const result = await db
      .from("inquiries")
      .update({
        status: "answered",
        answer: answer.trim(),
        answered_at: new Date().toISOString(),
        answered_by: admin.userId,
      })
      .eq("id", id)
      .eq("updated_at", version)
      .eq("status", current.data.status)
      .select(inquiryColumns)
      .returns<InquiryDetail[]>();
    if (result.error) return failed;
    if (!result.data?.length)
      return { success: false, conflict: true, message: conflict.inquiries };
    saved = result.data[0];
  } catch {
    return failed;
  }
  revalidatePath("/admin/support/inquiries");
  revalidatePath(`/admin/support/inquiries/${id}`);
  revalidatePath("/admin");
  return { success: true, message: "답변을 저장했습니다.", row: saved };
}
