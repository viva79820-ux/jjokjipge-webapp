import "server-only";
import { requireAdmin } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { parseSupportFilters, uuid, type Filters } from "./support-rules";
import type { FaqRow, InquiryDetail, InquirySummary } from "./support-types";
export const faqColumns =
  "id,category,question,answer,sort_order,is_active,updated_at";
export const inquiryColumns =
  "id,inquiry_no,customer_name,category,created_at,status,customer_email,customer_phone,reservation_no,content,answer,answered_at,updated_at";
export async function getFaqList(filters: Filters) {
  if (!(await requireAdmin())) return null;
  if (
    !parseSupportFilters("faqs", {
      category: filters.category,
      status: filters.status,
      page: String(filters.page),
    })
  )
    throw new Error("잘못된 조건입니다.");
  const db = await createClient();
  let q = db
    .from("faqs")
    .select("id,category,question,sort_order,is_active", { count: "exact" });
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("is_active", filters.status === "public");
  const { data, error, count } = await q
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .range((filters.page - 1) * 20, filters.page * 20 - 1)
    .returns<Omit<FaqRow, "answer" | "updated_at">[]>();
  if (error?.code === "PGRST103" && filters.page > 1) {
    let countQuery = db
      .from("faqs")
      .select("id", { count: "exact", head: true });
    if (filters.category)
      countQuery = countQuery.eq("category", filters.category);
    if (filters.status)
      countQuery = countQuery.eq("is_active", filters.status === "public");
    const total = await countQuery;
    if (!total.error && total.count !== null)
      return { data: [], count: total.count };
  }
  if (error || !data || count === null)
    throw new Error("FAQ 목록을 불러오지 못했습니다.");
  return { data, count };
}
export async function getInquiryList(filters: Filters) {
  if (!(await requireAdmin())) return null;
  if (
    !parseSupportFilters("inquiries", {
      category: filters.category,
      status: filters.status,
      page: String(filters.page),
    })
  )
    throw new Error("잘못된 조건입니다.");
  const db = await createClient();
  let q = db
    .from("inquiries")
    .select("id,inquiry_no,customer_name,category,created_at,status", {
      count: "exact",
    });
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.status) q = q.eq("status", filters.status);
  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((filters.page - 1) * 20, filters.page * 20 - 1)
    .returns<InquirySummary[]>();
  if (error?.code === "PGRST103" && filters.page > 1) {
    let countQuery = db
      .from("inquiries")
      .select("id", { count: "exact", head: true });
    if (filters.category)
      countQuery = countQuery.eq("category", filters.category);
    if (filters.status) countQuery = countQuery.eq("status", filters.status);
    const total = await countQuery;
    if (!total.error && total.count !== null)
      return { data: [], count: total.count };
  }
  if (error || !data || count === null)
    throw new Error("문의 목록을 불러오지 못했습니다.");
  return { data, count };
}
export async function getFaqDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return null;
  const { data, error } = await (
    await createClient()
  )
    .from("faqs")
    .select(faqColumns)
    .eq("id", id)
    .returns<FaqRow[]>()
    .maybeSingle();
  if (error) throw new Error("FAQ를 불러오지 못했습니다.");
  return data;
}
export async function getInquiryDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!uuid(id)) return null;
  const { data, error } = await (
    await createClient()
  )
    .from("inquiries")
    .select(inquiryColumns)
    .eq("id", id)
    .returns<InquiryDetail[]>()
    .maybeSingle();
  if (error) throw new Error("문의를 불러오지 못했습니다.");
  return data;
}
