import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  bucket,
  classMatches,
  columns,
  imageMetadataValid,
  posterPath,
  scalar,
  type ClassRecord,
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

export function cleanupAction(
  path: string,
  user: string,
  until = Date.now() + 3600000,
  source?: ClassRecord,
) {
  return async function cleanup(expected?: FormData) {
    "use server";
    const admin = await requireAdmin();
    if (
      !admin ||
      admin.userId !== user ||
      until < Date.now() ||
      !posterPath(path)
    )
      return false;
    try {
      const db = await createClient();
      if (source) {
        if (
          !(expected instanceof FormData) ||
          path !== source.poster_path ||
          scalar(expected, "id") !== source.id ||
          scalar(expected, "version") !== source.updated_at
        )
          return false;
        const mode = scalar(expected, "mode");
        const current = await db
          .from("classes")
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
          !classMatches(current.data, expected)
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
    if (!admin || admin.userId !== user || !posterPath(path)) return "rejected";
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
  if (!(await requireAdmin()) || !posterPath(path)) return false;
  const refs = await db
    .from("classes")
    .select("id", { head: true, count: "exact" })
    .eq("poster_path", path);
  if (refs.error || refs.count === null) return false;
  if (refs.count > 0) return true;
  const result = await db.storage.from(bucket).remove([path]);
  return !result.error;
}
