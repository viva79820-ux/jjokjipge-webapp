"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { BottomTabs } from "@/components/bottom-tabs";
import { isCounselorDetailPath } from "@/lib/site-path";

export function SiteHeaderGate() {
  if (isCounselorDetailPath(usePathname())) return null;
  return <SiteHeader />;
}

export function BottomTabsGate() {
  if (isCounselorDetailPath(usePathname())) return null;
  return <BottomTabs />;
}
