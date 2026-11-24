"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { BottomTabs } from "@/components/bottom-tabs";
import {
  hidesMemberAuthSiteHeader,
  hidesSharedSiteChrome,
} from "@/lib/site-path";

export function SiteHeaderGate() {
  const pathname = usePathname();
  if (hidesSharedSiteChrome(pathname) || hidesMemberAuthSiteHeader(pathname)) {
    return null;
  }
  return <SiteHeader />;
}

export function BottomTabsGate({ signedIn }: { signedIn: boolean }) {
  if (hidesSharedSiteChrome(usePathname())) return null;
  return <BottomTabs signedIn={signedIn} />;
}
