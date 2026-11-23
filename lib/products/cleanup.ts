import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  bucket,
  columns,
  imageMetadataValid,
  imagePath,
  productMatches,
  scalar,
  type ProductRecord,
} from "./rules";

export type UploadLookup =
  "present" | "missing" | "rejected" | "forbidden" | "unavailable" | "unknown";

function storageStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; statusCode?: unknown };
  const raw = record.status ?? record.statusCode;
  const status = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(status) ? status : null;
}

// 파일 부재는 조회 오류와 다르다. 권한·일시 장애·응답 유실은 부재로 보지 않는다.
export function classifyStorageInfo(result: {
  data: { size?: number; contentType?: string | null } | null;
  error: unknown;
}): UploadLookup {
  if (!result.error && result.data)
    return imageMetadataValid(result.data) ? "present" : "rejected";
  const status = storageStatus(result.error);
  if (status === 400 || status === 404) return "missing";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 408 || status === 429 || status === 503) return "unavailable";
  return "unknown";
}

// 지울 경로는 서버가 발급한 값만 닫아 둔다. 브라우저가 보낸 경로는 쓰지 않는다.
export function cleanupAction(
  path: string,
  user: string,
  until = Date.now() + 3600000,
  source?: ProductRecord,
) {
  return async function cleanup(expected?: FormData) {
    "use server";
    const admin = await requireAdmin();
    if (
      !admin ||
      admin.userId !== user ||
      until < Date.now() ||
      !imagePath(path)
    )
      return false;
    try {
      const db = await createClient();
      if (source) {
        if (
          !(expected instanceof FormData) ||
          path !== source.image_path ||
          scalar(expected, "id") !== source.id ||
          scalar(expected, "version") !== source.updated_at
        )
          return false;
        const mode = scalar(expected, "mode");
        const current = await db
          .from("products")
          .select(columns)
          .eq("id", source.id)
          .maybeSingle();
        if (current.error) return false;
        if (mode === "delete") {
          if (current.data) return false;
        } else if (
          (mode !== "update" && mode !== "create") ||
          !current.data ||
          current.data.updated_at === source.updated_at ||
          !productMatches(current.data, expected)
        )
          return false;
      }
      return await removeUnreferenced(db, path);
    } catch {
      return false;
    }
  };
}

export function confirmUploadAction(path: string, user: string) {
  return async function confirmUpload() {
    "use server";
    const admin = await requireAdmin();
    if (!admin || admin.userId !== user || !imagePath(path)) return "rejected";
    try {
      const info = await (await createClient()).storage.from(bucket).info(path);
      return classifyStorageInfo(info);
    } catch {
      return "unknown";
    }
  };
}

export async function removeUnreferenced(
  db: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  if (!(await requireAdmin()) || !imagePath(path)) return false;
  const refs = await db
    .from("products")
    .select("id", { head: true, count: "exact" })
    .eq("image_path", path);
  if (refs.error || refs.count === null) return false;
  if (refs.count > 0) return true;
  const result = await db.storage.from(bucket).remove([path]);
  return !result.error;
}
