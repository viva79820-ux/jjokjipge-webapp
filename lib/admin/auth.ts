import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminNext } from "./rules";

type Admin = { userId: string; email: string };

// No persistent cache: both identity and role are read for the current request.
async function getAdminSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { authenticated: false, admin: null };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  const admin: Admin | null =
    !profileError && profile?.role === "admin"
      ? { userId: claims.sub, email: claims.email ?? "" }
      : null;
  return { authenticated: true, admin };
}

export async function getAdmin(): Promise<Admin | null> {
  return (await getAdminSession()).admin;
}

export async function requireAdmin(): Promise<Admin | null> {
  const session = await getAdminSession();
  if (!session.authenticated) {
    // Proxy overwrites this header; client-supplied destinations are never trusted.
    const path = getAdminNext((await headers()).get("x-admin-path"));
    redirect(`/admin/login?next=${encodeURIComponent(path)}`);
  }
  // Callers must stop before reading or mutating admin data when this is null.
  return session.admin;
}
