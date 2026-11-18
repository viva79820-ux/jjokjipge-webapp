import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import {
  columns,
  fieldLabel,
  pageSize,
  publicDetailColumns,
  publicListColumns,
  publicVideoHref,
  uuid,
  type ClassRecord,
  type PublicClassDetail,
  type PublicClassSummary,
} from "./rules";

function rangeError(error: { code?: string } | null, page: number) {
  return error?.code === "PGRST103" && page > 1;
}

export async function publicClassList(page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 9999999)
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = createPublicClient();
  const { data, error, count } = await db
    .from("classes")
    .select(publicListColumns, { count: "exact" })
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (rangeError(error, page)) {
    const total = await db
      .from("classes")
      .select("id", { head: true, count: "exact" })
      .eq("is_published", true);
    if (!total.error && total.count !== null)
      return { data: [] as PublicClassSummary[], count: total.count };
  }
  if (error || !data || count === null)
    throw Error("클래스 목록을 불러오지 못했습니다.");
  return {
    data: data.map((row) => toSummary(row)),
    count: count || 0,
  };
}

export async function publicClassDetail(id: string) {
  if (!uuid(id)) return null;
  const db = createPublicClient();
  const { data, error } = await db
    .from("classes")
    .select(publicDetailColumns)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw Error("클래스를 불러오지 못했습니다.");
  if (!data || data.is_published !== true) return null;
  const summary = toSummary(data);
  return {
    ...summary,
    video_url: publicVideoHref(data.video_url),
  } satisfies PublicClassDetail;
}

export async function adminClassList(page: number, status = "") {
  if (!(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  let query = db.from("classes").select(columns, { count: "exact" });
  if (status) query = query.eq("is_published", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (rangeError(error, page)) {
    let total = db.from("classes").select("id", { head: true, count: "exact" });
    if (status) total = total.eq("is_published", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as ClassRecord[], count: result.count };
  }
  if (error || !data || count === null)
    throw Error("클래스 목록을 불러오지 못했습니다.");
  return { data: data as ClassRecord[], count: count || 0 };
}

export async function adminClassDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return { missing: true as const };
  const db = await createClient();
  const { data, error } = await db
    .from("classes")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: true as const };
  if (!data) return { missing: true as const };
  return { row: data as ClassRecord };
}

function toSummary(row: {
  id: string;
  title: string;
  description: string;
  field: string;
  sort_order: number;
  created_at: string;
}): PublicClassSummary {
  if (!fieldLabel(row.field)) throw Error("클래스를 불러오지 못했습니다.");
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    field: row.field as PublicClassSummary["field"],
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}
