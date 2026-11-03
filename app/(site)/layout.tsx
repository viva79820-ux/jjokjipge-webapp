import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { BottomTabs } from "@/components/bottom-tabs";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-app bg-background">
      <Suspense fallback={null}>
        <SiteHeader />
      </Suspense>
      <main className="pb-28">{children}</main>
      <Suspense fallback={null}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}
