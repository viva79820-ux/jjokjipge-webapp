"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/support", label: "자주 묻는 질문" },
  { href: "/support/inquiry", label: "1:1 문의" },
  { href: "/support/lookup", label: "문의 조회" },
];
export function SupportNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="고객센터 메뉴"
      className="mb-7 grid grid-cols-3 gap-1 md:mb-9 md:gap-2"
    >
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`flex min-h-11 min-w-0 items-center justify-center rounded-button px-1 py-2 text-center text-sm font-semibold md:text-base ${pathname === href ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
