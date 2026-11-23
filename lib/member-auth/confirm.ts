import { safeNext } from "./redirect";

const tokenPattern = /^[0-9a-f]{32,128}$/i;

const paths = {
  email: "/mypage",
  recovery: "/auth/update-password",
} as const;

export type ConfirmOtpType = keyof typeof paths;

export type ConfirmLink =
  | {
      ok: true;
      tokenHash: string;
      otpType: ConfirmOtpType;
      path: string;
    }
  | { ok: false; reason: "invalid" | "redirect" };

function only(values: readonly string[]) {
  if (values.length !== 1) return null;
  return values[0];
}

export function readConfirmLink(input: {
  tokenHashes: readonly string[];
  types: readonly string[];
  nextValues: readonly string[];
}): ConfirmLink {
  const tokenHash = only(input.tokenHashes);
  const otpType = only(input.types);
  if (!tokenHash || !tokenPattern.test(tokenHash)) {
    return { ok: false, reason: "invalid" };
  }
  if (otpType !== "email" && otpType !== "recovery") {
    return { ok: false, reason: "invalid" };
  }
  const path = paths[otpType];
  if (input.nextValues.length > 1) return { ok: false, reason: "redirect" };
  if (input.nextValues.length === 1) {
    const next = input.nextValues[0];
    if (next !== path || safeNext(next, path) !== path) {
      return { ok: false, reason: "redirect" };
    }
  }
  return { ok: true, tokenHash, otpType, path };
}

function fieldValues(form: FormData, key: string) {
  const values = form.getAll(key);
  if (values.some((value) => typeof value !== "string")) return null;
  return values as string[];
}

export function readConfirmSubmission(form: FormData): ConfirmLink {
  const tokenHashes = fieldValues(form, "token_hash");
  const types = fieldValues(form, "type");
  const nextValues = fieldValues(form, "next");
  if (!tokenHashes || !types || !nextValues) {
    return { ok: false, reason: "invalid" };
  }
  return readConfirmLink({ tokenHashes, types, nextValues });
}
