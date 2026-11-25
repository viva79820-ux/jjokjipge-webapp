"use server";
import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  classifyStorageInfo,
  cleanupAction,
  confirmUploadAction,
  removeUnreferenced,
} from "./cleanup";
import {
  bucket,
  columns,
  contentMatches,
  contentPatch,
  contentRecord,
  sameContent,
  scalar,
  thumbnailPath,
  uuid,
  type ContentRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: ContentRecord;
  errors?: Record<string, string>;
  cleanup?: () => Promise<boolean>;
  recovery?: (expected?: FormData) => Promise<boolean>;
  missing?: boolean;
  deleted?: boolean;
  unchanged?: boolean;
};

const denied: Result = {
  state: "rejected",
  message: "관리자 권한이 필요합니다.",
};
const unknown: Result = {
  state: "unknown",
  message: "결과를 확인하지 못했습니다. 저장 결과를 다시 확인해 주세요.",
};
const forbidden: Result = {
  state: "rejected",
  message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
};
const missingResult: Result = {
  state: "rejected",
  message: "콘텐츠가 없습니다.",
  missing: true,
};
const conflictMessage =
  "다른 작업으로 콘텐츠가 변경됐습니다. 최신 내용을 확인해 주세요.";
const createConflict =
  "이미 다른 내용으로 저장된 콘텐츠입니다. 최신 내용을 확인해 주세요.";
const rejectedCodes = ["23514", "23502", "42501", "22P02", "22003"];

function invalidate(id: string) {
  revalidatePath("/contents");
  revalidatePath("/admin/contents");
  revalidatePath(`/admin/contents/${id}`);
}

function writeError(code?: string): Result | null {
  if (!code) return null;
  if (rejectedCodes.includes(code)) return forbidden;
  if (code === "PGRST116")
    return { state: "conflict", message: conflictMessage };
  return null;
}

async function readRow(
  db: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  return db.from("contents").select(columns).eq("id", id).maybeSingle();
}

async function explainMiss(
  db: Awaited<ReturnType<typeof createClient>>,
  id: string,
  version: string,
): Promise<Result> {
  const again = await readRow(db, id);
  if (again.error) return writeError(again.error.code) || unknown;
  if (!again.data) return missingResult;
  if (again.data.updated_at !== version)
    return { state: "conflict", message: conflictMessage };
  return forbidden;
}

function savedRow(
  row: ContentRecord,
  message = "콘텐츠를 저장했습니다.",
  userId?: string,
  deleted = false,
  cleanup?: () => Promise<boolean>,
): Result {
  invalidate(row.id);
  return {
    state: "saved",
    message,
    row,
    deleted,
    cleanup,
    recovery:
      userId && row.thumbnail_path
        ? cleanupAction(row.thumbnail_path, userId, undefined, row)
        : undefined,
  };
}

function asContent(row: unknown) {
  if (!row || typeof row !== "object") return null;
  return contentRecord(row);
}

