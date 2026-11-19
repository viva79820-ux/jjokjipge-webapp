"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  columns,
  contentPatch,
  sameContent,
  scalar,
  uuid,
  type ContentRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: ContentRecord;
  errors?: Record<string, string>;
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
): Result {
  invalidate(row.id);
  return { state: "saved", message, row };
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
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row: read.data as ContentRecord,
    };
  } catch {
    return unknown;
  }
}

export async function saveContent(form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData))
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
  try {
    const db = await createClient();
    const read = await readRow(db, id);
    if (read.error) return writeError(read.error.code) || unknown;
    const current = (read.data as ContentRecord | null) ?? null;
    if (mode === "create") {
      const patch = parsed!.patch!;
      if (current)
        return sameContent(current, patch)
          ? savedRow(current)
          : { state: "conflict", message: createConflict };
      const inserted = await db
        .from("contents")
        .insert({
          id,
          title: patch.title,
          description: patch.description,
          channel: patch.channel,
          external_url: patch.external_url,
          is_published: patch.is_published,
          sort_order: patch.sort_order,
        })
        .select(columns)
        .maybeSingle();
      if (inserted.error?.code === "23505") {
        const again = await readRow(db, id);
        if (again.error || !again.data) return unknown;
        const existing = again.data as ContentRecord;
        return sameContent(existing, patch)
          ? savedRow(existing)
          : { state: "conflict", message: createConflict };
      }
      if (inserted.error) return writeError(inserted.error.code) || unknown;
      if (!inserted.data) return unknown;
      return savedRow(inserted.data as ContentRecord);
    }
    if (!current) return missingResult;
    if (current.updated_at !== version)
      return { state: "conflict", message: conflictMessage };
    if (mode === "delete") {
      const deleted = await db
        .from("contents")
        .delete()
        .eq("id", id)
        .eq("updated_at", version)
        .select(columns)
        .maybeSingle();
      if (deleted.error) return writeError(deleted.error.code) || unknown;
      if (!deleted.data) return explainMiss(db, id, version);
      invalidate(id);
      return {
        state: "saved",
        message: "콘텐츠를 삭제했습니다.",
        row: deleted.data as ContentRecord,
        deleted: true,
      };
    }
    const patch = parsed!.patch!;
    const updated = await db
      .from("contents")
      .update({
        title: patch.title,
        description: patch.description,
        channel: patch.channel,
        external_url: patch.external_url,
        is_published: patch.is_published,
        sort_order: patch.sort_order,
      })
      .eq("id", id)
      .eq("updated_at", version)
      .select(columns)
      .maybeSingle();
    if (updated.error) return writeError(updated.error.code) || unknown;
    if (!updated.data) return explainMiss(db, id, version);
    return savedRow(updated.data as ContentRecord);
  } catch {
    return unknown;
  }
}
