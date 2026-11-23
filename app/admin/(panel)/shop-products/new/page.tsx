import { Suspense } from "react";
import { ProductEditorPage } from "@/components/products/pages";
import type { ProductQuery } from "@/lib/products/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<ProductQuery> }) {
  return (
    <Suspense
      fallback={<p role="status">상품 작성 화면을 준비하고 있습니다.</p>}
    >
      <ProductEditorPage searchParams={props.searchParams} />
    </Suspense>
  );
}
