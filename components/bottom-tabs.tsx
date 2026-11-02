"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Grid2X2, Phone, CalendarSearch, UserRound } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
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
    <nav className="bottom-tabs" aria-label="하단 메뉴">
      {tabs.map(({ label, href, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === href
            : pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (href === "/login" && pathname.startsWith("/mypage"));
        const content = (
          <>
            <Icon size={22} aria-hidden="true" />
            <span>{label}</span>
          </>
        );
        return href.startsWith("tel:") ? (
          <a key={href} href={href}>
            {content}
          </a>
        ) : (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
