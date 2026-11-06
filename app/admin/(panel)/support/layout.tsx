import { Suspense } from "react";
import { AdminSupportNav } from "@/components/admin/support-nav";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AdminSupportNav />
      </Suspense>
      {children}
    </>
  );
}
