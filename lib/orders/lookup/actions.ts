"use server";

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "../types";
import type {
  OrderLookupItem,
  OrderLookupResult,
  OrderLookupState,
} from "./types";
import {
  orderLookupFailure,
  orderLookupMismatch,
  validateOrderLookup,
} from "./validation";

const lookupColumns =
  "order_no,status,postal_code,address_line1,address_line2,subtotal,shipping_fee,total,tracking_number,order_items(line_no,product_name,unit_price,quantity,line_total)";
const statuses = new Set<OrderStatus>([
  "pending_payment",
  "payment_confirmed",
  "shipping",
  "completed",
  "cancelled",
]);

function hasBlockedControl(value: string) {
  return /[\u0000-\u0008\u000E-\u001F\u007F]/.test(value);
}

function publicText(value: unknown, maximum: number) {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    hasBlockedControl(value)
  )
    return null;
  const trimmed = value.trim();
  return trimmed || null;
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

function publicItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    return null;
  const lines: { lineNo: number; item: OrderLookupItem }[] = [];
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
      item: { name, unitPrice, quantity, lineTotal },
    });
  }
  lines.sort((left, right) => left.lineNo - right.lineNo);
  if (new Set(lines.map(({ lineNo }) => lineNo)).size !== lines.length)
    return null;
  return lines.map(({ item }) => item);
}

function toPublicResult(
  value: unknown,
  orderNo: string,
): OrderLookupResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.order_no !== orderNo ||
    typeof row.status !== "string" ||
    !statuses.has(row.status as OrderStatus)
  )
    return null;
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
  const items = publicItems(row.order_items);
  if (
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
    ((row.status === "shipping" || row.status === "completed") &&
      !trackingNumber)
  )
    return null;
  const result: OrderLookupResult = {
    orderNo,
    status: row.status as OrderStatus,
    items,
    subtotal,
    shippingFee,
    total,
    postalCode,
    addressLine1,
  };
  if (addressLine2) result.addressLine2 = addressLine2;
  if (trackingNumber) result.trackingNumber = trackingNumber;
  return result;
}

export async function lookupOrder(form: FormData): Promise<OrderLookupState> {
  if (!(form instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateOrderLookup(form);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    const { data, error } = await createAdminClient()
      .from("orders")
      .select(lookupColumns)
      .eq("order_no", values.orderNo)
      .eq("customer_email", values.email)
      .maybeSingle();
    if (error) return { message: orderLookupFailure };
    if (!data) return { message: orderLookupMismatch };
    const result = toPublicResult(data, values.orderNo);
    return result ? { result } : { message: orderLookupFailure };
  } catch {
    return { message: orderLookupFailure };
  }
}
