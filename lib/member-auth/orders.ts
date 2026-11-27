import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isOrderNumber } from "@/lib/orders/rules";
import type { OrderStatus } from "@/lib/orders/types";

export type MemberOrderItem = {
  name: string;
  quantity: number;
};

export type MemberOrderLine = MemberOrderItem & {
  unitPrice: number;
  lineTotal: number;
};

export type MemberOrderSummary = {
  id: string;
  orderNo: string;
  orderedAt: string;
  orderedAtLabel: string;
  status: OrderStatus;
  total: number;
  items: MemberOrderItem[];
};

export type MemberOrderDetail = {
  id: string;
  orderNo: string;
  orderedAt: string;
  orderedAtLabel: string;
  status: OrderStatus;
  items: MemberOrderLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
  postalCode: string;
  addressLine1: string;
  addressLine2?: string;
  trackingNumber?: string;
};

const loadError = "주문 내역을 불러오지 못했어요.";
const summaryColumns =
  "id,user_id,order_no,created_at,status,total,order_items(line_no,product_name,quantity)";
const detailColumns =
  "id,user_id,order_no,created_at,status,postal_code,address_line1,address_line2,subtotal,shipping_fee,total,tracking_number,order_items(line_no,product_name,unit_price,quantity,line_total)";
const userIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const statuses = new Set<OrderStatus>([
  "pending_payment",
  "payment_confirmed",
  "shipping",
  "completed",
  "cancelled",
]);
const seoulOrderDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function normalizeUserId(value: string) {
  const id = value.toLowerCase();
  return userIdPattern.test(id) ? id : null;
}

function sameUser(value: unknown, memberId: string) {
  return typeof value === "string" && value.toLowerCase() === memberId;
}

function storedAmount(value: unknown, minimum: number, maximum: number) {
  const text =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  const matched = /^(0|[1-9]\d*)(?:\.0+)?$/.exec(text);
  if (!matched) return null;
  const amount = Number(matched[1]);
  return Number.isSafeInteger(amount) && amount >= minimum && amount <= maximum
    ? amount
    : null;
}

function publicText(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length > maximum) return null;
  if (/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/.test(value)) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function formatOrderDate(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    label: seoulOrderDate.format(date),
  };
}

function orderIdentity(row: Record<string, unknown>, memberId: string) {
  const id = publicText(row.id, 36)?.toLowerCase();
  const orderedAt = formatOrderDate(row.created_at);
  if (
    !sameUser(row.user_id, memberId) ||
    !id ||
    !userIdPattern.test(id) ||
    !isOrderNumber(row.order_no) ||
    !orderedAt ||
    typeof row.status !== "string" ||
    !statuses.has(row.status as OrderStatus)
  )
    return null;
  return {
    id,
    orderNo: row.order_no,
    orderedAt: orderedAt.iso,
    orderedAtLabel: orderedAt.label,
    status: row.status as OrderStatus,
  };
}

function summaryItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    return null;
  const lines: { lineNo: number; item: MemberOrderItem }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const name = publicText(row.product_name, 100);
    const lineNo = storedAmount(row.line_no, 1, 30);
    const quantity = storedAmount(row.quantity, 1, 99);
    if (!name || lineNo === null || quantity === null) return null;
    lines.push({ lineNo, item: { name, quantity } });
  }
  lines.sort((left, right) => left.lineNo - right.lineNo);
  if (new Set(lines.map(({ lineNo }) => lineNo)).size !== lines.length)
    return null;
  return lines.map(({ item }) => item);
}

function detailItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    return null;
  const lines: { lineNo: number; item: MemberOrderLine }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    const name = publicText(row.product_name, 100);
    const lineNo = storedAmount(row.line_no, 1, 30);
    const unitPrice = storedAmount(row.unit_price, 1, 2147483647);
    const quantity = storedAmount(row.quantity, 1, 99);
    const lineTotal = storedAmount(row.line_total, 1, 6378026431590);
    if (
      !name ||
      lineNo === null ||
      unitPrice === null ||
      quantity === null ||
      lineTotal === null ||
      lineTotal !== unitPrice * quantity
    )
      return null;
    lines.push({
      lineNo,
      item: { name, quantity, unitPrice, lineTotal },
    });
  }
  lines.sort((left, right) => left.lineNo - right.lineNo);
  if (new Set(lines.map(({ lineNo }) => lineNo)).size !== lines.length)
    return null;
  return lines.map(({ item }) => item);
}

export function parseMemberOrderSummary(
  value: unknown,
  memberId: string,
): MemberOrderSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const identity = orderIdentity(row, memberId);
  const total = storedAmount(row.total, 1, 6380173915237);
  const items = summaryItems(row.order_items);
  if (!identity || total === null || !items) return null;
  return { ...identity, total, items };
}

export function parseMemberOrderDetail(
  value: unknown,
  memberId: string,
): MemberOrderDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const identity = orderIdentity(row, memberId);
  const postalCode =
    typeof row.postal_code === "string" && /^[0-9]{5}$/.test(row.postal_code)
      ? row.postal_code
      : null;
  const addressLine1 = publicText(row.address_line1, 200);
  const addressLine2 =
    row.address_line2 === null ? undefined : publicText(row.address_line2, 200);
  const subtotal = storedAmount(row.subtotal, 1, 6378026431590);
  const shippingFee = storedAmount(row.shipping_fee, 0, 2147483647);
  const total = storedAmount(row.total, 1, 6380173915237);
  const items = detailItems(row.order_items);
  if (
    !identity ||
    !postalCode ||
    !addressLine1 ||
    (row.address_line2 !== null) === !addressLine2 ||
    subtotal === null ||
    shippingFee === null ||
    total === null ||
    total !== subtotal + shippingFee ||
    !items ||
    items.reduce((sum, item) => sum + item.lineTotal, 0) !== subtotal
  )
    return null;
  const trackingNumber =
    row.tracking_number === null
      ? undefined
      : publicText(row.tracking_number, 100);
  if (
    (row.tracking_number !== null) === !trackingNumber ||
    ((identity.status === "shipping" || identity.status === "completed") &&
      !trackingNumber)
  )
    return null;
  const detail: MemberOrderDetail = {
    ...identity,
    items,
    subtotal,
    shippingFee,
    total,
    postalCode,
    addressLine1,
  };
  if (addressLine2) detail.addressLine2 = addressLine2;
  if (trackingNumber) detail.trackingNumber = trackingNumber;
  return detail;
}

function ownedRows(rows: unknown[], memberId: string) {
  return rows.every((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    return sameUser((row as { user_id?: unknown }).user_id, memberId);
  });
}

export async function getMemberOrders(memberId: string) {
  const id = normalizeUserId(memberId);
  if (!id) throw new Error(loadError);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(summaryColumns)
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<unknown[]>();
  if (error || !Array.isArray(data) || !ownedRows(data, id))
    throw new Error(loadError);
  const orders = data.map((row) => parseMemberOrderSummary(row, id));
  if (orders.some((order) => !order)) throw new Error(loadError);
  return orders as MemberOrderSummary[];
}

export async function getMemberOrder(memberId: string, orderNo: string) {
  const id = normalizeUserId(memberId);
  if (!id) throw new Error(loadError);
  if (!isOrderNumber(orderNo)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(detailColumns)
    .eq("user_id", id)
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error) throw new Error(loadError);
  if (!data || !ownedRows([data], id)) return null;
  const order = parseMemberOrderDetail(data, id);
  if (!order || order.orderNo !== orderNo) throw new Error(loadError);
  return order;
}
