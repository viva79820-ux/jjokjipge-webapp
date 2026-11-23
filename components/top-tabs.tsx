"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const tabs = [
  ["전화상담", "/consult"],
  ["AI 사주", "/ai-saju"],
  ["클래스", "/class"],
  ["매장상담", "/stores"],
  ["타로샵", "/shop"],
  ["콘텐츠", "/contents"],
] as const;

export function TopTabs() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [pathname]);

  return (
    <nav
      aria-label="주요 메뉴"
      className="flex h-12 min-w-0 overflow-x-auto border-b border-border bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(([label, href]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            ref={active ? activeRef : undefined}
            aria-current={active ? "page" : undefined}
            onFocus={(event) => {
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              });
            }}
            className={`flex h-12 shrink-0 cursor-pointer items-center justify-center border-b-3 px-4 text-body whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand ${active ? "border-brand font-bold text-brand" : "border-transparent font-semibold text-muted"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
