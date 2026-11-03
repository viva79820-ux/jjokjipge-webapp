"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "./auth";
import { getAdminNext, validateLogin, type LoginState } from "./rules";

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const values = {
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    password: typeof password === "string" ? password : "",
  };
  const errors = validateLogin(values);
  if (Object.keys(errors).length) return { errors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(values);
  if (error) return { message: "이메일 또는 비밀번호가 맞지 않아요." };

  if (!(await getAdmin())) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError)
      throw new Error("로그아웃하지 못했어요. 다시 시도해 주세요.");
    return { message: "관리자 계정이 아니에요." };
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
