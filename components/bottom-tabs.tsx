"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, Grid2X2, Phone, CalendarSearch, UserRound } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { appFixedBarClass } from "@/lib/app-frame";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const phoneButtonId = "bottom-phone-call";
const representativeCallHref = `tel:${siteConfig.phone.replace(/\D/g, "")}`;

const tabs = [
  { kind: "link" as const, label: "홈", href: "/", icon: Home },
  {
    kind: "link" as const,
    label: "카테고리",
    href: "/category",
    icon: Grid2X2,
  },
  { kind: "phone" as const, label: "전화하기", icon: Phone },
  {
    kind: "link" as const,
    label: "예약조회",
    href: "/booking/lookup",
    icon: CalendarSearch,
  },
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
  const [phoneOpen, setPhoneOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    barRef.current?.setAttribute("data-bottom-tabs-ready", "yes");
  }, []);
  const accountHref = signedIn ? "/mypage" : "/login";
  const accountLabel = signedIn ? "MY" : "로그인";
  return (
    <>
      <nav
        ref={barRef}
        aria-label="하단 메뉴"
        data-app-bar
        data-bottom-tabs-ready="no"
        className={`${appFixedBarClass} flex h-[calc(4.5rem+env(safe-area-inset-bottom))] items-stretch overflow-visible border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          if (tab.kind === "phone") {
            return (
              <button
                key={tab.label}
                type="button"
                id={phoneButtonId}
                className={tabClass(false, true)}
                aria-haspopup="dialog"
                aria-expanded={phoneOpen}
                onClick={() => setPhoneOpen(true)}
              >
                <span className="-mt-5 flex size-phone-fab items-center justify-center rounded-full border-4 border-on-brand bg-brand text-on-brand">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span>{tab.label}</span>
              </button>
            );
          }
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={tabClass(active, false)}
              aria-current={active ? "page" : undefined}
            >
              <span className="flex h-6 items-center">
                <Icon size={24} aria-hidden="true" />
              </span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <AccountTab
          href={accountHref}
          label={accountLabel}
          active={accountActive(pathname, signedIn)}
        />
      </nav>
      {phoneOpen && (
        <Modal
          title="쪽집게천사에 전화하기"
          busy={false}
          onClose={() => setPhoneOpen(false)}
          restoreFocusId={phoneButtonId}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPhoneOpen(false)}
              >
                닫기
              </Button>
              <a
                href={representativeCallHref}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-brand px-4.5 text-label font-bold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                전화 연결
              </a>
            </>
          }
        >
          <p className="text-title font-bold">{siteConfig.phone}</p>
        </Modal>
      )}
    </>
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
