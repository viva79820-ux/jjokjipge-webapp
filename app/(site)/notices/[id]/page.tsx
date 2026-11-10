import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { NoticeDetailPage } from "@/components/notices/pages";
import { noticeDetail } from "@/lib/notices/data";
import { siteConfig } from "@/lib/site-config";
import type { Query } from "@/lib/notices/rules";
export const instant = false;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await noticeDetail((await params).id);
  if (!row) notFound();
  return { title: `${row.title} | ${siteConfig.name}` };
}
export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense fallback={<p role="status">공지를 불러오고 있습니다.</p>}>
      <NoticeDetailPage {...props} />
    </Suspense>
  );
}
