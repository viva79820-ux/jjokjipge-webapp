"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  classMatches,
  columns,
  parseClass,
  sameClass,
  scalar,
  uuid,
  type ClassRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: ClassRecord;
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
const conflict: Result = {
  state: "conflict",
  message: "다른 작업으로 클래스가 변경됐습니다. 최신 내용을 확인해 주세요.",
};
const missing: Result = {
  state: "rejected",
  message: "클래스가 없습니다.",
  missing: true,
};
const rejectedCodes = ["23514", "23502", "22P02", "22003"];

function invalidate(id: string) {
  for (const path of [
    "/class",
    `/class/${id}`,
    "/admin/classes",
    "/admin/classes/new",
    `/admin/classes/${id}`,
  ])
    revalidatePath(path);
}

function rejectedWrite(code?: string): Result | null {
  if (!code) return null;
  if (code === "42501") return denied;
  if (rejectedCodes.includes(code))
    return {
      state: "rejected",
      message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
    };
  return null;
}

async function readClass(
  db: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  return db.from("classes").select(columns).eq("id", id).maybeSingle();
}

function savedResult(row: ClassRecord, deleted = false): Result {
  invalidate(row.id);
  return {
    state: "saved",
    message: deleted ? "클래스를 삭제했습니다." : "클래스를 저장했습니다.",
    row,
    deleted,
  };
}

function deletedResult(id: string): Result {
  invalidate(id);
  return {
    state: "saved",
    message: "클래스를 삭제했습니다.",
    deleted: true,
  };
}

function duplicateField(form: FormData) {
  const seen = new Set<string>();
  for (const key of form.keys()) {
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export async function reloadClass(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id)) return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const db = await createClient();
    const read = await readClass(db, id);
    if (read.error) return unknown;
    if (!read.data) return missing;
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row: read.data as ClassRecord,
    };
  } catch {
    return unknown;
  }
}

export async function saveClass(form: FormData): Promise<Result> {
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
  const parsed = mode === "delete" ? null : parseClass(form);
  if (parsed && Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  try {
    const db = await createClient();
    const read = await readClass(db, id);
    if (read.error) return unknown;
    const current = read.data as ClassRecord | null;
    if (mode === "create" && current) {
      if (sameClass(current, parsed!.patch)) return savedResult(current);
      return {
        state: "conflict",
        message:
          "이미 다른 내용으로 저장된 클래스입니다. 최신 내용을 확인해 주세요.",
        row: current,
      };
    }
    if (mode !== "create" && !current) return missing;
    if (mode !== "create" && current!.updated_at !== version) return conflict;
    const payload = parsed
      ? {
          title: parsed.patch.title,
          description: parsed.patch.description,
          field: parsed.patch.field,
          video_url: parsed.patch.video_url,
          is_published: parsed.patch.is_published,
          sort_order: parsed.patch.sort_order,
        }
      : null;
    const query =
      mode === "delete"
        ? db.from("classes").delete().eq("id", id).eq("updated_at", version!)
        : mode === "create"
          ? db.from("classes").insert({ id, ...payload! })
          : db
              .from("classes")
              .update(payload!)
              .eq("id", id)
              .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error?.code === "23505" && mode === "create") {
      const again = await readClass(db, id);
      if (again.error) return unknown;
      const existing = again.data as ClassRecord | null;
      if (existing && sameClass(existing, parsed!.patch))
        return savedResult(existing);
      if (existing)
        return {
          state: "conflict",
          message:
            "이미 다른 내용으로 저장된 클래스입니다. 최신 내용을 확인해 주세요.",
          row: existing,
        };
      return unknown;
    }
    const rejected = rejectedWrite(result.error?.code);
    if (result.error) return rejected || unknown;
    if (!result.data) {
      const again = await readClass(db, id);
      if (again.error) return unknown;
      const latest = again.data as ClassRecord | null;
      if (!latest) return missing;
      if (latest.updated_at !== version) return conflict;
      return {
        state: "rejected",
        message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
      };
    }
    return savedResult(result.data as ClassRecord, mode === "delete");
  } catch {
    return unknown;
  }
}

export async function confirmClass(
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
    const db = await createClient();
    const read = await readClass(db, id);
    if (read.error) return unknown;
    const row = read.data as ClassRecord | null;
    if (mode === "delete") {
      if (!row) return deletedResult(id);
      if (row.updated_at === version)
        return {
          state: "rejected",
          message:
            "삭제는 반영되지 않았습니다. 클래스는 그대로 있습니다. 다시 삭제할 수 있습니다.",
          unchanged: true,
          row,
        };
      return {
        state: "conflict",
        message:
          "다른 작업으로 클래스가 변경됐습니다. 최신 내용을 확인해 주세요.",
        row,
      };
    }
    if (!row) return missing;
    if (!classMatches(row, form))
      return {
        state: "conflict",
        message:
          "현재 저장 내용과 일치하지 않습니다. 최신 내용을 확인하거나 다시 저장해 주세요.",
        row,
      };
    return savedResult(row);
  } catch {
    return unknown;
  }
}
