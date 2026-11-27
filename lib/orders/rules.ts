import { orderConfig } from "@/lib/order-config";
import { formatPhone, isValidEmail } from "@/lib/reservations/rules";
import type { OrderField, OrderLineInput, OrderState } from "./types";

export const staleOrderMessage =
  "주문서가 갱신됐어요. 새로고침 후 다시 주문해 주세요.";
export const orderInputMessage = "입력한 주문 정보를 확인해 주세요.";

export function unrecognizedOrderState(error: unknown): OrderState | null {
  if (!error || typeof error !== "object") return null;
  const name = "name" in error ? error.name : undefined;
  const message = "message" in error ? error.message : undefined;
  if (
    name === "UnrecognizedActionError" ||
    (typeof message === "string" &&
      (message.includes("Failed to find Server Action") ||
        message.includes("was not found on the server")))
  )
    return { message: staleOrderMessage };
  return null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const controlPattern = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
const maxItemsLength = 5000;

function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function cleanSingleLine(
  value: string | null,
  field: OrderField,
  label: string,
  maxLength: number,
  errors: NonNullable<OrderState["errors"]>,
) {
  if (value === null || controlPattern.test(value)) {
    errors[field] = `${label}을(를) 한 칸의 글자로 입력해 주세요.`;
    return "";
  }
  const cleaned = value.trim();
  if (!cleaned || Array.from(cleaned).length > maxLength) {
    errors[field] = `${label}은(는) 1~${maxLength}자로 입력해 주세요.`;
    return "";
  }
  return cleaned;
}

function parseLines(
  raw: string | null,
  errors: NonNullable<OrderState["errors"]>,
): OrderLineInput[] {
  if (raw === null || raw.length > maxItemsLength) {
    errors.items = "주문할 상품을 장바구니에서 다시 확인해 주세요.";
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    errors.items = "주문할 상품을 장바구니에서 다시 확인해 주세요.";
    return [];
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > orderConfig.maxLines
  ) {
    errors.items = "주문할 상품을 장바구니에서 다시 확인해 주세요.";
    return [];
  }
  const lines: OrderLineInput[] = [];
  const seen = new Set<string>();
  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.items = "주문할 상품을 장바구니에서 다시 확인해 주세요.";
      return [];
    }
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 2 ||
      !Object.hasOwn(row, "id") ||
      !Object.hasOwn(row, "quantity") ||
      typeof row.id !== "string"
    ) {
      errors.items = "상품 정보에는 상품과 수량만 보내 주세요.";
      return [];
    }
    const id = row.id.toLowerCase();
    if (
      !uuidPattern.test(id) ||
      seen.has(id) ||
      typeof row.quantity !== "number" ||
      !Number.isInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > orderConfig.maxQuantity
    ) {
      errors.items = "주문할 상품과 수량을 장바구니에서 다시 확인해 주세요.";
      return [];
    }
    seen.add(id);
    lines.push({ productId: id, quantity: row.quantity });
  }
  return lines;
}

export function parseOrderForm(input: unknown) {
  const errors: NonNullable<OrderState["errors"]> = {};
  if (!(input instanceof FormData)) {
    errors.items = "주문 내용을 다시 확인해 주세요.";
    return { errors, values: null, stale: false };
  }

  const requestKey = scalar(input, "requestKey")?.toLowerCase() ?? "";
  if (!uuidPattern.test(requestKey))
    return { errors: {}, values: null, stale: true };

  const name = cleanSingleLine(
    scalar(input, "name"),
    "name",
    "주문자 이름",
    30,
    errors,
  );
  const phoneText = scalar(input, "phone");
  const phoneDigits = phoneText?.replace(/\D/g, "") ?? "";
  const phone = formatPhone(phoneDigits);
  if (
    phoneText === null ||
    controlPattern.test(phoneText) ||
    !/^010\d{8}$/.test(phoneDigits)
  )
    errors.phone = "010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.";

  const emailText = scalar(input, "email");
  const email = emailText?.trim().toLowerCase() ?? "";
  if (
    emailText === null ||
    controlPattern.test(emailText) ||
    !isValidEmail(email)
  )
    errors.email = "올바른 이메일 주소를 입력해 주세요.";

  const postalCode = scalar(input, "postalCode")?.trim() ?? "";
  if (!/^\d{5}$/.test(postalCode))
    errors.postalCode = "우편번호 5자리를 입력해 주세요.";

  const addressLine1 = cleanSingleLine(
    scalar(input, "addressLine1"),
    "addressLine1",
    "기본 주소",
    200,
    errors,
  );
  const addressLine2Text = scalar(input, "addressLine2");
  let addressLine2: string | null = null;
  if (addressLine2Text === null || controlPattern.test(addressLine2Text))
    errors.addressLine2 = "상세 주소를 한 칸의 글자로 입력해 주세요.";
  else {
    const cleaned = addressLine2Text.trim();
    if (Array.from(cleaned).length > 200)
      errors.addressLine2 = "상세 주소는 200자 이하로 입력해 주세요.";
    else addressLine2 = cleaned || null;
  }

  const lines = parseLines(scalar(input, "items"), errors);

  if (scalar(input, "privacyConsent") !== "on")
    errors.privacyConsent =
      "주문 처리를 위한 개인정보 수집·이용에 동의해 주세요.";

  return {
    errors,
    stale: false,
    values: Object.keys(errors).length
      ? null
      : {
          requestKey,
          name,
          phone,
          email,
          postalCode,
          addressLine1,
          addressLine2,
          lines,
        },
  };
}

export function isOrderNumber(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^O-\d{8}-(?:\d{3}[1-9]|\d{2}[1-9]\d|\d[1-9]\d{2}|[1-9]\d{3,9})$/.test(
      value,
    )
  );
}
