import "server-only";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  columns,
  pageSize,
  uuid,
  type ProductCounselor,
  type ProductRecord,
} from "./rules";

const counselorColumns = "id,slug,name,is_active,approval_status";

export async function counselorProductAdminList(
  counselorId: string,
  page: number,
  status = "",
) {
  if (!(await requireAdmin())) return null;
  if (
    !uuid(counselorId) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 9999999 ||
    !["", "public", "private"].includes(status)
  )
    throw Error("목록 조건이 올바르지 않습니다.");
  const db = await createClient();
  const counselor = await db
    .from("counselors")
    .select(counselorColumns)
    .eq("id", counselorId)
    .maybeSingle();
  if (counselor.error) return { error: true as const };
  if (!counselor.data) return { missing: true as const };
  let query = db
    .from("consult_products")
    .select(columns, { count: "exact" })
    .eq("counselor_id", counselorId);
  if (status) query = query.eq("is_active", status === "public");
  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error?.code === "PGRST103" && page > 1) {
    let total = db
      .from("consult_products")
      .select("id", { head: true, count: "exact" })
      .eq("counselor_id", counselorId);
    if (status) total = total.eq("is_active", status === "public");
    const result = await total;
    if (!result.error && result.count !== null)
      return {
        counselor: counselor.data as ProductCounselor,
        data: [] as ProductRecord[],
        count: result.count,
      };
  }
  if (error || !data || count === null) return { error: true as const };
  return {
    counselor: counselor.data as ProductCounselor,
    data: data as ProductRecord[],
    count: count || 0,
  };
}

export async function counselorProductAdminContext(
  counselorId: string,
  productId: string | null,
) {
  if (!(await requireAdmin())) return null;
  if (!uuid(counselorId) || (productId !== null && !uuid(productId)))
    return { missing: true as const };
  const db = await createClient();
  const counselor = await db
    .from("counselors")
    .select(counselorColumns)
    .eq("id", counselorId)
    .maybeSingle();
  if (counselor.error) return { error: true as const };
  if (!counselor.data) return { missing: true as const };
  if (!productId)
    return {
      counselor: counselor.data as ProductCounselor,
      product: null,
    };
  const product = await db
    .from("consult_products")
    .select(columns)
    .eq("id", productId)
    .maybeSingle();
  if (product.error) return { error: true as const };
  if (!product.data || product.data.counselor_id !== counselorId)
    return { missing: true as const };
  return {
    counselor: counselor.data as ProductCounselor,
    product: product.data as ProductRecord,
  };
}
