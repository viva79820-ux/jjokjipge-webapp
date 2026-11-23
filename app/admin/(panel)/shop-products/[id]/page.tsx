import { Suspense } from "react";
import { ProductEditorPage } from "@/components/products/pages";
import type { ProductQuery } from "@/lib/products/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ProductQuery>;
}) {
  return (
    <Suspense fallback={<p role="status">상품을 불러오고 있습니다.</p>}>
      <ProductEditorPage {...props} />
    </Suspense>
  );
}
