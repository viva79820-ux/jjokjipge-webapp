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
  imagePath,
  parseProduct,
  productMatches,
  productRecord,
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
const conflict: Result = {
  state: "conflict",
  message: "다른 작업으로 상품이 변경됐습니다. 최신 내용을 확인해 주세요.",
};
const missing: Result = {
  state: "rejected",
  message: "상품이 없습니다.",
  missing: true,
};
const rejectedCodes = ["23514", "23502", "22P02", "22003"];

function invalidate(id: string) {
  for (const path of [
    "/shop",
    `/shop/${id}`,
    "/admin/shop-products",
    "/admin/shop-products/new",
    `/admin/shop-products/${id}`,
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

async function readProduct(
  db: Awaited<ReturnType<typeof createClient>>,
  id: string,
) {
  return db.from("products").select(columns).eq("id", id).maybeSingle();
}

function asProduct(row: unknown) {
  if (!row || typeof row !== "object") return null;
  return productRecord(row);
}

function savedResult(
  row: ProductRecord,
  userId: string,
  deleted = false,
  cleanup?: () => Promise<boolean>,
): Result {
  invalidate(row.id);
  return {
    state: "saved",
    message: deleted ? "상품을 삭제했습니다." : "상품을 저장했습니다.",
    row,
    deleted,
    cleanup,
    recovery: row.image_path
      ? cleanupAction(row.image_path, userId, undefined, row)
      : undefined,
  };
}

function deletedResult(): Result {
  // 확인 중에는 편집 화면을 다시 그리지 않는다. 상품이 없으면 복구 버튼이 사라진다.
  return {
    state: "saved",
    message: "상품을 삭제했습니다.",
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

export async function prepareProductUpload(ext: string) {
  const admin = await requireAdmin();
  if (!admin || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const path = `products/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
  return {
    path,
    cleanup: cleanupAction(path, admin.userId),
    confirm: confirmUploadAction(path, admin.userId),
  };
}

export async function reloadProduct(id: string): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!uuid(id)) return { state: "rejected", message: "요청을 확인해 주세요." };
  try {
    const db = await createClient();
    const read = await readProduct(db, id);
    if (read.error) return unknown;
    const row = asProduct(read.data);
    if (!read.data) return missing;
    if (!row) return unknown;
    return {
      state: "saved",
      message: "최신 내용을 불러왔습니다.",
      row,
      recovery: row.image_path
        ? cleanupAction(row.image_path, admin.userId, undefined, row)
        : undefined,
    };
  } catch {
    return unknown;
  }
}

export async function saveProduct(form: FormData): Promise<Result> {
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
  const parsed = mode === "delete" ? null : parseProduct(form);
  if (parsed && Object.keys(parsed.errors).length)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  try {
    const db = await createClient();
    const read = await readProduct(db, id);
    if (read.error) return unknown;
    const current = asProduct(read.data);
    if (read.data && !current) return unknown;
    if (mode === "create" && current) {
      if (sameProduct(current, parsed!.patch))
        return savedResult(current, admin.userId);
      return {
        state: "conflict",
        message:
          "이미 다른 내용으로 저장된 상품입니다. 최신 내용을 확인해 주세요.",
        row: current,
      };
    }
    if (mode !== "create" && !current) return missing;
    if (mode !== "create" && current!.updated_at !== version) return conflict;
    const path = parsed?.patch.image_path || null;
    if (path && path !== current?.image_path) {
      const refs = await db
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("image_path", path);
      if (refs.error || refs.count === null) return unknown;
      if (refs.count !== 0)
        return {
          state: "rejected",
          message: "다른 상품의 사진 경로를 사용할 수 없습니다.",
        };
      let looked: ReturnType<typeof classifyStorageInfo>;
      try {
        looked = classifyStorageInfo(await db.storage.from(bucket).info(path));
      } catch {
        return unknown;
      }
      if (looked === "missing")
        return {
          state: "rejected",
          message:
            "업로드한 사진을 찾지 못했습니다. 상품 정보는 바꾸지 않았습니다.",
        };
      if (looked === "rejected")
        return {
          state: "rejected",
          message: "업로드 사진의 크기·형식을 확인하지 못했습니다.",
        };
      if (looked !== "present") return unknown;
    }
    const payload = parsed
      ? {
          name: parsed.patch.name,
          description: parsed.patch.description,
          price: parsed.patch.price,
          image_path: parsed.patch.image_path,
          image_alt: parsed.patch.image_alt,
          is_published: parsed.patch.is_published,
          is_sold_out: parsed.patch.is_sold_out,
          sort_order: parsed.patch.sort_order,
        }
      : null;
    const query =
      mode === "delete"
        ? db.from("products").delete().eq("id", id).eq("updated_at", version!)
        : mode === "create"
          ? db.from("products").insert({ id, ...payload! })
          : db
              .from("products")
              .update(payload!)
              .eq("id", id)
              .eq("updated_at", version!);
    const result = await query.select(columns).maybeSingle();
    if (result.error?.code === "23505" && mode === "create") {
      const again = await readProduct(db, id);
      if (again.error) return unknown;
      const existing = asProduct(again.data);
      if (again.data && !existing) return unknown;
      if (existing && sameProduct(existing, parsed!.patch))
        return savedResult(existing, admin.userId);
      if (existing)
        return {
          state: "conflict",
          message:
            "이미 다른 내용으로 저장된 상품입니다. 최신 내용을 확인해 주세요.",
          row: existing,
        };
      return unknown;
    }
    const rejected = rejectedWrite(result.error?.code);
    if (result.error) return rejected || unknown;
    const saved = asProduct(result.data);
    if (result.data && !saved) return unknown;
    if (!saved) {
      const again = await readProduct(db, id);
      if (again.error) return unknown;
      const latest = asProduct(again.data);
      if (again.data && !latest) return unknown;
      if (!latest) return missing;
      if (latest.updated_at !== version) return conflict;
      return {
        state: "rejected",
        message: "저장 요청이 거부됐습니다. 입력과 권한을 확인해 주세요.",
      };
    }
    if (mode !== "delete" && !sameProduct(saved, parsed!.patch)) return unknown;
    const previous = current?.image_path;
    let cleanup: (() => Promise<boolean>) | undefined;
    if (
      previous &&
      imagePath(previous) &&
      (mode === "delete" || previous !== saved.image_path)
    ) {
      cleanup = cleanupAction(previous, admin.userId);
      try {
        if (await removeUnreferenced(db, previous)) cleanup = undefined;
      } catch {
        /* 상품 저장은 유지하고 사진 정리만 다시 시도할 수 있게 둔다. */
      }
    }
    return savedResult(saved, admin.userId, mode === "delete", cleanup);
  } catch {
    return unknown;
  }
}

export async function confirmProduct(
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
    const read = await readProduct(db, id);
    if (read.error) return unknown;
    const row = asProduct(read.data);
    if (read.data && !row) return unknown;
    if (mode === "delete") {
      if (!row) return deletedResult();
      if (row.updated_at === version)
        return {
          state: "rejected",
          message:
            "삭제는 반영되지 않았습니다. 상품은 그대로 있습니다. 다시 삭제할 수 있습니다.",
          unchanged: true,
          row,
          recovery: row.image_path
            ? cleanupAction(row.image_path, admin.userId, undefined, row)
            : undefined,
        };
      return {
        state: "conflict",
        message:
          "다른 작업으로 상품이 변경됐습니다. 최신 내용을 확인해 주세요.",
        row,
        recovery: row.image_path
          ? cleanupAction(row.image_path, admin.userId, undefined, row)
          : undefined,
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
              "상품이 없습니다. 과거 저장 요청이 성공했는지는 알 수 없습니다.",
          };
    const recovery = row.image_path
      ? cleanupAction(row.image_path, admin.userId, undefined, row)
      : undefined;
    if (mode === "create") {
      if (!productMatches(row, form))
        return {
          state: "conflict",
          message:
            "이미 다른 내용으로 저장된 상품입니다. 최신 내용을 확인해 주세요.",
          row,
          recovery,
        };
      return savedResult(row, admin.userId);
    }
    if (row.updated_at === version)
      return {
        state: "rejected",
        message:
          "저장은 반영되지 않았습니다. 상품은 수정 전 버전 그대로입니다. 다시 저장할 수 있습니다.",
        unchanged: true,
        row,
        recovery,
      };
    if (!productMatches(row, form))
      return {
        state: "conflict",
        message:
          "현재 상품은 이 요청과 다른 내용입니다. 과거 저장 요청이 성공했는지는 알 수 없습니다. 최신 내용을 확인해 주세요.",
        row,
        recovery,
      };
    return savedResult(row, admin.userId);
  } catch {
    return unknown;
  }
}
