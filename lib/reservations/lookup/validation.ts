import { isValidEmail } from "../rules";
import type { LookupErrors, LookupValues } from "./types";

// PostgreSQL integer 상한. 예약번호 트리거의 일련번호 카운터와 같다.
export const reservationSerialMax = 2147483647;
export const lookupMismatch = "예약번호와 이메일을 다시 확인해 주세요.";
export const lookupFailure =
  "예약을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const reservationNoMessage =
  "예약번호를 R-20261102-0001 형식으로 입력해 주세요.";
const emailMessage = "올바른 이메일 주소를 254자 이내로 입력해 주세요.";

// trim이 지우지 못하는 제어문자. 앞뒤 공백·줄바꿈은 예약 저장과 같이 정규화한다.
function hasBlockedControl(value: string) {
  return /[\u0000-\u0008\u000E-\u001F\u007F]/.test(value);
}
export function normalizeReservationNo(value: string) {
  return value.trim().toUpperCase();
}
export function normalizeLookupEmail(value: string) {
  return value.trim().toLowerCase();
}
export function isValidReservationNo(value: string) {
  if (value.length > 40 || hasBlockedControl(value)) return false;
  const normalized = normalizeReservationNo(value);
  if (!/^R-[0-9]{8}-[0-9]{4,10}$/.test(normalized)) return false;
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
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > reservationSerialMax
  )
    return false;
  return serial === String(number).padStart(4, "0");
}
export function isValidLookupEmail(value: string) {
  if (value.length > 320 || hasBlockedControl(value)) return false;
  return isValidEmail(value);
}
export function validateLookupValues(values: LookupValues): LookupErrors {
  const errors: LookupErrors = {};
  if (!isValidReservationNo(values.reservationNo))
    errors.reservationNo = reservationNoMessage;
  if (!isValidLookupEmail(values.email)) errors.email = emailMessage;
  return errors;
}
function scalar(form: FormData, key: string) {
  const entries = form.getAll(key);
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : null;
}
export function validateLookup(form: FormData) {
  const reservationNo = scalar(form, "reservationNo");
  const email = scalar(form, "email");
  const raw = { reservationNo: reservationNo ?? "", email: email ?? "" };
  const errors = validateLookupValues(raw);
  if (reservationNo === null)
    errors.reservationNo = "예약번호를 하나의 텍스트로 입력해 주세요.";
  if (email === null) errors.email = "이메일을 하나의 텍스트로 입력해 주세요.";
  return {
    errors,
    values: {
      reservationNo: normalizeReservationNo(raw.reservationNo),
      email: normalizeLookupEmail(raw.email),
    },
  };
}
