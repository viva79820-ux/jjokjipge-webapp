"use server";
import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  columns,
  uuid,
  imagePath,
  parseNotice,
  scalar,
  bucket,
  maxBytes,
  type Notice,
} from "./rules";
import { versionValid } from "@/lib/admin/support-rules";
import { cleanupAction, removeUnreferenced } from "./cleanup";
export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: Notice;
  errors?: Record<string, string>;
  cleanup?: () => Promise<boolean>;
  deleted?: boolean;
  missing?: boolean;
  recovery?: (expected: FormData) => Promise<boolean>;
};
const denied: Result = {
  state: "rejected",
  message: "관리자 권한이 필요합니다.",
};
const unknown: Result = {
  state: "unknown",
  message: "결과를 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
};
function invalidate(id: string) {
  for (const path of [
    "/admin/notices",
    `/admin/notices/${id}`,
    "/notices",
    `/notices/${id}`,
  ])
    revalidatePath(path);
}
export async function prepareNoticeUpload(ext: string) {
  const admin = await requireAdmin();
  if (!admin || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const path = `notices/${randomUUID()}.${ext}`;
  return { path, cleanup: cleanupAction(path, admin.userId) };
}
export async function reloadNotice(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id)) return denied;
  try {
    const { data, error } = await (
      await createClient()
    )
      .from("notices")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    return error
      ? unknown
      : data
        ? {
            state: "saved",
            message: "최신 내용을 불러왔습니다.",
            row: data,
            recovery: data.image_path
              ? cleanupAction(data.image_path, admin.userId, undefined, data)
              : undefined,
          }
        : { state: "rejected", message: "공지가 없습니다.", missing: true };
  } catch {
    return unknown;
  }
}
export async function saveNotice(form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  const id = scalar(form, "id"),
    version = scalar(form, "version"),
    mode = scalar(form, "mode");
  if (
    !uuid(id) ||
    !["create", "update", "delete"].includes(mode || "") ||
    (mode !== "create" && (!version || !versionValid(version)))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const parsed = mode === "delete" ? null : parseNotice(form);
  if (parsed && Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  const db = await createClient();
  let current: Notice | null = null;
  try {
    const read = await db
      .from("notices")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (read.error) return unknown;
    current = read.data;
    if (mode === "create" && current)
      return {
        state: "conflict",
        message: "이미 저장된 초안입니다. 저장 결과를 확인해 주세요.",
        row: current,
      };
    if (mode !== "create" && (!current || current.updated_at !== version))
      return {
        state: "conflict",
        message:
          "다른 작업으로 공지가 변경됐습니다. 최신 내용을 확인해 주세요.",
      };
    const path = parsed?.patch.image_path;
    if (path && path !== current?.image_path) {
      const refs = await db
        .from("notices")
        .select("id", { count: "exact", head: true })
        .eq("image_path", path);
      if (refs.error) return unknown;
      if (refs.count !== 0)
        return {
          state: "rejected",
          message: "다른 공지의 이미지 경로를 사용할 수 없습니다.",
        };
      const info = await db.storage.from(bucket).info(path);
      if (
        info.error ||
        !info.data ||
        typeof info.data.size !== "number" ||
        !Number.isInteger(info.data.size) ||
        info.data.size! <= 0 ||
        info.data.size > maxBytes ||
        !["image/jpeg", "image/png", "image/webp"].includes(
          info.data.contentType || "",
        )
      )
        return {
          state: "rejected",
          message: "업로드 이미지의 크기·형식을 확인하지 못했습니다.",
        };
    }
    const query =
      mode === "delete"
        ? db.from("notices").delete().eq("id", id).eq("updated_at", version!)
        : mode === "create"
          ? db.from("notices").insert({
              id,
              ...parsed!.patch,
              published_at: parsed!.patch.is_published
                ? new Date().toISOString()
                : null,
            })
          : db
              .from("notices")
              .update({
                ...parsed!.patch,
                published_at:
                  current!.published_at ||
                  (parsed!.patch.is_published
                    ? new Date().toISOString()
                    : null),
              })
              .eq("id", id)
              .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    // 통신·DB 오류는 결과 불명으로 유지하고 파일을 삭제하지 않는다.
    if (result.error)
      return ["23514", "23502", "42501"].includes(result.error.code)
        ? {
            state: "rejected",
            message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
          }
        : unknown;
    if (!result.data)
      return {
        state: "conflict",
        message:
          "다른 작업으로 공지가 변경됐습니다. 최신 내용을 확인해 주세요.",
      };
    const old = current?.image_path;
    let cleanup: (() => Promise<boolean>) | undefined;
    if (old && imagePath(old) && (mode === "delete" || old !== path)) {
      cleanup = cleanupAction(old, admin.userId);
      try {
        if (await removeUnreferenced(db, old)) cleanup = undefined;
      } catch {
        /* DB 성공은 유지한다. */
      }
    }
    return {
      state: "saved",
      message:
        mode === "delete" ? "공지를 삭제했습니다." : "공지를 저장했습니다.",
      row: result.data,
      deleted: mode === "delete",
      cleanup,
    };
  } catch {
    return unknown;
  }
}
export async function refreshNotices(id: string) {
  if (!(await requireAdmin()) || !uuid(id)) return false;
  invalidate(id);
  return true;
}
