import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import {
  isOrderUuid,
  ORDER_PAGE_SIZE,
  type AdminOrderStatus,
  type OrderFilters,
} from "./order-rules";

export type AdminOrderSummary = {
  id: string;
  order_no: string;
  customer_name: string;
  status: AdminOrderStatus;
  total: number;
  tracking_number: string | null;
  created_at: string;
};

const summaryColumns =
  "id,order_no,customer_name,status,total,tracking_number,created_at";

export type AdminOrderDetail = AdminOrderSummary & {
  updated_at: string;
  customer_phone: string;
  customer_email: string;
  postal_code: string;
  address_line1: string;
  address_line2: string | null;
  subtotal: number;
  shipping_fee: number;
  payment_confirmed_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  order_items: {
    line_no: number;
    product_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }[];
};

export async function getOrderList(filters: OrderFilters) {
  if (!(await requireAdmin())) return null;
  const db = await createClient();
  let query = db.from("orders").select(summaryColumns, { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(
      (filters.page - 1) * ORDER_PAGE_SIZE,
      filters.page * ORDER_PAGE_SIZE - 1,
    )
    .returns<AdminOrderSummary[]>();
  if (error || !data || count === null)
    throw new Error("주문 목록을 불러오지 못했습니다.");
  return { data, count };
}

export async function getOrderDetail(id: string) {
  if (!(await requireAdmin())) return null;
  if (!isOrderUuid(id)) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("orders")
    .select(
      "id,order_no,customer_name,status,total,tracking_number,created_at,updated_at,customer_phone,customer_email,postal_code,address_line1,address_line2,subtotal,shipping_fee,payment_confirmed_at,shipped_at,completed_at,cancelled_at,order_items(line_no,product_name,unit_price,quantity,line_total)",
    )
    .eq("id", id)
    .order("line_no", { referencedTable: "order_items" })
    .returns<AdminOrderDetail[]>()
    .maybeSingle();
  if (error) throw new Error("주문 상세를 불러오지 못했습니다.");
  return data;
}
