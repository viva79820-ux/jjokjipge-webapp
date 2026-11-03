import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "./access-denied";

export async function AdminPlaceholder({ title }: { title: string }) {
  // Layouts can be reused on navigation; each page also checks the current role.
  if (!(await requireAdmin())) return <AdminAccessDenied />;

  return (
    <section>
      <h1 className="text-lg font-bold md:text-xl">{title}</h1>
      <p className="mt-3 text-muted">다음 작업에서 만들 화면이에요.</p>
    </section>
  );
}
