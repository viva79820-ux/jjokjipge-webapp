import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { BottomTabs } from "@/components/bottom-tabs";
import { appMainClass, appShellClass } from "@/lib/app-frame";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-app-shell className={appShellClass}>
      <Suspense fallback={null}>
        <SiteHeader />
      </Suspense>
      <main className={appMainClass}>{children}</main>
      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}
