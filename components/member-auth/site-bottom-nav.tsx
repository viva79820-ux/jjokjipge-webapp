import "server-only";

import { connection } from "next/server";
import { BottomTabsGate } from "@/components/site-chrome";
import { getConfirmedUser } from "@/lib/member-auth/session";

export async function SiteBottomNav() {
  await connection();
  const confirmed = await getConfirmedUser();
  return <BottomTabsGate signedIn={confirmed.status === "ok"} />;
}
