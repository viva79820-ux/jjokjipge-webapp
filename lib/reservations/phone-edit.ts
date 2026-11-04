import { formatPhone } from "./rules";

// UI editing only. Server validation must see the full, untruncated request.
const digitsOf = (value: string) => value.replace(/\D/g, "");
export function phoneCaret(value: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let count = 0;
  for (let index = 0; index < value.length; index++) {
    if (/\d/.test(value[index]) && ++count === digitCount) {
      return value[index + 1] === "-" ? index + 2 : index + 1;
    }
  }
  return value.length;
}
export function editPhone(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
  direction: "insert" | "backward" | "forward" | "selection" = "insert",
) {
  const digits = digitsOf(value);
  let start = digitsOf(value.slice(0, selectionStart)).length;
  let end = digitsOf(value.slice(0, selectionEnd)).length;
  if (selectionStart === selectionEnd) {
    if (direction === "backward") start = Math.max(0, start - 1);
    if (direction === "forward") end = Math.min(digits.length, end + 1);
  }
  const incoming =
    direction === "insert"
      ? digitsOf(text).slice(
          0,
          Math.max(0, 11 - (digits.length - (end - start))),
        )
      : "";
  // An invalid character or an insertion into a full number changes nothing.
  if (direction === "insert" && !incoming)
    return { value, start: selectionStart, end: selectionEnd };
  const next = formatPhone(
    digits.slice(0, start) + incoming + digits.slice(end),
  );
  const caret = phoneCaret(next, start + incoming.length);
  return { value: next, start: caret, end: caret };
}
export function reconcilePhoneInput(
  previous: string,
  raw: string,
  caret: number,
  inputType: string,
) {
  const digits = digitsOf(raw);
  if (
    digits === digitsOf(previous) &&
    raw.length < previous.length &&
    inputType.startsWith("deleteContent")
  ) {
    const backward = inputType === "deleteContentBackward";
    return editPhone(
      previous,
      caret + (backward ? 1 : 0),
      caret + (backward ? 1 : 0),
      "",
      backward ? "backward" : "forward",
    );
  }
  if (digits.length <= 11) {
    const value = formatPhone(digits);
    const position = phoneCaret(value, digitsOf(raw.slice(0, caret)).length);
    return { value, start: position, end: position };
  }
  // For a non-cancelable autofill/input event, keep the unchanged suffix too.
  const old = digitsOf(previous);
  let prefix = 0,
    suffix = 0;
  while (prefix < old.length && old[prefix] === digits[prefix]) prefix++;
  while (
    suffix < old.length - prefix &&
    old[old.length - 1 - suffix] === digits[digits.length - 1 - suffix]
  )
    suffix++;
  return editPhone(
    previous,
    phoneCaret(previous, prefix),
    phoneCaret(previous, old.length - suffix),
    digits.slice(prefix, digits.length - suffix),
  );
}
