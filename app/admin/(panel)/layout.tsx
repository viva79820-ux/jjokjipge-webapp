import { Suspense } from "react";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminMenuTabs } from "@/components/admin/menu-tabs";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { logout } from "@/lib/admin/actions";

// Authorization deliberately waits for the current request and may redirect.
export const instant = false;

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-4 md:p-6">
          관리자 권한을 확인하고 있어요.
        </p>
      }
    >
      <AdminPanel>{children}</AdminPanel>
    </Suspense>
  );
}

async function AdminPanel({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin)
    return (
      <main>
        <AdminAccessDenied />
      </main>
    );

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between md:p-6">
        <p className="shrink-0 text-xl font-extrabold text-brand">
          쪽집게천사 관리자
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:justify-end">
          <p className="w-full min-w-0 text-caption break-all text-muted md:text-right md:text-sm">
            {admin.email}
          </p>
          <form action={logout}>
            <Button type="submit" variant="secondary">
              로그아웃
            </Button>
          </form>
          <Link
            href="/"
            className="inline-flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-brand"
          >
            사이트 보기
          </Link>
        </div>
      </header>
      <AdminMenuTabs />
      <main className="p-4 md:p-6">{children}</main>
    </>
  );
}
