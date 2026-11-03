import { isValidEmail } from "@/lib/reservations/rules";

export type LoginField = "email" | "password";
export type LoginValues = Record<LoginField, string>;
export type LoginState = {
  errors?: Partial<Record<LoginField, string>>;
  message?: string;
};

export function validateLogin(values: LoginValues) {
  const errors: NonNullable<LoginState["errors"]> = {};
  if (!isValidEmail(values.email))
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  if (!values.password.length) errors.password = "비밀번호를 입력해 주세요.";
  return errors;
}

export function getAdminNext(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\/admin(?:[/?#]|$)/.test(value) ||
    /[\\\s\u0000-\u001f\u007f]/.test(value)
  )
    return "/admin";

  const url = new URL(value, "https://admin.invalid");
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))
    return "/admin";
  return `${url.pathname}${url.search}${url.hash}`;
}
