"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readConfirmSubmission } from "./confirm";
import { recordSignupConsent } from "./consents";
import { callbackUrl, resolveTrustedOrigin, safeNext } from "./redirect";
import { authFailure, logAuthFailure, messages } from "./errors";
import { classifySignupUser } from "./signup-user";
import { getConfirmedUser } from "./session";
import {
  normalizeEmail,
  readLogin,
  readPasswordChange,
  readReset,
  readSignup,
  validateLogin,
  validatePasswordChange,
  validateReset,
  validateSignup,
} from "./validation";

export type FieldState = {
  errors?: Record<string, string | undefined>;
  message?: string;
  status?: "accepted" | "duplicate" | "resent";
  // 실패 뒤 폼이 초기화돼도 다시 채울 값. 비밀번호는 넣지 않는다.
  email?: string;
  name?: string;
};

function signupData(name: string): { name: string } {
  return { name: name.trim() };
}

async function origin() {
  return resolveTrustedOrigin(await headers());
}

function hasFieldErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

function keptEmail(value: string): { email?: string } {
  if (value.length === 0 || value.length > 254) return {};
  if (/[\u0000-\u001f\u007f]/.test(value)) return {};
  return { email: value };
}

function keptName(value: string): { name?: string } {
  if (value.length > 30 || /[\u0000-\u001f\u007f]/.test(value)) return {};
  return { name: value };
}

export async function signUp(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readSignup(formData);
  if ("message" in parsed) return { message: parsed.message };
  const kept = {
    ...keptName(parsed.values.name),
    ...keptEmail(parsed.values.email),
  };
  const fail = (state: FieldState): FieldState => ({ ...state, ...kept });
  const errors = validateSignup(parsed.values);
  if (hasFieldErrors(errors))
    return fail({ errors, message: messages.invalidInput });
  const redirectTo = await origin();
  if (!redirectTo) return fail({ message: messages.origin });
  try {
    const supabase = await createClient();
    const email = normalizeEmail(parsed.values.email);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: parsed.values.password,
      options: {
        emailRedirectTo: callbackUrl(redirectTo, "/mypage"),
        data: signupData(parsed.values.name),
      },
    });
    if (error) {
      const failure = authFailure(error);
      if (failure === "exists") redirect("/auth/verify");
      if (failure === "rate") return fail({ message: messages.rate });
      if (failure === "emailNotAuthorized")
        return fail({ message: messages.emailNotAuthorized });
      if (failure === "weak")
        return fail({ errors: { password: messages.weak } });
      logAuthFailure("member signup failed", error);
      return fail({ message: messages.unavailable });
    }
    if (!data.user) return fail({ message: messages.unavailable });
    const signupKind = classifySignupUser(data.user);
    if (signupKind === "duplicate") {
      return fail({
        message: messages.duplicateEmail,
        status: "duplicate",
      });
    }
    if (signupKind === "resent") {
      return fail({
        message: messages.confirmationResent,
        status: "resent",
      });
    }
    if (data.user.identities?.length !== 0) {
      await recordSignupConsent(data.user.id);
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member signup failed", error);
    return fail({ message: messages.unavailable });
  }
  redirect("/auth/verify");
}

export async function login(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readLogin(formData);
  if ("message" in parsed) return { message: parsed.message };
  const kept = keptEmail(parsed.values.email);
  const fail = (state: FieldState): FieldState => ({ ...state, ...kept });
  const errors = validateLogin(parsed.values);
  if (hasFieldErrors(errors))
    return fail({ errors, message: messages.invalidInput });
  const next = safeNext(readTextNext(formData), "/mypage");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(parsed.values.email),
      password: parsed.values.password,
    });
    if (error) {
      const failure = authFailure(error);
      if (failure === "unconfirmed")
        return fail({ message: messages.unconfirmed });
      if (failure === "rate") return fail({ message: messages.loginRate });
      if (failure === "credentials")
        return fail({ message: messages.credentials });
      logAuthFailure("member login failed", error);
      return fail({ message: messages.unavailable });
    }
    if (!data.session || !data.user) return fail({ message: messages.session });
    const confirmed = await getConfirmedUser();
    if (confirmed.status !== "ok") {
      await supabase.auth.signOut({ scope: "local" });
      return fail({
        message:
          confirmed.status === "unconfirmed"
            ? messages.unconfirmed
            : messages.session,
      });
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member login failed", error);
    return fail({ message: messages.unavailable });
  }
  revalidatePath("/", "layout");
  redirect(next);
}

