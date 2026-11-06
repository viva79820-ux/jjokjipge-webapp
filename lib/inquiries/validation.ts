import type {
  InquiryErrors,
  InquiryValues,
  LookupErrors,
  LookupValues,
} from "./types";

export const categoryLabels = {
  reservation_payment: "예약·입금",
  cancellation_refund: "취소·환불",
  consultation: "상담 방식",
  shop: "타로샵",
  other: "기타",
} as const;

export const inquiryNoMaxLength = 30; // I-YYYYMMDD- + bigint의 최대 19자리
export const phoneMessage =
  "010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.";
export const lookupMismatch = "문의번호와 이메일을 다시 확인해 주세요.";
export const lookupFailure =
  "문의를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.";
export const createFailure =
  "문의를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.";

// public.inquiries의 CHECK와 같은 dot-atom / 도메인 규칙을 사용한다.
const emailPattern =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
export function isValidInquiryEmail(value: string) {
  return (
    value.length <= 254 &&
    emailPattern.test(normalizeEmail(value)) &&
    !normalizeEmail(value).includes("\n")
  );
}
export function isValidInquiryNo(value: string) {
  const normalized = value.trim().toUpperCase();
  if (
    value.length > inquiryNoMaxLength ||
    !/^I-[0-9]{8}-[0-9]{4,19}$/.test(normalized)
  )
    return false;
  const date = `${normalized.slice(2, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8, 10)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return false;
  const serial = normalized.slice(11);
  return (
    BigInt(serial) > BigInt(0) &&
    BigInt(serial) <= BigInt("9223372036854775807")
  );
}
export function normalizePhone(value: string) {
  const phone = value.trim();
  // 숫자 또는 한 칸의 공백/하이픈 구분자만 허용한다. 임의 문자를 지우지 않는다.
  if (!/^(?:010[0-9]{8}|010[- ][0-9]{4}[- ][0-9]{4})$/.test(phone)) return null;
  const digits = phone.replace(/[- ]/g, "");
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
const invalidText = (value: string, max: number) =>
  !value.trim() || value.length > max || value.includes("\0");

export function validateInquiryValues(values: InquiryValues): InquiryErrors {
  const errors: InquiryErrors = {};
  if (!Object.hasOwn(categoryLabels, values.category))
    errors.category = "문의 분류를 선택해 주세요.";
  if (invalidText(values.name, 30))
    errors.name = "이름을 1~30자로 입력해 주세요.";
  if (!isValidInquiryEmail(values.email))
    errors.email = "올바른 이메일 주소를 254자 이내로 입력해 주세요.";
  if (!normalizePhone(values.phone)) errors.phone = phoneMessage;
  if (values.reservationNo.length > 50 || values.reservationNo.includes("\0"))
    errors.reservationNo = "예약번호를 50자 이내로 입력해 주세요.";
  if (invalidText(values.content, 5000))
    errors.content = "문의 내용을 1~5000자로 입력해 주세요.";
  if (!values.privacyConsent)
    errors.privacyConsent = "개인정보 수집·이용에 동의해 주세요.";
  return errors;
}

// get()만 사용하면 중복 필드나 File을 놓칠 수 있으므로 단일 문자열만 읽는다.
function scalar(form: FormData, key: string, optional = false) {
  const entries = form.getAll(key);
  if (optional && entries.length === 0) return "";
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : null;
}
export function validateInquiry(form: FormData) {
  const keys = [
    "category",
    "name",
    "email",
    "phone",
    "reservationNo",
    "content",
  ] as const;
  const values: InquiryValues = {
    category: "",
    name: "",
    email: "",
    phone: "",
    reservationNo: "",
    content: "",
    privacyConsent: scalar(form, "privacyConsent") === "on",
  };
  const malformed: InquiryErrors = {};
  for (const key of keys) {
    const value = scalar(form, key, key === "reservationNo");
    if (value === null)
      malformed[key] = "입력값을 하나의 텍스트로 입력해 주세요.";
    else values[key] = value;
  }
  const errors = { ...validateInquiryValues(values), ...malformed };
  return {
    errors,
    values: {
      ...values,
      name: values.name.trim(),
      email: normalizeEmail(values.email),
      phone: normalizePhone(values.phone),
      reservationNo: values.reservationNo.trim() || null,
      content: values.content.trim(),
    },
  };
}
export function validateLookupValues(values: LookupValues): LookupErrors {
  const errors: LookupErrors = {};
  if (!isValidInquiryNo(values.inquiryNo))
    errors.inquiryNo = "문의번호를 I-20261106-0001 형식으로 입력해 주세요.";
  if (!isValidInquiryEmail(values.email))
    errors.email = "올바른 이메일 주소를 254자 이내로 입력해 주세요.";
  return errors;
}
export function validateLookup(form: FormData) {
  const inquiryNo = scalar(form, "inquiryNo");
  const email = scalar(form, "email");
  const raw = { inquiryNo: inquiryNo ?? "", email: email ?? "" };
  const errors = validateLookupValues(raw);
  if (inquiryNo === null)
    errors.inquiryNo = "문의번호를 하나의 텍스트로 입력해 주세요.";
  if (email === null) errors.email = "이메일을 하나의 텍스트로 입력해 주세요.";
  return {
    errors,
    values: {
      inquiryNo: raw.inquiryNo.trim().toUpperCase(),
      email: normalizeEmail(raw.email),
    },
  };
}
