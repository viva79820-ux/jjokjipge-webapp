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
    <nav aria-label="주요 메뉴" className="flex border-b border-border">
      {tabs.map(([label, href], index) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-12 min-w-0 flex-1 items-center justify-center border-b-2 text-body font-semibold whitespace-nowrap md:text-base ${active ? "border-brand text-brand" : "border-transparent text-muted"}`}
          >
            {index > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-3 bottom-3 left-0 w-px bg-border"
              />
            )}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
