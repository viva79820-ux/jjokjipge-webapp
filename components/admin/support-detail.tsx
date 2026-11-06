import { requireAdmin } from "@/lib/admin/auth";
import { getFaqDetail, getInquiryDetail } from "@/lib/admin/support-data";
import {
  supportReturn,
  type Search,
  type Kind,
} from "@/lib/admin/support-rules";
import { AdminAccessDenied } from "./access-denied";
import { SupportEditor } from "./support-editor";
import { notFound } from "next/navigation";
import { connection } from "next/server";
export async function SupportDetail({
  kind,
  params,
  searchParams,
}: {
  kind: Kind;
  params?: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const search = await searchParams;
  const returnTo = supportReturn(kind, search.returnTo);
  if (!params)
    return <SupportEditor kind="faqs" initial={null} returnTo={returnTo} />;
  const { id } = await params;
  if (kind === "faqs") {
    const row = await getFaqDetail(id);
    if (!row) notFound();
    return <SupportEditor kind="faqs" initial={row} returnTo={returnTo} />;
  }
  const row = await getInquiryDetail(id);
  if (!row) notFound();
  return <SupportEditor kind="inquiries" initial={row} returnTo={returnTo} />;
}
