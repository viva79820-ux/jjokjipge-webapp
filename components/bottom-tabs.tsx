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
];

export function BottomTabs({ signedIn }: { signedIn: boolean }) {
  return <BottomTabBar signedIn={signedIn} pathname={usePathname()} />;
}

function BottomTabBar({
  signedIn,
  pathname,
}: {
  signedIn: boolean;
  pathname: string | null;
}) {
  const accountHref = signedIn ? "/mypage" : "/login";
  const accountLabel = signedIn ? "MY" : "로그인";
  return (
    <nav
      aria-label="하단 메뉴"
      data-app-bar
      className={`${appFixedBarClass} flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-stretch overflow-visible border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]`}
    >
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = isActive(pathname, href);
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
        return phone ? (
          <a key={href} href={href} className={tabClass(active, true)}>
            {content}
          </a>
        ) : (
          <Link
            key={href}
            href={href}
            className={tabClass(active, false)}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        );
      })}
      <AccountTab
        href={accountHref}
        label={accountLabel}
        active={accountActive(pathname, signedIn)}
      />
    </nav>
  );
}

function tabClass(active: boolean, phone: boolean) {
  return [
    "flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 text-fine",
    "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand",
    phone ? "justify-start" : "justify-center",
    active ? "font-bold text-brand" : "font-semibold text-muted",
  ].join(" ");
}

function isActive(pathname: string | null, href: string) {
  if (!pathname || href.startsWith("tel:")) return false;
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function accountActive(pathname: string | null, signedIn: boolean) {
  if (!pathname) return false;
  if (signedIn) return isActive(pathname, "/mypage");
  return (
    isActive(pathname, "/login") ||
    isActive(pathname, "/signup") ||
    isActive(pathname, "/forgot-password") ||
    isActive(pathname, "/auth")
  );
}

function AccountTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={tabClass(active, false)}
      aria-current={active ? "page" : undefined}
    >
      <span className="flex h-6 items-center">
        <UserRound size={24} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </Link>
  );
}
