import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ProductDetailPage } from "@/components/products/pages";
import { publicProductDetail } from "@/lib/products/data";
import { siteConfig } from "@/lib/site-config";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await publicProductDetail((await params).id);
  if (!row) notFound();
  return { title: `${row.name} | ${siteConfig.name}` };
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">상품을 불러오고 있습니다.</p>}>
      <ProductDetailPage {...props} />
    </Suspense>
  );
}
