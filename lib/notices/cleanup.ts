import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  bucket,
  imagePath,
  columns,
  scalar,
  noticeMatches,
  type Notice,
} from "./rules";

// Captured targets are encrypted bound arguments, never caller-supplied paths.
export function cleanupAction(
  path: string,
  user: string,
  until = Date.now() + 3600000,
  source?: Notice,
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
          .from("notices")
          .select(columns)
          .eq("id", source.id)
          .maybeSingle();
        if (current.error) return false;
        if (mode === "delete") {
          if (current.data) return false;
        } else if (
          mode !== "update" ||
          !current.data ||
          current.data.updated_at === source.updated_at ||
          !noticeMatches(current.data, expected)
        )
          return false;
      }
      return await removeUnreferenced(db, path);
    } catch {
      return false;
    }
  };
}

export async function removeUnreferenced(
  db: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  if (!(await requireAdmin()) || !imagePath(path)) return false;
  const refs = await db
    .from("notices")
    .select("id", { head: true, count: "exact" })
    .eq("image_path", path);
  if (refs.error || refs.count === null) return false;
  if (refs.count > 0) return true;
  const result = await db.storage.from(bucket).remove([path]);
  return !result.error;
}
