"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Grid2X2, Phone, CalendarSearch, UserRound } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { appFixedBarClass } from "@/lib/app-frame";

const tabs = [
  { label: "홈", href: "/", icon: Home },
  { label: "카테고리", href: "/category", icon: Grid2X2 },
  { label: "전화하기", href: `tel:${siteConfig.phone}`, icon: Phone },
  { label: "예약조회", href: "/booking/lookup", icon: CalendarSearch },
  { label: "로그인", href: "/login", icon: UserRound },
];

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="하단 메뉴"
      data-app-bar
      className={`${appFixedBarClass} flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-stretch overflow-visible border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]`}
    >
      {tabs.map(({ label, href, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === href
            : pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (href === "/login" && pathname.startsWith("/mypage"));
        const phone = href.startsWith("tel:");
        const content = (
          <>
            <span
              className={
                phone
                  ? "-mt-5 flex size-phone-fab items-center justify-center rounded-full border-4 border-on-brand bg-brand text-on-brand"
                  : "flex h-6 items-center"
              }
            >
              <Icon size={24} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </>
        );
        const className = `flex h-full min-w-0 flex-1 flex-col items-center gap-1 text-fine focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${phone ? "justify-start" : "justify-center"} ${active ? "font-bold text-brand" : "font-semibold text-muted"}`;
        return phone ? (
          <a key={href} href={href} className={className}>
            {content}
          </a>
        ) : (
          <Link
            key={href}
            href={href}
            className={className}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
