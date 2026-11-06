import type { RefObject } from "react";

export const inputClass =
  "mt-1 min-h-11 min-w-0 w-full rounded-button border bg-surface px-3 py-2 text-body md:text-base disabled:opacity-60";

export function FieldError({
  field,
  message,
}: {
  field: string;
  message?: string;
}) {
  return message ? (
    <p
      id={`${field}-error`}
      role="alert"
      className="mt-1 text-caption font-semibold text-error"
    >
      {message}
    </p>
  ) : null;
}
export function focusField(
  form: RefObject<HTMLFormElement | null>,
  field: string,
) {
  form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
}
export function supportDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
