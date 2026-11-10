"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DragRow } from "@/components/ui/drag-row";

const menus = [
  ["대시보드", "/admin"],
  ["예약 관리", "/admin/reservations"],
  ["고객센터", "/admin/support"],
  ["공지사항", "/admin/notices"],
  ["상담사상품", "/admin/counselors"],
  ["매장", "/admin/stores"],
] as const;

export function AdminMenuTabs() {
  const pathname = usePathname();
  const selectedIndex = menus.findIndex(
    ([, href]) =>
      pathname === href ||
      (href !== "/admin" && pathname.startsWith(`${href}/`)),
  );

  return (
    <nav
      aria-label="관리자 메뉴"
      className="border-b border-border px-4 md:px-6"
    >
      <DragRow selectedIndex={selectedIndex}>
        {menus.map(([label, href], index) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={index === selectedIndex ? "page" : undefined}
            className={`flex min-h-12 shrink-0 cursor-pointer items-center justify-center border-b-2 px-4 text-body font-semibold whitespace-nowrap md:flex-1 md:text-base ${index === selectedIndex ? "border-brand text-brand" : "border-transparent text-muted"}`}
          >
            {label}
          </Link>
        ))}
      </DragRow>
    </nav>
  );
}
