import { isValidEmail } from "@/lib/reservations/rules";
import type { OrderLookupErrors, OrderLookupValues } from "./types";

export const orderLookupMismatch = "주문번호와 이메일을 다시 확인해 주세요.";
export const orderLookupFailure =
  "주문을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.";

function hasBlockedControl(value: string) {
  return /[\u0000-\u0008\u000E-\u001F\u007F]/.test(value);
}

export function normalizeOrderNo(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeOrderLookupEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidOrderNo(value: string) {
  if (value.length > 40 || hasBlockedControl(value)) return false;
  const normalized = normalizeOrderNo(value);
  if (!/^O-[0-9]{8}-[0-9]{4,10}$/.test(normalized)) return false;
  const ymd = normalized.slice(2, 10);
  const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  if (date < "0001-01-01") return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return false;
  const serial = normalized.slice(11);
  const number = Number(serial);
  return (
    Number.isSafeInteger(number) &&
    number >= 1 &&
    number <= 2147483647 &&
    serial === String(number).padStart(4, "0")
  );
}

export function isValidOrderLookupEmail(value: string) {
  return (
    value.length <= 320 && !hasBlockedControl(value) && isValidEmail(value)
  );
}

export function validateOrderLookupValues(
  values: OrderLookupValues,
): OrderLookupErrors {
  const errors: OrderLookupErrors = {};
  if (!isValidOrderNo(values.orderNo))
    errors.orderNo = "주문번호를 O-20261125-0001 형식으로 입력해 주세요.";
  if (!isValidOrderLookupEmail(values.email))
    errors.email = "올바른 이메일 주소를 254자 이내로 입력해 주세요.";
  return errors;
}

function scalar(form: FormData, key: string) {
  const entries = form.getAll(key);
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : null;
}

export function validateOrderLookup(form: FormData) {
  const orderNo = scalar(form, "orderNo");
  const email = scalar(form, "email");
  const raw = { orderNo: orderNo ?? "", email: email ?? "" };
  const errors = validateOrderLookupValues(raw);
  if (orderNo === null)
    errors.orderNo = "주문번호를 하나의 텍스트로 입력해 주세요.";
  if (email === null) errors.email = "이메일을 하나의 텍스트로 입력해 주세요.";
  return {
    errors,
    values: {
      orderNo: normalizeOrderNo(raw.orderNo),
      email: normalizeOrderLookupEmail(raw.email),
    },
  };
}
