"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callbackUrl, resolveTrustedOrigin, safeNext } from "./redirect";
import { authFailure, logAuthFailure, messages } from "./errors";
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
  status?: "accepted";
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

export async function signUp(
  _previous: FieldState,
  formData: FormData,
): Promise<FieldState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readSignup(formData);
  if ("message" in parsed) return { message: parsed.message };
  const errors = validateSignup(parsed.values);
  if (hasFieldErrors(errors)) return { errors, message: messages.invalidInput };
  const redirectTo = await origin();
  if (!redirectTo) return { message: messages.origin };
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
      if (failure === "rate") return { message: messages.rate };
      if (failure === "weak") return { errors: { password: messages.weak } };
      logAuthFailure("member signup failed", error);
      return { message: messages.unavailable };
    }
    if (!data.user) return { message: messages.unavailable };
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member signup failed", error);
    return { message: messages.unavailable };
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
  const errors = validateLogin(parsed.values);
  if (hasFieldErrors(errors)) return { errors, message: messages.invalidInput };
  const next = safeNext(readTextNext(formData), "/mypage");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(parsed.values.email),
      password: parsed.values.password,
    });
    if (error) {
      const failure = authFailure(error);
      if (failure === "unconfirmed") return { message: messages.unconfirmed };
      if (failure === "rate") return { message: messages.loginRate };
      if (failure === "credentials") return { message: messages.credentials };
      logAuthFailure("member login failed", error);
      return { message: messages.unavailable };
    }
    if (!data.session || !data.user) return { message: messages.session };
    const confirmed = await getConfirmedUser();
    if (confirmed.status !== "ok") {
      await supabase.auth.signOut({ scope: "local" });
      return {
        message:
          confirmed.status === "unconfirmed"
            ? messages.unconfirmed
            : messages.session,
      };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member login failed", error);
    return { message: messages.unavailable };
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
