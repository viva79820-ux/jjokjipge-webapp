import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { maxCartLines } from "./cart";
import {
  columns,
  pageSize,
  productRecord,
  publicDetail,
  publicDetailColumns,
  publicListColumns,
  publicSummary,
  uuid,
  type ProductRecord,
  type PublicProductSummary,
} from "./rules";

function rangeError(error: { code?: string } | null, page: number) {
  return error?.code === "PGRST103" && page > 1;
}

export async function publicProductList(page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 9999999)
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = createPublicClient();
  const { data, error, count } = await db
    .from("products")
    .select(publicListColumns, { count: "exact" })
    .eq("is_published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (rangeError(error, page)) {
    const total = await db
      .from("products")
      .select("id", { head: true, count: "exact" })
      .eq("is_published", true);
    if (!total.error && total.count !== null)
      return { data: [] as PublicProductSummary[], count: total.count };
  }
  if (error || !data || count === null)
    throw Error("상품 목록을 불러오지 못했습니다.");
  const rows = data.map((row) => publicSummary(row));
  if (rows.some((row) => !row)) throw Error("상품 목록을 불러오지 못했습니다.");
  return {
    data: rows as PublicProductSummary[],
    count: count || 0,
  };
}

export async function publicProductDetail(id: string) {
  if (!uuid(id)) return null;
  const db = createPublicClient();
  const { data, error } = await db
    .from("products")
    .select(publicDetailColumns)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw Error("상품을 불러오지 못했습니다.");
  if (!data) return null;
  const row = publicDetail(data);
  if (!row) throw Error("상품을 불러오지 못했습니다.");
  return row;
}

export async function publicCartProducts(ids: unknown) {
  if (!Array.isArray(ids) || ids.length > maxCartLines)
    return { ok: false as const };
  const seen = new Set<string>();
  for (const id of ids) {
    if (!uuid(id) || seen.has(id)) return { ok: false as const };
    seen.add(id);
  }
  const products: Array<Awaited<ReturnType<typeof publicProductDetail>>> = [];
  for (const id of ids) products.push(await publicProductDetail(id));
  return { ok: true as const, products };
}

export async function adminProductList(page: number, status = "") {
  if (!(await requireAdmin())) return null;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  let query = db.from("products").select(columns, { count: "exact" });
  if (status) query = query.eq("is_published", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (rangeError(error, page)) {
    let total = db
      .from("products")
      .select("id", { head: true, count: "exact" });
    if (status) total = total.eq("is_published", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as ProductRecord[], count: result.count };
  }
  if (error || !data || count === null)
    throw Error("상품 목록을 불러오지 못했습니다.");
  const rows = data.map((row) => productRecord(row));
  if (rows.some((row) => !row)) throw Error("상품 목록을 불러오지 못했습니다.");
  return { data: rows as ProductRecord[], count: count || 0 };
}

export async function adminProductDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return { missing: true as const };
  const db = await createClient();
  const { data, error } = await db
    .from("products")
    .select(columns)
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: true as const };
  if (!data) return { missing: true as const };
  const row = productRecord(data);
  if (!row) return { error: true as const };
  return { row };
}
