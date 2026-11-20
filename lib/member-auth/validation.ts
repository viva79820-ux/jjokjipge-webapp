export type SignupValues = {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
};

export type SignupErrors = Partial<Record<keyof SignupValues, string>>;

export type LoginValues = {
  email: string;
  password: string;
};

export type LoginErrors = Partial<Record<keyof LoginValues, string>>;

export type ResetValues = {
  email: string;
};

export type PasswordChangeValues = {
  password: string;
  passwordConfirm: string;
};

const invalidInput = "입력한 내용을 확인해 주세요.";

export function readText(form: FormData, key: string) {
  const values = form.getAll(key);
  if (values.length !== 1) return null;
  const value = values[0];
  if (typeof value !== "string") return null;
  return value;
}

export function readSignup(form: FormData) {
  const name = readText(form, "name");
  const email = readText(form, "email");
  const password = readText(form, "password");
  const passwordConfirm = readText(form, "passwordConfirm");
  if (
    name === null ||
    email === null ||
    password === null ||
    passwordConfirm === null
  ) {
    return { message: invalidInput };
  }
  return { values: { name, email, password, passwordConfirm } };
}

export function readLogin(form: FormData) {
  const email = readText(form, "email");
  const password = readText(form, "password");
  if (email === null || password === null) return { message: invalidInput };
  return { values: { email, password } };
}

export function readReset(form: FormData) {
  const email = readText(form, "email");
  if (email === null) return { message: invalidInput };
  return { values: { email } };
}

export function readPasswordChange(form: FormData) {
  const password = readText(form, "password");
  const passwordConfirm = readText(form, "passwordConfirm");
  if (password === null || passwordConfirm === null) {
    return { message: invalidInput };
  }
  return { values: { password, passwordConfirm } };
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isMemberEmail(value: string) {
  const email = normalizeEmail(value);
  if (email.length < 3 || email.length > 254) return false;
  if (email.includes("..") || email.startsWith(".") || email.endsWith("."))
    return false;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
    email,
  );
}

export function passwordBytes(value: string) {
  return new TextEncoder().encode(value).length;
}

export function validateName(value: string) {
  const name = value.trim();
  if (name.length < 1 || name.length > 30 || /[\u0000-\u001f\u007f]/.test(name))
    return "이름을 1~30자로 입력해 주세요.";
  return undefined;
}

export function validatePassword(value: string) {
  if (value.length < 8 || value.length > 64)
    return "비밀번호는 8자 이상 64자 이하로 입력해 주세요.";
  if (passwordBytes(value) > 72)
    return "비밀번호가 허용 길이를 넘어요. 더 짧게 입력해 주세요.";
  return undefined;
}

export function validateSignup(values: SignupValues) {
  const errors: SignupErrors = {};
  const nameError = validateName(values.name);
  if (nameError) errors.name = nameError;
  if (!isMemberEmail(values.email))
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;
  else if (values.password !== values.passwordConfirm)
    errors.passwordConfirm = "비밀번호 확인이 일치하지 않아요.";
  return errors;
}

export function validateLogin(values: LoginValues) {
  const errors: LoginErrors = {};
  if (!isMemberEmail(values.email))
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  if (!values.password.length) errors.password = "비밀번호를 입력해 주세요.";
  else if (values.password.length > 64 || passwordBytes(values.password) > 72)
    errors.password = "비밀번호가 허용 길이를 넘어요.";
  return errors;
}

export function validateReset(values: ResetValues) {
  if (!isMemberEmail(values.email))
    return { email: "올바른 이메일 주소를 입력해 주세요." };
  return {};
}

export function validatePasswordChange(values: PasswordChangeValues) {
  const errors: Partial<Record<keyof PasswordChangeValues, string>> = {};
  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;
  else if (values.password !== values.passwordConfirm)
    errors.passwordConfirm = "비밀번호 확인이 일치하지 않아요.";
  return errors;
}
