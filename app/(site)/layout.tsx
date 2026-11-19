import { Suspense } from "react";
import { SiteHeaderGate } from "@/components/site-chrome";
import { SiteBottomNav } from "@/components/member-auth/site-bottom-nav";
import { appMainClass, appShellClass } from "@/lib/app-frame";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-app-shell className={appShellClass}>
      <Suspense fallback={null}>
        <SiteHeaderGate />
      </Suspense>
      <main className={appMainClass}>{children}</main>
      <Suspense fallback={null}>
        <SiteBottomNav />
      </Suspense>
    </div>
  );
}
