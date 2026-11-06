"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AdminSupportNav() {
  const path = usePathname();
  return (
    <nav aria-label="고객센터 관리 메뉴" className="mb-6 flex gap-2">
      {[
        ["inquiries", "문의 관리"],
        ["faqs", "FAQ 관리"],
      ].map(([key, label]) => (
        <Link
          key={key}
          href={`/admin/support/${key}`}
          aria-current={
            path.startsWith(`/admin/support/${key}`) ? "page" : undefined
          }
          className={`flex min-h-11 flex-1 items-center justify-center rounded-button px-3 font-semibold ${path.startsWith(`/admin/support/${key}`) ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
