import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import { appShellClass } from "@/lib/app-frame";

export const metadata: Metadata = {
  title: `${siteConfig.name} 관리자`,
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-app-shell className={appShellClass}>
      {children}
    </div>
  );
}
