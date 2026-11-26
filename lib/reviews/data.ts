import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { pageSize, reviewColumns, type ReviewListItem } from "./rules";

export async function reviewList(page: number, status = "", admin = false) {
  if (admin && !(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("후기 목록 조건이 올바르지 않습니다.");

  const db = admin ? await createClient() : createPublicClient();
  let query = db.from("reviews").select(reviewColumns, { count: "exact" });
  if (!admin) query = query.eq("is_published", true);
  else if (status) query = query.eq("is_published", status === "public");

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error?.code === "PGRST103" && page > 1) {
    let total = db.from("reviews").select("id", {
      head: true,
      count: "exact",
    });
    if (!admin) total = total.eq("is_published", true);
    else if (status) total = total.eq("is_published", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as ReviewListItem[], count: result.count };
  }

  if (error || !data || count === null)
    throw Error("후기 목록을 불러오지 못했습니다.");

  return {
    data: data as unknown as ReviewListItem[],
    count: count || 0,
  };
}
