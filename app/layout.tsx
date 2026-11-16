import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-pretendard",
});
export const metadata: Metadata = {
  title: siteConfig.name,
  description: `${siteConfig.name} 상담 안내`,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body className="bg-background font-sans text-body text-foreground">
        {children}
      </body>
    </html>
  );
}
