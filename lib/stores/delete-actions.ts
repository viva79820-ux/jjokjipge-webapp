import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { versionValid } from "@/lib/admin/support-rules";
import { createClient } from "@/lib/supabase/server";
import {
  bucket,
  columns,
  imagePath,
  scalar,
  uuid,
  type StoreRecord,
} from "./rules";

type DeleteSource = {
  id: string;
  version: string;
  name: string;
  imagePath: string | null;
  slug: string;
  userId: string;
  expiresAt: number;
};

export type StoreDeleteResult = {
  state:
    | "ready"
    | "blocked"
    | "conflict"
    | "missing"
    | "denied"
    | "unknown"
    | "exists"
    | "deleted"
    | "cleanup_pending";
  message: string;
  linkedCount?: number;
  execute?: (form: FormData) => Promise<StoreDeleteResult>;
  reconcile?: () => Promise<StoreDeleteResult>;
  retryCleanup?: () => Promise<StoreDeleteResult>;
};

type StoreClient = Awaited<ReturnType<typeof createClient>>;

const denied: StoreDeleteResult = {
  state: "denied",
  message: "관리자 권한이 필요합니다.",
};
const unknown: StoreDeleteResult = {
  state: "unknown",
  message:
    "삭제 결과를 확인할 수 없습니다. 매장과 사진 상태를 다시 확인해 주세요.",
};
const conflict: StoreDeleteResult = {
  state: "conflict",
  message: "다른 작업으로 매장이 변경됐습니다. 최신 내용을 다시 불러와 주세요.",
};
const missing: StoreDeleteResult = {
  state: "missing",
  message: "매장이 이미 없거나 삭제됐습니다.",
};

function sourceValid(source: DeleteSource) {
  return (
    uuid(source.id) &&
    versionValid(source.version) &&
    validName(source.name) &&
    (source.imagePath === null || imagePath(source.imagePath)) &&
    typeof source.slug === "string" &&
    source.slug.length > 0 &&
    source.slug.length <= 100 &&
    source.userId.length > 0 &&
    Number.isSafeInteger(source.expiresAt)
  );
}

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    [...value].length >= 1 &&
    [...value].length <= 100 &&
    !/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(value)
  );
}

function readFailure(code?: string): StoreDeleteResult {
  return code === "42501" ? denied : unknown;
}

function linkedMessage(count?: number): StoreDeleteResult {
  return {
    state: "blocked",
    linkedCount: count,
    message:
      "연결된 상담사가 있습니다. 상담사 관리에서 소속을 변경하거나 해제한 뒤 다시 시도해 주세요.",
  };
}

function activeMessage(): StoreDeleteResult {
  return {
    state: "blocked",
    message: "공개 매장은 먼저 비공개로 저장해야 삭제할 수 있습니다.",
  };
}

async function linkedCounselorCount(db: StoreClient, storeId: string) {
  const result = await db
    .from("counselors")
    .select("id", { head: true, count: "exact" })
    .eq("store_id", storeId);
  return result.error || result.count === null
    ? { error: result.error?.code }
    : { count: result.count };
}

async function readStore(db: StoreClient, id: string) {
  return await db.from("stores").select(columns).eq("id", id).maybeSingle();
}

async function cleanupDeletedPhoto(db: StoreClient, source: DeleteSource) {
  if (!source.imagePath)
    return { done: true, message: "삭제할 매장 사진이 없습니다." };
  if (!imagePath(source.imagePath))
    return {
      done: true,
      message: "검증된 매장 사진 경로가 아니어서 파일은 유지했습니다.",
    };

  const current = await db
    .from("stores")
    .select("id")
    .eq("id", source.id)
    .maybeSingle();
  if (current.error)
    return {
      done: false,
      message:
        "매장 삭제는 끝났지만 현재 상태를 확인하지 못해 사진을 정리하지 않았습니다.",
    };
  if (current.data)
    return {
      done: false,
      message:
        "같은 ID의 매장이 확인되어 사진을 정리하지 않았습니다. 매장 상태를 확인해 주세요.",
    };

  const refs = await db
    .from("stores")
    .select("id", { head: true, count: "exact" })
    .eq("image_path", source.imagePath);
  if (refs.error || refs.count === null)
    return {
      done: false,
      message:
        "매장 삭제는 끝났지만 사진 참조를 확인하지 못해 파일을 유지했습니다.",
    };
  if (refs.count > 0)
    return {
      done: true,
      message: "사진은 다른 매장에서도 사용 중이어서 파일을 유지했습니다.",
    };

  const removed = await db.storage.from(bucket).remove([source.imagePath]);
  return removed.error
    ? {
        done: false,
        message: "매장 삭제는 끝났지만 사진 파일 정리가 끝나지 않았습니다.",
      }
    : { done: true, message: "매장과 사진을 삭제했습니다." };
}

