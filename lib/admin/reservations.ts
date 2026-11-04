import "server-only";
import { requireAdmin } from "./auth";
import { createClient } from "@/lib/supabase/server";
import {
  dayStart,
  dayEndExclusive,
  isUuid,
  PAGE_SIZE,
  type Filters,
  type ReservationStatus,
} from "./reservation-rules";

export type ReservationSummary = {
  id: string;
  reservation_no: string;
  starts_at: string;
  customer_name: string;
  status: ReservationStatus;
  product_name: string;
  price: number;
  counselors: { name: string } | null;
};
export const summaryColumns =
  "id,reservation_no,starts_at,customer_name,status,product_name,price,counselors(name)";
export type ReservationDetail = ReservationSummary & {
  minutes: number;
  ends_at: string;
  created_at: string;
  updated_at: string;
  customer_phone: string;
  customer_email: string;
  payment_method: string;
  depositor_name: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  counselors: { name: string; stores: { name: string } | null } | null;
};
export async function getReservationList(filters: Filters) {
  if (!(await requireAdmin())) return null;
  const db = await createClient();
  const { data: counselors, error: counselorError } = await db
    .from("counselors")
    .select("id,name")
    .order("sort_order")
    .order("id");
  if (counselorError || !counselors)
    throw new Error("상담사 목록을 불러오지 못했습니다.");
  if (filters.counselor && !counselors.some((c) => c.id === filters.counselor))
    return { invalid: true as const };
  let query = db
    .from("reservations")
    .select(summaryColumns, { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.excludeCancelled) query = query.neq("status", "cancelled");
  if (filters.from) query = query.gte("starts_at", dayStart(filters.from));
  if (filters.to) query = query.lt("starts_at", dayEndExclusive(filters.to));
  if (filters.counselor) query = query.eq("counselor_id", filters.counselor);
  const { data, error, count } = await query
    .order("starts_at", { ascending: false })
    .order("id", { ascending: false })
    .range((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE - 1)
    .returns<ReservationSummary[]>();
  if (error || !data || count === null)
    throw new Error("예약 목록을 불러오지 못했습니다.");
  return { invalid: false as const, data, count, counselors };
}
export async function getReservationDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!isUuid(id)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("reservations")
    .select(
      "id,reservation_no,starts_at,ends_at,customer_name,status,product_name,minutes,price,created_at,updated_at,customer_phone,customer_email,payment_method,depositor_name,confirmed_at,completed_at,cancelled_at,cancel_reason,counselors(name,stores(name))",
    )
    .eq("id", id)
    .returns<ReservationDetail[]>()
    .maybeSingle();
  if (error) throw new Error("예약 상세를 불러오지 못했습니다.");
  return data;
}
