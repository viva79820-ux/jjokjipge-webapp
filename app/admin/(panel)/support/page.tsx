import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";

export const instant = false;

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<p role="status">불러오는 중입니다.</p>}>
      <Entry />
    </Suspense>
  );
}
async function Entry() {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  redirect("/admin/support/inquiries");
}
