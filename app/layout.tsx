import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { BottomTabs } from "@/components/bottom-tabs";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-pretendard",
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
    <html lang="ko" className={pretendard.variable}>
      <body className="font-sans text-body md:text-base">
        <div className="mx-auto min-h-screen max-w-app bg-background">
          <Suspense fallback={null}>
            <SiteHeader />
          </Suspense>
          <main className="pb-28">{children}</main>
          <Suspense fallback={null}>
            <BottomTabs />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
