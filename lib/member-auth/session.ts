import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  email: string;
  name: string | null;
};

export type ConfirmedUser =
  | { status: "ok"; id: string; email: string }
  | { status: "unconfirmed" | "unavailable" };

const userIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getConfirmedUser(): Promise<ConfirmedUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id || !user.email || !userIdPattern.test(user.id)) {
    return { status: "unavailable" };
  }
  if (!user.email_confirmed_at) return { status: "unconfirmed" };
  return { status: "ok", id: user.id, email: user.email };
}

export async function getMember(): Promise<Member | null> {
  const confirmed = await getConfirmedUser();
  if (confirmed.status !== "ok") return null;
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", confirmed.id)
    .maybeSingle();
  if (profileError)
    return { id: confirmed.id, email: confirmed.email, name: null };
  const name =
    typeof profile?.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : null;
  return { id: confirmed.id, email: confirmed.email, name };
}
