import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { columns, listColumns, uuid, type CounselorRecord } from "./rules";

export type AdminStore = { id: string; name: string; is_active: boolean };
export type CounselorListItem = {
  id: string;
  slug: string;
  name: string;
  field: CounselorRecord["field"];
  fields: CounselorRecord["fields"];
  image_path: string | null;
  is_active: boolean;
  is_recommended: boolean;
  is_new: boolean;
  approval_status: CounselorRecord["approval_status"];
  sort_order: number;
  stores: { name: string; is_active: boolean } | null;
};

export async function counselorAdminList(page: number, status = "") {
  if (!(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  let query = db.from("counselors").select(listColumns, { count: "exact" });
  if (status) query = query.eq("is_active", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * 20, page * 20 - 1);
  if (error?.code === "PGRST103" && page > 1) {
    let total = db
      .from("counselors")
      .select("id", { head: true, count: "exact" });
    if (status) total = total.eq("is_active", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as CounselorListItem[], count: result.count };
  }
  if (error || !data || count === null) return { error: true as const };
  return {
    data: data as unknown as CounselorListItem[],
    count: count || 0,
  };
}

export async function counselorAdminDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return null;
  const { data, error } = await (
    await createClient()
  )
    .from("counselors")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) throw Error("상담사를 불러오지 못했습니다.");
  return data as CounselorRecord | null;
}

export async function adminStores() {
  if (!(await requireAdmin())) return null;
  const { data, error } = await (
    await createClient()
  )
    .from("stores")
    .select("id,name,is_active")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error || !data) throw Error("매장 목록을 불러오지 못했습니다.");
  return data as AdminStore[];
}
