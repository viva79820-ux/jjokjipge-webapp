"use server";
import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  cleanupAction,
  confirmUploadAction,
  removeUnreferenced,
} from "./cleanup";
import {
  bucket,
  columns,
  imageMetadataValid,
  imagePath,
  parseCounselor,
  scalar,
  uuid,
  type CounselorRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: CounselorRecord;
  errors?: Record<string, string>;
  cleanup?: () => Promise<boolean>;
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
const conflict: Result = {
  state: "conflict",
  message: "다른 작업으로 상담사가 변경됐습니다. 최신 내용을 확인해 주세요.",
};

function customerPaths(slug: string) {
  if (!/^[a-z0-9-]+$/.test(slug)) return [];
  return [`/consult/${slug}`, `/consult/${slug}/book`];
}

function invalidate(row: { id: string; slug: string }) {
  for (const path of [
    "/admin/counselors",
    `/admin/counselors/${row.id}`,
    "/",
    "/consult",
    "/stores",
    ...customerPaths(row.slug),
  ])
    revalidatePath(path);
}

export async function prepareCounselorUpload(ext: string) {
  const admin = await requireAdmin();
  if (!admin || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const path = `counselors/${randomUUID()}.${ext}`;
  return {
    path,
    cleanup: cleanupAction(path, admin.userId),
    confirm: confirmUploadAction(path, admin.userId),
  };
}

export async function reloadCounselor(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin || !uuid(id)) return denied;
  try {
    const { data, error } = await (
      await createClient()
    )
      .from("counselors")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (error) return unknown;
    if (!data)
      return {
        state: "rejected",
        message: "상담사가 없습니다.",
        missing: true,
      };
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row: data,
      recovery: data.image_path
        ? cleanupAction(data.image_path, admin.userId, undefined, data)
        : undefined,
    };
  } catch {
    return unknown;
  }
}

export async function saveCounselor(form: FormData): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  const id = scalar(form, "id");
  const version = scalar(form, "version");
  const mode = scalar(form, "mode");
  if (
    !uuid(id) ||
    (mode !== "create" && mode !== "update") ||
    (mode === "update" && (!version || !versionValid(version)))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const parsed = parseCounselor(form);
  if (Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  const db = await createClient();
  try {
    const read = await db
      .from("counselors")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (read.error) return unknown;
    const current = read.data as CounselorRecord | null;
    if (mode === "create" && current)
      return {
        state: "conflict",
        message: "이미 저장된 초안입니다. 저장 결과를 확인해 주세요.",
        row: current,
      };
    if (mode === "update" && (!current || current.updated_at !== version))
      return conflict;
    if (parsed.patch.store_id) {
      const store = await db
        .from("stores")
        .select("id")
        .eq("id", parsed.patch.store_id)
        .maybeSingle();
      if (store.error) return unknown;
      if (!store.data)
        return {
          state: "rejected",
          message: "소속 매장을 확인해 주세요.",
          errors: { store_id: "선택할 수 없는 매장입니다." },
        };
    }
    const path = parsed.patch.image_path;
    if (path && path !== current?.image_path) {
      const refs = await db
        .from("counselors")
        .select("id", { count: "exact", head: true })
        .eq("image_path", path);
      if (refs.error || refs.count === null) return unknown;
      if (refs.count !== 0)
        return {
          state: "rejected",
          message: "다른 상담사의 사진 경로를 사용할 수 없습니다.",
        };
      const info = await db.storage.from(bucket).info(path);
      if (info.error || !info.data) return unknown;
      if (!imageMetadataValid(info.data))
        return {
          state: "rejected",
          message: "업로드 사진의 크기·형식을 확인하지 못했습니다.",
        };
    }
    const patch = {
      name: parsed.patch.name,
      field: parsed.patch.field,
      fields: parsed.patch.fields,
      tags: parsed.patch.tags,
      careers: parsed.patch.careers,
      intro: parsed.patch.intro,
      description: parsed.patch.description,
      image_path: parsed.patch.image_path,
      is_recommended: parsed.patch.is_recommended,
      is_new: parsed.patch.is_new,
      is_active: parsed.patch.is_active,
      sort_order: parsed.patch.sort_order,
      store_id: parsed.patch.store_id,
    };
    const query =
      mode === "create"
        ? db.from("counselors").insert({ id, slug: id, ...patch })
        : db
            .from("counselors")
            .update(patch)
            .eq("id", id)
            .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error)
      return ["23514", "23502", "42501", "23503", "23505", "22P02"].includes(
        result.error.code,
      )
        ? {
            state: "rejected",
            message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
          }
        : result.error.code === "PGRST116"
          ? conflict
          : unknown;
    if (!result.data) return conflict;
    const saved = result.data as CounselorRecord;
    const previous = current?.image_path;
    let cleanup: (() => Promise<boolean>) | undefined;
    if (previous && imagePath(previous) && previous !== saved.image_path) {
      cleanup = cleanupAction(previous, admin.userId);
      try {
        if (await removeUnreferenced(db, previous)) cleanup = undefined;
      } catch {
        /* DB 저장은 유지하고 정리만 다시 시도할 수 있게 둔다. */
      }
    }
    invalidate(saved);
    return {
      state: "saved",
      message: "상담사를 저장했습니다.",
      row: saved,
      cleanup,
    };
  } catch {
    return unknown;
  }
}

export async function refreshCounselorViews(id: string) {
  const admin = await requireAdmin();
  if (!admin || !uuid(id)) return false;
  try {
    const { data, error } = await (
      await createClient()
    )
      .from("counselors")
      .select("id,slug")
      .eq("id", id)
      .maybeSingle();
    if (error) return false;
    if (data) invalidate(data);
    else revalidatePath("/admin/counselors");
    return true;
  } catch {
    return false;
  }
}