function cleanupRetryAction(source: DeleteSource) {
  return async function retryCleanup(): Promise<StoreDeleteResult> {
    "use server";
    const admin = await requireAdmin();
    if (!admin || admin.userId !== source.userId) return denied;
    if (!sourceValid(source) || source.expiresAt < Date.now())
      return {
        state: "cleanup_pending",
        message:
          "사진 정리 권한이 만료되었거나 요청을 확인할 수 없습니다. 파일은 변경하지 않았습니다.",
      };
    try {
      const cleanup = await cleanupDeletedPhoto(await createClient(), source);
      if (!cleanup.done)
        return {
          state: "cleanup_pending",
          message: cleanup.message,
          retryCleanup: cleanupRetryAction(source),
        };
      return { state: "deleted", message: cleanup.message };
    } catch {
      return {
        state: "cleanup_pending",
        message:
          "매장 삭제는 끝났지만 사진 정리 결과를 확인하지 못했습니다. 파일은 변경하지 않았습니다.",
        retryCleanup: cleanupRetryAction(source),
      };
    }
  };
}

async function finishDeleted(
  db: StoreClient,
  source: DeleteSource,
): Promise<StoreDeleteResult> {
  const cleanup = await cleanupDeletedPhoto(db, source);
  if (!cleanup.done)
    return {
      state: "cleanup_pending",
      message: cleanup.message,
      retryCleanup: cleanupRetryAction(source),
    };
  return { state: "deleted", message: cleanup.message };
}

function reconcileDeleteAction(source: DeleteSource) {
  return async function reconcileDelete(): Promise<StoreDeleteResult> {
    "use server";
    const admin = await requireAdmin();
    if (!admin || admin.userId !== source.userId) return denied;
    if (!sourceValid(source) || source.expiresAt < Date.now()) return unknown;
    try {
      const db = await createClient();
      const current = await readStore(db, source.id);
      if (current.error) return readFailure(current.error.code);
      if (current.data) {
        const row = current.data as StoreRecord;
        if (row.is_active) return activeMessage();
        if (row.updated_at !== source.version) return conflict;
        return {
          state: "exists",
          message:
            "삭제 요청이 반영되지 않았습니다. 매장과 사진은 그대로 유지됩니다.",
        };
      }
      return await finishDeleted(db, source);
    } catch {
      return unknown;
    }
  };
}

async function classifyNoDelete(
  db: StoreClient,
  source: DeleteSource,
): Promise<StoreDeleteResult> {
  const current = await readStore(db, source.id);
  if (current.error) return readFailure(current.error.code);
  if (!current.data) return missing;
  const row = current.data as StoreRecord;
  if (row.is_active) return activeMessage();
  if (row.updated_at !== source.version) return conflict;
  const linked = await linkedCounselorCount(db, source.id);
  if ("error" in linked) return readFailure(linked.error);
  if (linked.count > 0) return linkedMessage(linked.count);
  return {
    state: "unknown",
    message:
      "삭제된 행을 확인하지 못했습니다. 매장과 사진은 변경하지 않은 상태로 다시 확인해 주세요.",
  };
}

