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
  parseStore,
  sameStore,
  scalar,
  storeMatches,
  uuid,
  type StoreRecord,
} from "./rules";

export type Result = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: StoreRecord;
  errors?: Record<string, string>;
  cleanup?: () => Promise<boolean>;
  recovery?: (expected: FormData) => Promise<boolean>;
  missing?: boolean;
  matched?: boolean;
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
  message: "다른 작업으로 매장이 변경됐습니다. 최신 내용을 확인해 주세요.",
};
const slugPattern = /^[a-z0-9-]+$/;
const rejectedCodes = ["23514", "23502", "42501", "23503", "22P02", "22003"];

function customerPaths(slug: string) {
  if (!slug || slug.length > 100 || !slugPattern.test(slug)) return [];
  return [`/consult/${slug}`, `/consult/${slug}/book`];
}

function invalidate(id: string, slugs: string[]) {
  const paths = [
    "/admin/stores",
    `/admin/stores/${id}`,
    "/stores",
    "/",
    "/consult",
  ];
  for (const slug of slugs) paths.push(...customerPaths(slug));
  for (const path of paths) revalidatePath(path);
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

async function linkedSlugs(
  db: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
) {
  try {
    const linked = await db
      .from("counselors")
      .select("slug")
      .eq("store_id", storeId);
    if (linked.error || !linked.data) return [];
    return linked.data
      .map((row) => row.slug)
      .filter((slug): slug is string => typeof slug === "string");
  } catch {
    return [];
  }
}

export async function prepareStoreUpload(ext: string) {
  const admin = await requireAdmin();
  if (!admin || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const path = `stores/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  return {
    path,
    cleanup: cleanupAction(path, admin.userId),
    confirm: confirmUploadAction(path, admin.userId),
  };
}

export async function reloadStore(
  id: string,
  expected?: FormData,
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin || !uuid(id)) return denied;
  if (expected !== undefined && !(expected instanceof FormData))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  try {
    const { data, error } = await (
      await createClient()
    )
      .from("stores")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (error) return unknown;
    if (!data)
      return { state: "rejected", message: "매장이 없습니다.", missing: true };
    const row = data as StoreRecord;
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row,
      matched:
        expected instanceof FormData ? storeMatches(row, expected) : undefined,
      recovery: row.image_path
        ? cleanupAction(row.image_path, admin.userId, undefined, row)
        : undefined,
    };
  } catch {
    return unknown;
  }
}

export async function saveStore(form: FormData): Promise<Result> {
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
  const parsed = parseStore(form);
  if (Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  const db = await createClient();
  try {
    const read = await db
      .from("stores")
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    if (read.error) return unknown;
    const current = read.data as StoreRecord | null;
    if (mode === "create" && current) {
      if (current.slug === id && sameStore(current, parsed.patch)) {
        invalidate(current.id, await linkedSlugs(db, current.id));
        return {
          state: "saved",
          message: "매장을 저장했습니다.",
          row: current,
          recovery: current.image_path
            ? cleanupAction(
                current.image_path,
                admin.userId,
                undefined,
                current,
              )
            : undefined,
        };
      }
      return {
        state: "conflict",
        message:
          "이미 다른 내용으로 저장된 매장입니다. 최신 내용을 확인해 주세요.",
        row: current,
        resetAttempt: current.slug !== id,
      };
    }
    if (mode === "update" && !current)
      return { state: "rejected", message: "매장이 없습니다.", missing: true };
    if (mode === "update" && current?.updated_at !== version) return conflict;
    const path = parsed.patch.image_path;
    if (path && path !== current?.image_path) {
      const refs = await db
        .from("stores")
        .select("id", { count: "exact", head: true })
        .eq("image_path", path);
      if (refs.error || refs.count === null) return unknown;
      if (refs.count !== 0)
        return {
          state: "rejected",
          message: "다른 매장의 사진 경로를 사용할 수 없습니다.",
        };
      const info = await db.storage.from(bucket).info(path);
      if (info.error || !info.data) return unknown;
      if (!imageMetadataValid(info.data))
        return {
          state: "rejected",
          message: "업로드 사진의 크기·형식을 확인하지 못했습니다.",
        };
    }
    const payload = {
      name: parsed.patch.name,
      description: parsed.patch.description,
      address: parsed.patch.address,
      hours: parsed.patch.hours,
      phone: parsed.patch.phone,
      image_path: parsed.patch.image_path,
      sort_order: parsed.patch.sort_order,
      is_active: parsed.patch.is_active,
    };
    const query =
      mode === "create"
        ? db.from("stores").insert({ id, slug: id, ...payload })
        : db
            .from("stores")
            .update(payload)
            .eq("id", id)
            .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error?.code === "23505") {
      const again = await db
        .from("stores")
        .select(columns)
        .eq("id", id)
        .maybeSingle();
      if (again.error) return unknown;
      const existing = again.data as StoreRecord | null;
      if (
        existing &&
        existing.slug === id &&
        sameStore(existing, parsed.patch)
      ) {
        invalidate(existing.id, await linkedSlugs(db, existing.id));
        return {
          state: "saved",
          message: "매장을 저장했습니다.",
          row: existing,
          recovery: existing.image_path
            ? cleanupAction(
                existing.image_path,
                admin.userId,
                undefined,
                existing,
              )
            : undefined,
        };
      }
      return {
        state: "conflict",
        message:
          "이미 다른 내용으로 저장된 매장입니다. 최신 내용을 확인해 주세요.",
        row: existing || undefined,
        resetAttempt: !existing || existing.slug !== id,
      };
    }
    const rejected = rejectedWrite(result.error?.code);
    if (result.error) return rejected || unknown;
    if (!result.data) return conflict;
    const saved = result.data as StoreRecord;
    if (
      saved.slug !== (mode === "create" ? id : current?.slug) ||
      !sameStore(saved, parsed.patch)
    )
      return unknown;
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
    invalidate(saved.id, await linkedSlugs(db, saved.id));
    return {
      state: "saved",
      message: "매장을 저장했습니다.",
      row: saved,
      cleanup,
      recovery: saved.image_path
        ? cleanupAction(saved.image_path, admin.userId, undefined, saved)
        : undefined,
    };
  } catch {
    return unknown;
  }
}

export async function refreshStoreViews(id: string) {
  const admin = await requireAdmin();
  if (!admin || !uuid(id)) return false;
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("stores")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) return false;
    if (data) invalidate(data.id, await linkedSlugs(db, data.id));
    else revalidatePath("/admin/stores");
    return true;
  } catch {
    return false;
  }
}
