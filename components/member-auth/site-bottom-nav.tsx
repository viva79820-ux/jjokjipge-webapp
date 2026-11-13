import "server-only";

import { connection } from "next/server";
import { BottomTabs } from "@/components/bottom-tabs";
import { getMember } from "@/lib/member-auth/session";

export async function SiteBottomNav() {
  await connection();
  const member = await getMember();
  return <BottomTabs signedIn={Boolean(member)} />;
}
