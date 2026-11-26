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
  shopCategoryFilters,
  uuid,
  type ProductRecord,
  type PublicProductDetail,
  type PublicProductSummary,
} from "./rules";

function rangeError(error: { code?: string } | null, page: number) {
  return error?.code === "PGRST103" && page > 1;
}

export async function publicProductList(page: number, category = "") {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !shopCategoryFilters.some((item) => item.value === category)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = createPublicClient();
  let listed = db
    .from("products")
    .select(publicListColumns, { count: "exact" })
    .eq("is_published", true);
  // 이름 조건은 shopCategoryOf와 같다. 천사부적이 오라클·타로보다 먼저다.
  if (category === "charm") listed = listed.ilike("name", "%천사부적%");
  else if (category === "oracle")
    listed = listed
      .ilike("name", "%오라클%")
      .not("name", "ilike", "%천사부적%");
  else if (category === "tarot")
    listed = listed
      .ilike("name", "%타로%")
      .not("name", "ilike", "%천사부적%")
      .not("name", "ilike", "%오라클%");
  const { data, error, count } = await listed
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (rangeError(error, page)) {
    let total = db
      .from("products")
      .select("id", { head: true, count: "exact" })
      .eq("is_published", true);
    if (category === "charm") total = total.ilike("name", "%천사부적%");
    else if (category === "oracle")
      total = total
        .ilike("name", "%오라클%")
        .not("name", "ilike", "%천사부적%");
    else if (category === "tarot")
      total = total
        .ilike("name", "%타로%")
        .not("name", "ilike", "%천사부적%")
        .not("name", "ilike", "%오라클%");
    const result = await total;
    if (!result.error && result.count !== null)
      return { data: [] as PublicProductSummary[], count: result.count };
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
  const idList: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!uuid(id) || seen.has(id)) return { ok: false as const };
    seen.add(id);
    idList.push(id);
  }
  if (!idList.length) return { ok: true as const, products: [] };
  const db = createPublicClient();
  const { data, error } = await db
    .from("products")
    .select(publicDetailColumns)
    .eq("is_published", true)
    .in("id", idList);
  if (error || !data) throw Error("상품을 불러오지 못했습니다.");
  const byId = new Map<string, PublicProductDetail>();
  for (const item of data) {
    const row = publicDetail(item);
    if (!row || !seen.has(row.id) || byId.has(row.id))
      throw Error("상품을 불러오지 못했습니다.");
    byId.set(row.id, row);
  }
  return {
    ok: true as const,
    products: idList.map((id) => byId.get(id) ?? null),
  };
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
