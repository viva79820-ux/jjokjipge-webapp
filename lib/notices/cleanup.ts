import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { bucket, imagePath } from "./rules";

// Captured targets are encrypted bound arguments, never caller-supplied paths.
export function cleanupAction(
  path: string,
  user: string,
  until = Date.now() + 3600000,
) {
  return async function cleanup() {
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
      return await removeUnreferenced(await createClient(), path);
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