function readTextNext(formData: FormData) {
  const values = formData.getAll("next");
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  return values[0];
}

export async function logout(): Promise<FieldState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      logAuthFailure("member logout failed", error);
      return { message: messages.logout };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member logout failed", error);
    return { message: messages.logout };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readReset(formData);
  if ("message" in parsed) return { message: parsed.message };
  const errors = validateReset(parsed.values);
  if (hasFieldErrors(errors)) return { errors, message: messages.invalidInput };
  const redirectTo = await origin();
  if (!redirectTo) return { message: messages.origin };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizeEmail(parsed.values.email),
      { redirectTo: callbackUrl(redirectTo, "/auth/update-password") },
    );
    if (error) {
      const failure = authFailure(error);
      if (failure === "rate") return { message: messages.rate };
      if (failure === "emailNotAuthorized")
        return { message: messages.emailNotAuthorized };
      if (
        failure === "exists" ||
        failure === "credentials" ||
        (typeof error.code === "string" && error.code === "user_not_found")
      ) {
        return { status: "accepted" };
      }
      logAuthFailure("member password reset failed", error);
      return { message: messages.unavailable };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member password reset failed", error);
    return { message: messages.unavailable };
  }
  return { status: "accepted" };
}

export async function confirmEmail(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData)) return { message: messages.linkInvalid };
  const decision = readConfirmSubmission(formData);
  if (!decision.ok) {
    return {
      message:
        decision.reason === "redirect"
          ? messages.linkRedirect
          : messages.linkInvalid,
    };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: decision.tokenHash,
      type: decision.otpType,
    });
    if (error || !data.session || !data.user) {
      const failure = authFailure(error);
      logAuthFailure("member confirm failed", error);
      if (failure === "expired") return { message: messages.linkExpired };
      if (failure === "rate") return { message: messages.loginRate };
      if (failure === "unavailable") return { message: messages.unavailable };
      return { message: messages.linkInvalid };
    }
    const confirmed = await supabase.auth.getUser();
    const verified = Boolean(
      !confirmed.error && confirmed.data.user?.email_confirmed_at,
    );
    if (!verified) {
      await supabase.auth.signOut({ scope: "local" });
      return { message: messages.session };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member confirm failed", error);
    return { message: messages.unavailable };
  }
  revalidatePath("/", "layout");
  redirect(decision.path);
}

export async function updatePassword(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readPasswordChange(formData);
  if ("message" in parsed) return { message: parsed.message };
  const errors = validatePasswordChange(parsed.values);
  if (hasFieldErrors(errors)) return { errors, message: messages.invalidInput };
  try {
    const supabase = await createClient();
    const member = await getConfirmedUser();
    if (member.status !== "ok") return { message: messages.expiredLink };
    const { error } = await supabase.auth.updateUser({
      password: parsed.values.password,
    });
    if (error) {
      const failure = authFailure(error);
      if (failure === "weak") return { errors: { password: messages.weak } };
      if (failure === "same") return { errors: { password: messages.same } };
      if (failure === "rate") return { message: messages.loginRate };
      if (failure === "expired" || failure === "pkce")
        return { message: messages.expiredLink };
      logAuthFailure("member password update failed", error);
      return { message: messages.unavailable };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member password update failed", error);
    return { message: messages.unavailable };
  }
  revalidatePath("/", "layout");
  redirect("/mypage?notice=password");
}
