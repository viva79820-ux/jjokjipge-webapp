import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  bucket,
  columns,
  imageMetadataValid,
  imagePath,
  scalar,
  storeMatches,
  type StoreRecord,
} from "./rules";

// 삭제 대상은 서버가 발급한 경로만 닫아 둔다. 브라우저가 보낸 경로는 쓰지 않는다.
export function cleanupAction(
  path: string,
  user: string,
  until = Date.now() + 3600000,
  source?: StoreRecord,
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
          .from("stores")
          .select(columns)
          .eq("id", source.id)
          .maybeSingle();
        if (current.error || !current.data) return false;
        if (
          (mode !== "update" && mode !== "create") ||
          current.data.updated_at === source.updated_at ||
          !storeMatches(current.data, expected)
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
      if (info.error || !info.data) return "missing";
      return imageMetadataValid(info.data) ? "present" : "rejected";
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
    .from("stores")
    .select("id", { head: true, count: "exact" })
    .eq("image_path", path);
  if (refs.error || refs.count === null) return false;
  if (refs.count > 0) return true;
  const result = await db.storage.from(bucket).remove([path]);
  return !result.error;
}
