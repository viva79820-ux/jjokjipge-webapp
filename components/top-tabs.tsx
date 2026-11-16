"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["전화상담", "/consult"],
  ["클래스", "/class"],
  ["콘텐츠", "/contents"],
  ["매장상담", "/stores"],
  ["타로샵", "/shop"],
] as const;

export function TopTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="flex h-12 border-b border-border bg-surface"
    >
      {tabs.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-12 min-w-0 flex-1 items-center justify-center border-b-3 text-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${active ? "border-brand font-bold text-brand" : "border-transparent font-semibold text-muted"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
