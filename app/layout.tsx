import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
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
const notoSerif = Noto_Serif_KR({
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-serif",
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
    <html lang="ko" className={`${pretendard.variable} ${notoSerif.variable}`}>
      <body className="font-sans">
        <div className="mx-auto min-h-screen max-w-[480px] bg-background">
          <SiteHeader />
          <main className="pb-28">{children}</main>
          <BottomTabs />
        </div>
      </body>
    </html>
  );
}
