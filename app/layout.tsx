import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { TopTabs } from "@/components/top-tabs";
import { BottomTabs } from "@/components/bottom-tabs";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "100 900",
  display: "swap",
});
export const metadata: Metadata = {
  title: "쪽집게천사",
  description: "쪽집게천사 상담 안내",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.className}>
      <body>
        <div className="shell">
          <header>
            <Link className="logo" href="/">
              {siteConfig.name}
            </Link>
            <TopTabs />
          </header>
          <main>{children}</main>
          <BottomTabs />
        </div>
      </body>
    </html>
  );
}
