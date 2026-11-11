import "server-only";
import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  columns,
  popupColumns,
  summaryColumns,
  uuid,
  type Notice,
  type NoticePopup,
} from "./rules";
export async function noticeList(page: number, status = "", admin = false) {
  if (admin && !(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = admin ? await createClient() : createPublicClient();
  let q = db.from("notices").select(summaryColumns, { count: "exact" });
  if (!admin) q = q.eq("is_published", true);
  else if (status) q = q.eq("is_published", status === "public");
  const { data, error, count } = await q
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error?.code === "PGRST103" && page > 1) {
    let total = db.from("notices").select("id", { head: true, count: "exact" });
    if (!admin) total = total.eq("is_published", true);
    else if (status) total = total.eq("is_published", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [], count: result.count };
  }
  if (error || !data || count === null)
    throw Error("공지 목록을 불러오지 못했습니다.");
  return {
    data: data as Pick<
      Notice,
      | "id"
      | "title"
      | "is_pinned"
      | "is_published"
      | "is_popup"
      | "published_at"
    >[],
    count: count || 0,
  };
}
export async function noticeDetail(id: string, admin = false) {
  if (admin && !(await requireAdmin())) return null;
  if (!uuid(id)) return null;
  const db = admin ? await createClient() : createPublicClient();
  let q = db.from("notices").select(columns).eq("id", id);
  if (!admin) q = q.eq("is_published", true);
  const { data, error } = await q.maybeSingle();
  if (error) throw Error("공지를 불러오지 못했습니다.");
  return data as Notice | null;
}
export async function homePopupNotice() {
  const { data, error } = await createPublicClient()
    .from("notices")
    .select(popupColumns)
    .eq("is_published", true)
    .eq("is_popup", true)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw Error("홈 팝업을 불러오지 못했습니다.");
  return (data as NoticePopup | null) ?? null;
}
export async function loadHomePopup() {
  await connection();
  try {
    return await homePopupNotice();
  } catch {
    return null;
  }
}
