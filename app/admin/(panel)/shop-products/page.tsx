import { Suspense } from "react";
import { ProductListPage } from "@/components/products/pages";
import type { ProductQuery } from "@/lib/products/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<ProductQuery> }) {
  return (
    <Suspense fallback={<p role="status">상품 목록을 불러오고 있습니다.</p>}>
      <ProductListPage {...props} admin />
    </Suspense>
  );
}