function deleteStoreAction(source: DeleteSource) {
  return async function deleteStore(
    form: FormData,
  ): Promise<StoreDeleteResult> {
    "use server";
    const admin = await requireAdmin();
    if (!admin || admin.userId !== source.userId) return denied;
    if (
      !sourceValid(source) ||
      source.expiresAt < Date.now() ||
      !(form instanceof FormData)
    )
      return { state: "blocked", message: "삭제 요청을 확인해 주세요." };

    const id = scalar(form, "id");
    const version = scalar(form, "version");
    const confirmedName = scalar(form, "confirmed_name");
    if (
      id !== source.id ||
      !uuid(id) ||
      version !== source.version ||
      !versionValid(version) ||
      !validName(confirmedName) ||
      confirmedName !== source.name
    )
      return {
        state: "blocked",
        message: "확인용 매장명과 삭제 요청 정보를 다시 확인해 주세요.",
      };

    try {
      const db = await createClient();
      const current = await readStore(db, source.id);
      if (current.error) return readFailure(current.error.code);
      if (!current.data) return missing;
      const row = current.data as StoreRecord;
      if (row.is_active) return activeMessage();
      if (row.updated_at !== source.version) return conflict;
      if (row.name !== source.name || confirmedName !== row.name)
        return {
          state: "blocked",
          message: "확인용 매장명이 현재 매장명과 일치하지 않습니다.",
        };

      const linked = await linkedCounselorCount(db, source.id);
      if ("error" in linked) return readFailure(linked.error);
      if (linked.count > 0) return linkedMessage(linked.count);

      const deleted = await db
        .from("stores")
        .delete()
        .eq("id", source.id)
        .eq("updated_at", source.version)
        .eq("is_active", false)
        .select(columns)
        .maybeSingle();
      if (deleted.error) {
        if (deleted.error.code === "23001" || deleted.error.code === "23503")
          return linkedMessage();
        if (deleted.error.code === "42501") return denied;
        if (deleted.error.code === "PGRST116")
          return await classifyNoDelete(db, source);
        if (!deleted.error.code) return unknown;
        return {
          state: "blocked",
          message:
            "매장 삭제 중 오류가 발생했습니다. 매장과 사진은 그대로 유지됩니다.",
        };
      }
      if (!deleted.data) return await classifyNoDelete(db, source);

      const deletedRow = deleted.data as StoreRecord;
      if (
        deletedRow.id !== source.id ||
        deletedRow.updated_at !== source.version ||
        deletedRow.is_active !== false ||
        deletedRow.name !== source.name ||
        deletedRow.image_path !== source.imagePath
      )
        return unknown;
      return await finishDeleted(db, source);
    } catch {
      return unknown;
    }
  };
}

export async function prepareStoreDelete(
  form: FormData,
): Promise<StoreDeleteResult> {
  "use server";
  const admin = await requireAdmin();
  if (!admin) return denied;
  if (!(form instanceof FormData))
    return { state: "blocked", message: "삭제 요청을 확인해 주세요." };
  const id = scalar(form, "id");
  const version = scalar(form, "version");
  if (!uuid(id) || !version || !versionValid(version))
    return { state: "blocked", message: "매장 ID와 버전을 확인해 주세요." };

  try {
    const db = await createClient();
    const current = await readStore(db, id);
    if (current.error) return readFailure(current.error.code);
    if (!current.data) return missing;
    const row = current.data as StoreRecord;
    if (row.updated_at !== version) return conflict;
    if (row.is_active) return activeMessage();
    const linked = await linkedCounselorCount(db, id);
    if ("error" in linked) return readFailure(linked.error);
    if (linked.count > 0) return linkedMessage(linked.count);

    const source: DeleteSource = {
      id: row.id,
      version: row.updated_at,
      name: row.name,
      imagePath: imagePath(row.image_path) ? row.image_path : null,
      slug: row.slug,
      userId: admin.userId,
      expiresAt: Date.now() + 3600000,
    };
    if (!sourceValid(source)) return unknown;
    return {
      state: "ready",
      message: "삭제 조건을 확인했습니다.",
      linkedCount: 0,
      execute: deleteStoreAction(source),
      reconcile: reconcileDeleteAction(source),
    };
  } catch {
    return unknown;
  }
}
