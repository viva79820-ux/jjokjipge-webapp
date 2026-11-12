import { Suspense } from "react";
import { ProductEditorPage } from "@/components/admin/counselor-products/pages";
import type { ProductQuery } from "@/lib/counselor-products/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string; productId: string }>;
  searchParams: Promise<ProductQuery>;
}) {
  return (
    <Suspense fallback={<p role="status">상담 상품을 불러오고 있습니다.</p>}>
      <ProductEditorPage {...props} />
    </Suspense>
  );
}
