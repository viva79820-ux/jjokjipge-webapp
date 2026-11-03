export type ContactField = "name" | "phone" | "email" | "depositor";
export type ContactValues = Record<ContactField, string>;

export const duplicateMessage =
  "방금 다른 예약이 들어온 시간이에요. 다른 시간을 골라 주세요.";

export function validateContact(contact: ContactValues) {
  const name = contact.name.trim();
  const digits = contact.phone.replace(/\D/g, "");
  const email = contact.email.trim().toLowerCase();
  const depositor = contact.depositor.trim() || name;
  const errors: Partial<Record<ContactField, string>> = {};
  if (name.length < 1 || name.length > 30)
    errors.name = "이름을 1~30자로 입력해 주세요.";
  if (!/^01\d{8,9}$/.test(digits))
    errors.phone = "01로 시작하는 휴대폰 번호 10~11자리를 입력해 주세요.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  if (depositor.length < 1 || depositor.length > 30)
    errors.depositor = "입금자명을 1~30자로 입력해 주세요.";
  return errors;
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  // While typing, keep four digits in the middle until ten digits are complete.
  const middleEnd = digits.length === 10 ? 6 : 7;
  return [
    digits.slice(0, 3),
    digits.slice(3, middleEnd),
    digits.slice(middleEnd),
  ]
    .filter(Boolean)
    .join("-");
}
