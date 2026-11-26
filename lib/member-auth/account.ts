"use server";

// 회원정보 수정과 탈퇴는 로그인 세션만 사용한다. 비밀 키는 쓰지 않는다.
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuthFailure, messages } from "./errors";
import { getConfirmedUser } from "./session";
import { profilePhone, readProfile, validateProfile } from "./validation";

export type AccountState = {
  errors?: Record<string, string | undefined>;
  message?: string;
  status?: "saved";
};

const withdrawFailure = "탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

function hasFieldErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

export async function updateProfile(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const parsed = readProfile(formData);
  if ("message" in parsed) return { message: parsed.message };
  const errors = validateProfile(parsed.values);
  if (hasFieldErrors(errors)) return { errors, message: messages.invalidInput };
  const phone = profilePhone(parsed.values.phone);
  try {
    const member = await getConfirmedUser();
    if (member.status !== "ok") return { message: messages.session };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({
        name: parsed.values.name.trim(),
        phone,
      })
      .eq("id", member.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      logAuthFailure("member profile update failed", error);
      return { message: messages.unavailable };
    }
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member profile update failed", error);
    return { message: messages.unavailable };
  }
  revalidatePath("/mypage");
  return { status: "saved", message: "회원정보를 저장했어요." };
}

export async function withdrawAccount(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  if (!(formData instanceof FormData))
    return { message: messages.invalidInput };
  const confirm = formData.getAll("confirm");
  if (confirm.length !== 1 || confirm[0] !== "withdraw")
    return { message: messages.invalidInput };
  try {
    const member = await getConfirmedUser();
    if (member.status !== "ok") return { message: messages.session };
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_own_account");
    if (error) {
      logAuthFailure("member withdrawal failed", error);
      return { message: withdrawFailure };
    }
    const signedOut = await supabase.auth.signOut({ scope: "local" });
    if (signedOut.error)
      logAuthFailure("member withdrawal sign-out failed", signedOut.error);
  } catch (error) {
    unstable_rethrow(error);
    logAuthFailure("member withdrawal failed", error);
    return { message: withdrawFailure };
  }
  revalidatePath("/", "layout");
  redirect("/login?notice=withdrawn");
}
