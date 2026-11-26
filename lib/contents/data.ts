import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { loadExternalContents } from "./feed-load";
import { mergePublicContents } from "./feeds";
import {
  columns,
  contentRecord,
  pageSize,
  presentPublic,
  publicColumns,
  uuid,
  type Channel,
  type ContentRecord,
  type PublicCard,
  type PublishStatus,
} from "./rules";

export type PublicList =
  | { error: true }
  | {
      error: false;
      rows: PublicCard[];
      count: number;
      catalogTotal: number;
    };

export type AdminList =
  | { error: true }
  | {
      error: false;
      rows: ContentRecord[];
      count: number;
      catalogTotal: number;
    };

function outOfRange(error: { code?: string } | null, page: number) {
  return error?.code === "PGRST103" && page > 1;
}

export async function publicContentList(
  page: number,
  channel: Channel | "" = "",
): Promise<PublicList> {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    (channel !== "" &&
      channel !== "blog" &&
      channel !== "instagram" &&
      channel !== "youtube")
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = createPublicClient();
  const stored: Parameters<typeof presentPublic>[0][] = [];
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await db
      .from("contents")
      .select(publicColumns)
      .eq("is_published", true)
      .order("posted_on", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(from, from + 999);
    if (error || !data) return { error: true };
    stored.push(...data);
    if (data.length < 1000) break;
  }
  const admin = stored
    .map((row) => presentPublic(row))
    .filter((row): row is PublicCard => row !== null);
  let external: Awaited<ReturnType<typeof loadExternalContents>> = {
    blog: [],
    youtube: [],
  };
  try {
    external = await loadExternalContents();
  } catch {
    external = { blog: [], youtube: [] };
  }
  const merged = mergePublicContents(admin, external);
  const filtered = channel
    ? merged.filter((row) => row.channel === channel)
    : merged;
  const start = (page - 1) * pageSize;
  return {
    error: false,
    rows: filtered.slice(start, start + pageSize),
    count: filtered.length,
    catalogTotal: merged.length,
  };
}

export async function adminContentList(
  page: number,
  status: PublishStatus = "",
): Promise<AdminList | null> {
  if (!(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  let query = db.from("contents").select(columns, { count: "exact" });
  if (status) query = query.eq("is_published", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("posted_on", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (outOfRange(error, page)) {
    let total = db
      .from("contents")
      .select("id", { head: true, count: "exact" });
    if (status) total = total.eq("is_published", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return {
        error: false,
        rows: [],
        count: result.count,
        catalogTotal: result.count,
      };
  }
  if (error || !data || count === null) return { error: true };
  const rows = data
    .map((row) => contentRecord(row))
    .filter((row): row is ContentRecord => row !== null);
  if (rows.length !== data.length) return { error: true };
  if (count > 0 || !status)
    return { error: false, rows, count, catalogTotal: count };
  const catalog = await db
    .from("contents")
    .select("id", { head: true, count: "exact" });
  if (catalog.error || catalog.count === null) return { error: true };
  return {
    error: false,
    rows,
    count,
    catalogTotal: catalog.count,
  };
}

export async function adminContent(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return { missing: true as const };
  const db = await createClient();
  const { data, error } = await db
    .from("contents")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: true as const };
  if (!data) return { missing: true as const };
  const row = contentRecord(data);
  if (!row) return { error: true as const };
  return { row };
}
