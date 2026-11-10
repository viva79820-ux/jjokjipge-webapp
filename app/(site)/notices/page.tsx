import { Suspense } from "react";
import { NoticeListPage } from "@/components/notices/pages";
import type { Query } from "@/lib/notices/rules";
import { siteConfig } from "@/lib/site-config";
export const metadata = { title: `공지사항 | ${siteConfig.name}` };
export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">공지사항을 불러오고 있습니다.</p>}>
      <NoticeListPage {...props} />
    </Suspense>
  );
}
