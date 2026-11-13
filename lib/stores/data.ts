import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  columns,
  listColumns,
  pageSize,
  uuid,
  type StoreRecord,
} from "./rules";

export type StoreListItem = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function storeAdminList(page: number, status = "") {
  if (!(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  let query = db.from("stores").select(listColumns, { count: "exact" });
  if (status) query = query.eq("is_active", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error?.code === "PGRST103" && page > 1) {
    let total = db.from("stores").select("id", { head: true, count: "exact" });
    if (status) total = total.eq("is_active", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as StoreListItem[], count: result.count };
  }
  if (error || !data || count === null) return { error: true as const };
  return { data: data as StoreListItem[], count: count || 0 };
}

export async function storeAdminDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return { missing: true as const };
  const db = await createClient();
  const { data, error } = await db
    .from("stores")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: true as const };
  if (!data) return { missing: true as const };
  const linked = await db
    .from("counselors")
    .select("id", { head: true, count: "exact" })
    .eq("store_id", id);
  return {
    row: data as StoreRecord,
    linkedCounselors:
      linked.error || linked.count === null ? null : linked.count,
  };
}
