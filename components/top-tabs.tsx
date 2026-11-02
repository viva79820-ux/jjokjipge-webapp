"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const tabs = [["전화상담", "/consult"], ["클래스", "/class"], ["콘텐츠", "/contents"], ["매장상담", "/stores"], ["타로샵", "/shop"]] as const;
export function TopTabs() {
  const pathname = usePathname();
  return <nav className="top-tabs" aria-label="주요 메뉴">{tabs.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>{label}</Link>)}</nav>;
}
