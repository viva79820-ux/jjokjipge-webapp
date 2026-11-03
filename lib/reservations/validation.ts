import type { BookingState } from "./types";
import { slugPattern, uuidPattern } from "./availability";

export function validateReservation(form: FormData) {
  const text = (key: string) =>
    typeof form.get(key) === "string" ? (form.get(key) as string).trim() : "";
  const name = text("name");
  const digits = text("phone").replace(/\D/g, "");
  const email = text("email").toLowerCase();
  const depositor = text("depositor") || name;
  const counselorSlug = text("counselorSlug");
  const productId = text("productId");
  const startsAt = text("startsAt");
  const errors: NonNullable<BookingState["errors"]> = {};
  if (name.length < 1 || name.length > 30)
    errors.name = "이름을 1~30자로 입력해 주세요.";
  if (!/^01\d{8,9}$/.test(digits))
    errors.phone = "01로 시작하는 휴대폰 번호 10~11자리를 입력해 주세요.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  if (depositor.length < 1 || depositor.length > 30)
    errors.depositor = "입금자명을 1~30자로 입력해 주세요.";
  if (text("paymentMethod") !== "bank_transfer")
    errors.paymentMethod = "지금은 무통장입금만 이용할 수 있어요.";
  if (text("refundConsent") !== "on")
    errors.refundConsent = "환불 규정을 확인하고 동의해 주세요.";
  if (text("privacyConsent") !== "on")
    errors.privacyConsent = "개인정보 수집·이용에 동의해 주세요.";
  if (counselorSlug.length > 100 || !slugPattern.test(counselorSlug))
    errors.counselorSlug = "상담사를 다시 선택해 주세요.";
  if (!uuidPattern.test(productId))
    errors.productId = "상담 상품을 다시 선택해 주세요.";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      startsAt,
    ) ||
    !Number.isFinite(Date.parse(startsAt))
  )
    errors.startsAt = "상담 시간을 선택해 주세요.";
  const phone = digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
  return {
    errors,
    values: {
      name,
      phone,
      email,
      depositor,
      counselorSlug,
      productId,
      startsAt,
    },
  };
}
