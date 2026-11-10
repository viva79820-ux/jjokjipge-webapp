import { Suspense } from "react";
import { NoticeListPage } from "@/components/notices/pages";
import type { Query } from "@/lib/notices/rules";
export const instant = false;
export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">공지 목록을 불러오고 있습니다.</p>}>
      <NoticeListPage {...props} admin />
    </Suspense>
  );
}
