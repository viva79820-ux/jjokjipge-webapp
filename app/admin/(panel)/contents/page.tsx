import { Suspense } from "react";
import { ContentFilterPending } from "@/components/contents/admin-filter";
import { AdminContentListPage } from "@/components/contents/pages";
import type { Query } from "@/lib/contents/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <>
      <ContentFilterPending />
      <Suspense
        fallback={<p role="status">콘텐츠 목록을 불러오고 있습니다.</p>}
      >
        <AdminContentListPage {...props} />
      </Suspense>
    </>
  );
}
