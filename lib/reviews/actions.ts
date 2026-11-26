"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "./rules";

export type ReviewVisibilityResult = {
  state: "idle" | "saved" | "rejected" | "conflict" | "unknown";
  message: string;
};

export async function changeReviewVisibility(
  _previous: ReviewVisibilityResult,
  form: FormData,
): Promise<ReviewVisibilityResult> {
  if (!(await requireAdmin()))
    return { state: "rejected", message: "관리자 권한이 필요합니다." };
  if (!(form instanceof FormData))
    return { state: "rejected", message: "요청을 확인해 주세요." };

  const id = form.get("id");
  const version = form.get("version");
  const published = form.get("is_published");
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    typeof version !== "string" ||
    version.length > 50 ||
    !Number.isFinite(Date.parse(version)) ||
    (published !== "true" && published !== "false") ||
    form.getAll("id").length !== 1 ||
    form.getAll("version").length !== 1 ||
    form.getAll("is_published").length !== 1
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };

  try {
    const { data, error } = await (
      await createClient()
    )
      .from("reviews")
      .update({ is_published: published === "true" })
      .eq("id", id)
      .eq("updated_at", version)
      .select("id")
      .maybeSingle();

    if (error)
      return error.code === "42501"
        ? { state: "rejected", message: "관리자 권한이 필요합니다." }
        : {
            state: "unknown",
            message:
              "변경 결과를 확인하지 못했습니다. 목록을 새로고침해 주세요.",
          };
    if (!data)
      return {
        state: "conflict",
        message: "다른 작업으로 후기가 변경됐습니다. 새로고침해 주세요.",
      };
  } catch {
    return {
      state: "unknown",
      message: "연결 오류가 발생했습니다. 목록을 새로고침해 주세요.",
    };
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return {
    state: "saved",
    message:
      published === "true" ? "후기를 공개했습니다." : "후기를 숨겼습니다.",
  };
}
