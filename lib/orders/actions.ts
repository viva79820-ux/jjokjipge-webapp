"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { orderConfig } from "@/lib/order-config";
import {
  isOrderNumber,
  orderInputMessage,
  parseOrderForm,
  staleOrderMessage,
} from "./rules";
import type { OrderField, OrderState, OrderStatus } from "./types";

const failureMessage = "주문을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.";
const statuses = new Set<OrderStatus>([
  "pending_payment",
  "payment_confirmed",
  "shipping",
  "completed",
  "cancelled",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

const inputFields: OrderField[] = [
  "name",
  "phone",
  "email",
  "postalCode",
  "addressLine1",
  "addressLine2",
  "privacyConsent",
];

function hasOrderInputError(errors: OrderState["errors"]) {
  return inputFields.some((field) => Boolean(errors?.[field]));
}

function resultRow(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const subtotal = storedAmount(row.subtotal_amount, 1, 6378026431590);
  const shippingFee = storedAmount(row.shipping_fee_amount, 0, 2147483647);
  const total = storedAmount(row.total_amount, 1, 6380173915237);
  if (
    !isOrderNumber(row.order_number) ||
    subtotal === null ||
    shippingFee === null ||
    total === null ||
    total !== subtotal + shippingFee ||
    typeof row.order_status !== "string" ||
    !statuses.has(row.order_status as OrderStatus) ||
    typeof row.replayed !== "boolean"
  )
    return null;
  return {
    orderNo: row.order_number,
    subtotal,
    shippingFee,
    total,
    status: row.order_status as OrderStatus,
    replayed: row.replayed,
  };
}

function safeOrderError(error: { code?: string; message?: string } | null) {
  if (error?.code !== "P0001") return null;
  if (error.message?.includes("ORDER_PRODUCT_SOLD_OUT"))
    return "품절된 상품이 있어요. 장바구니를 다시 확인해 주세요.";
  if (error.message?.includes("ORDER_PRODUCT_UNAVAILABLE"))
    return "판매가 중지되었거나 찾을 수 없는 상품이 있어요. 장바구니를 다시 확인해 주세요.";
  if (error.message?.includes("ORDER_IDEMPOTENCY_CONFLICT"))
    return "이미 처리한 주문과 내용이 달라요. 주문서를 새로고침해 주세요.";
  return null;
}

export async function createOrder(
  _previous: OrderState,
  formData: FormData,
): Promise<OrderState> {
  const parsed = parseOrderForm(formData);
  if (parsed.stale) return { message: staleOrderMessage };
  if (!parsed.values)
    return hasOrderInputError(parsed.errors)
      ? { errors: parsed.errors, message: orderInputMessage }
      : { errors: parsed.errors };

  try {
    const auth = await createClient();
    const { data: claims, error: authError } = await auth.auth.getClaims();
    if (authError && authError.name !== "AuthSessionMissingError")
      throw authError;
    const subject = claims?.claims?.sub;
    const userId =
      typeof subject === "string" && uuidPattern.test(subject.toLowerCase())
        ? subject.toLowerCase()
        : null;
    const values = parsed.values;
    const { data, error } = await createAdminClient().rpc("create_shop_order", {
      p_request_key: values.requestKey,
      p_user_id: userId,
      p_customer_name: values.name,
      p_customer_phone: values.phone,
      p_customer_email: values.email,
      p_postal_code: values.postalCode,
      p_address_line1: values.addressLine1,
      p_address_line2: values.addressLine2,
      p_shipping_fee: orderConfig.shippingFee,
      p_items: values.lines.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
      })),
    });
    if (error)
      return {
        message: safeOrderError(error) ?? failureMessage,
      };
    if (!Array.isArray(data) || data.length !== 1) throw Error("ORDER_RESULT");
    const success = resultRow(data[0]);
    if (!success) throw Error("ORDER_RESULT");
    return { success };
  } catch {
    return { message: failureMessage };
  }
}
