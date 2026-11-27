"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "./auth";
import { getAdminNext, validateLogin, type LoginState } from "./rules";

function keptEmail(value: string): { email?: string } {
  if (value.length === 0 || value.length > 254) return {};
  if (/[\u0000-\u001f\u007f]/.test(value)) return {};
  return { email: value };
}

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const values = {
    email: typeof email === "string" ? email : "",
    password: typeof password === "string" ? password : "",
  };
  const kept = keptEmail(values.email);
  const errors = validateLogin({
    email: values.email.trim().toLowerCase(),
    password: values.password,
  });
  if (Object.keys(errors).length) return { errors, ...kept };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: values.email.trim().toLowerCase(),
    password: values.password,
  });
  if (error) return { message: "이메일 또는 비밀번호가 맞지 않아요.", ...kept };

  if (!(await getAdmin())) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError)
      throw new Error("로그아웃하지 못했어요. 다시 시도해 주세요.");
    return { message: "관리자 계정이 아니에요.", ...kept };
  }

  redirect(getAdminNext(formData.get("next")));
}

export async function logout() {
  // Login and logout establish/clear a session and must also work for non-admins.
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("로그아웃하지 못했어요. 다시 시도해 주세요.");
  redirect("/admin/login");
}
