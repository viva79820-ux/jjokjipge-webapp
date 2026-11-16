import { Suspense } from "react";
import { BottomTabsGate, SiteHeaderGate } from "@/components/site-chrome";
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
        <BottomTabsGate />
      </Suspense>
    </div>
  );
}
