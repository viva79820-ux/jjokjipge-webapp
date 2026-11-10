import { Suspense } from "react";
import { NoticeDetailPage } from "@/components/notices/pages";
import type { Query } from "@/lib/notices/rules";
export const instant = false;
export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense fallback={<p role="status">공지를 불러오고 있습니다.</p>}>
      <NoticeDetailPage {...props} admin />
    </Suspense>
  );
}
