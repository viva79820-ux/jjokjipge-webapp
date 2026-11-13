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
];
export function BottomTabs({ signedIn }: { signedIn: boolean }) {
  return <BottomTabBar signedIn={signedIn} pathname={usePathname()} />;
}

export function BottomTabsFallback() {
  return <BottomTabBar signedIn={false} pathname={null} />;
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
      className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-app -translate-x-1/2 bg-brand-deep pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map(({ label, href, icon: Icon }) => {
        const active = isActive(pathname, href);
        const phone = href.startsWith("tel:");
        const content = (
          <>
            <span
              className={
                phone
                  ? "-mt-5 flex size-12 items-center justify-center rounded-full border-2 border-gold bg-brand-deep text-gold-light"
                  : "flex h-6 items-center"
              }
            >
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </>
        );
        const className = `flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-medium ${active ? "text-gold-light" : "text-on-brand-muted"}`;
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
      <AccountTab
        href={accountHref}
        label={accountLabel}
        active={accountActive(pathname, signedIn)}
      />
    </nav>
  );
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
  const className = `flex min-h-16 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-xs font-medium ${active ? "text-gold-light" : "text-on-brand-muted"}`;
  return (
    <Link
      href={href}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      <span className="flex h-6 items-center">
        <UserRound size={22} aria-hidden="true" />
      </span>
      <span>{label}</span>
    </Link>
  );
}
