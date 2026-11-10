import { Suspense } from "react";
import { NoticeDetailPage } from "@/components/notices/pages";
import type { Query } from "@/lib/notices/rules";
export const instant = false;
export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">관리자 권한을 확인하고 있습니다.</p>}>
      <NoticeDetailPage searchParams={props.searchParams} admin />
    </Suspense>
  );
}