function duplicateField(form: FormData) {
  const seen = new Set<string>();
  for (const key of form.keys()) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export async function prepareContentUpload(ext: string) {
  const admin = await requireAdmin();
  if (!admin || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const path = `contents/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  return {
    path,
    cleanup: cleanupAction(path, admin.userId),
    confirm: confirmUploadAction(path, admin.userId),
  };
}

export async function confirmContentDeletion(
  id: string,
  version: string,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id) || !version || !versionValid(version))
    return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const read = await readRow(await createClient(), id);
    if (read.error) return unknown;
    if (!read.data) {
      invalidate(id);
      return {
        state: "saved",
        deleted: true,
        message: "콘텐츠가 없는 것을 확인했습니다.",
      };
    }
    const row = read.data as ContentRecord;
    if (row.updated_at !== version)
      return { state: "conflict", message: conflictMessage };
    return {
      state: "rejected",
      unchanged: true,
      message: "삭제가 반영되지 않았습니다. 콘텐츠는 그대로입니다.",
    };
  } catch {
    return unknown;
  }
}

export async function reloadContent(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id)) return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const read = await readRow(await createClient(), id);
    if (read.error) return writeError(read.error.code) || unknown;
    if (!read.data) return missingResult;
    const row = asContent(read.data);
    if (!row) return unknown;
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row,
      recovery: row.thumbnail_path
        ? cleanupAction(row.thumbnail_path, admin.userId, undefined, row)
        : undefined,
    };
  } catch {
    return unknown;
  }
}

export async function saveContent(form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData) || duplicateField(form))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  const id = scalar(form, "id");
  const version = scalar(form, "version");
  const mode = scalar(form, "mode");
  if (
    !uuid(id) ||
    (mode !== "create" && mode !== "update" && mode !== "delete") ||
    (mode !== "create" && (!version || !versionValid(version)))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const parsed = mode === "delete" ? null : contentPatch(form);
  if (parsed && !parsed.patch)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  const patch = parsed?.patch ?? null;
  try {
    const db = await createClient();
    const read = await readRow(db, id);
    if (read.error) return writeError(read.error.code) || unknown;
    const current = asContent(read.data);
    if (read.data && !current) return unknown;
    if (mode === "create" && current) {
      if (sameContent(current, patch!))
        return savedRow(current, "콘텐츠를 저장했습니다.", admin.userId);
      return { state: "conflict", message: createConflict, row: current };
    }
    if (mode !== "create" && !current) return missingResult;
    if (mode !== "create" && current!.updated_at !== version)
      return { state: "conflict", message: conflictMessage, row: current! };
    const path = patch?.thumbnail_path || null;
    if (path && path !== current?.thumbnail_path) {
      const refs = await db
        .from("contents")
        .select("id", { count: "exact", head: true })
        .eq("thumbnail_path", path);
      if (refs.error || refs.count === null) return unknown;
      if (refs.count !== 0)
        return {
          state: "rejected",
          message: "다른 콘텐츠의 썸네일 경로를 사용할 수 없습니다.",
        };
      let looked: ReturnType<typeof classifyStorageInfo>;
      try {
        looked = classifyStorageInfo(
          await db.storage.from(bucket).info(path),
          path,
        );
      } catch {
        return unknown;
      }
      if (looked === "missing")
        return {
          state: "rejected",
          message:
            "업로드한 썸네일을 찾지 못했습니다. 콘텐츠 정보는 바꾸지 않았습니다.",
        };
      if (looked === "rejected")
        return {
          state: "rejected",
          message: "업로드 썸네일의 크기·형식을 확인하지 못했습니다.",
        };
      if (looked !== "present") return unknown;
    }
    const payload = patch
      ? {
          title: patch.title,
          description: patch.description,
          channel: patch.channel,
          external_url: patch.external_url,
          thumbnail_path: patch.thumbnail_path,
          thumbnail_alt: patch.thumbnail_alt,
          posted_on: patch.posted_on,
          is_published: patch.is_published,
          sort_order: patch.sort_order,
        }
      : null;
    const query =
      mode === "delete"
        ? db.from("contents").delete().eq("id", id).eq("updated_at", version!)
        : mode === "create"
          ? db.from("contents").insert({ id, ...payload! })
          : db
              .from("contents")
              .update(payload!)
              .eq("id", id)
              .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error?.code === "23505" && mode === "create") {
      const again = await readRow(db, id);
      if (again.error) return unknown;
      const existing = asContent(again.data);
      if (again.data && !existing) return unknown;
      if (existing && sameContent(existing, patch!))
        return savedRow(existing, "콘텐츠를 저장했습니다.", admin.userId);
      if (existing)
        return { state: "conflict", message: createConflict, row: existing };
      return unknown;
    }
    if (result.error) return writeError(result.error.code) || unknown;
    const saved = asContent(result.data);
    if (result.data && !saved) return unknown;
    if (!saved) return explainMiss(db, id, version || "");
    if (mode !== "delete" && !sameContent(saved, patch!)) return unknown;
    const previous = current?.thumbnail_path;
    let cleanup: (() => Promise<boolean>) | undefined;
    if (
      previous &&
      thumbnailPath(previous) &&
      (mode === "delete" || previous !== saved.thumbnail_path)
    ) {
      cleanup = cleanupAction(previous, admin.userId);
      try {
        if (await removeUnreferenced(db, previous)) cleanup = undefined;
      } catch {
        /* 콘텐츠 저장은 유지하고 썸네일 정리만 다시 시도할 수 있게 둔다. */
      }
    }
    return savedRow(
      saved,
      mode === "delete" ? "콘텐츠를 삭제했습니다." : "콘텐츠를 저장했습니다.",
      admin.userId,
      mode === "delete",
      cleanup,
    );
  } catch {
    return unknown;
  }
}

export async function confirmContent(
  id: string,
  form: FormData,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id) || !(form instanceof FormData) || duplicateField(form))
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const formId = scalar(form, "id");
  const mode = scalar(form, "mode");
  const version = scalar(form, "version");
  if (
    formId !== id ||
    (mode !== "create" && mode !== "update" && mode !== "delete") ||
    (mode === "create" ? version !== "" : !version || !versionValid(version))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const read = await readRow(await createClient(), id);
    if (read.error) return unknown;
    const row = asContent(read.data);
    if (read.data && !row) return unknown;
    if (mode === "delete") {
      if (!row) {
        invalidate(id);
        return {
          state: "saved",
          message: "콘텐츠가 없는 것을 확인했습니다.",
          deleted: true,
        };
      }
      const recovery = row.thumbnail_path
        ? cleanupAction(row.thumbnail_path, admin.userId, undefined, row)
        : undefined;
      if (row.updated_at === version)
        return {
          state: "rejected",
          message:
            "삭제는 반영되지 않았습니다. 콘텐츠는 그대로 있습니다. 다시 삭제할 수 있습니다.",
          unchanged: true,
          row,
          recovery,
        };
      return {
        state: "conflict",
        message: conflictMessage,
        row,
        recovery,
      };
    }
    if (!row)
      return mode === "create"
        ? {
            state: "rejected",
            missing: true,
            message:
              "저장은 반영되지 않았습니다. 입력은 유지됩니다. 다시 저장할 수 있습니다.",
          }
        : {
            state: "rejected",
            missing: true,
            message:
              "콘텐츠가 없습니다. 과거 저장 요청이 성공했는지는 알 수 없습니다.",
          };
    const recovery = row.thumbnail_path
      ? cleanupAction(row.thumbnail_path, admin.userId, undefined, row)
      : undefined;
    if (mode === "create") {
      if (!contentMatches(row, form))
        return {
          state: "conflict",
          message: createConflict,
          row,
          recovery,
        };
      return savedRow(row, "콘텐츠를 저장했습니다.", admin.userId);
    }
    if (row.updated_at === version)
      return {
        state: "rejected",
        message:
          "저장은 반영되지 않았습니다. 콘텐츠는 수정 전 버전 그대로입니다. 다시 저장할 수 있습니다.",
        unchanged: true,
        row,
        recovery,
      };
    if (!contentMatches(row, form))
      return {
        state: "conflict",
        message:
          "현재 콘텐츠는 이 요청과 다른 내용입니다. 과거 저장 요청이 성공했는지는 알 수 없습니다. 최신 내용을 확인해 주세요.",
        row,
        recovery,
      };
    return savedRow(row, "저장 결과를 확인했습니다.", admin.userId);
  } catch {
    return unknown;
  }
}
