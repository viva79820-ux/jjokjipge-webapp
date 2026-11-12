import { Suspense } from "react";
import { ProductEditorPage } from "@/components/admin/counselor-products/pages";
import type { ProductQuery } from "@/lib/counselor-products/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ProductQuery>;
}) {
  return (
    <Suspense
      fallback={<p role="status">상담 상품 등록을 준비하고 있습니다.</p>}
    >
      <ProductEditorPage {...props} creating />
    </Suspense>
  );
}
