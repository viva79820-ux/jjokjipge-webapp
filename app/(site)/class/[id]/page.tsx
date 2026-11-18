import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ClassDetailPage } from "@/components/classes/pages";
import { publicClassDetail } from "@/lib/classes/data";
import { siteConfig } from "@/lib/site-config";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await publicClassDetail((await params).id);
  if (!row) notFound();
  return { title: `${row.title} | ${siteConfig.name}` };
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">클래스를 불러오고 있습니다.</p>}>
      <ClassDetailPage {...props} />
    </Suspense>
  );
}
