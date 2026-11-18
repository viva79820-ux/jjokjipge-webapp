import { Suspense } from "react";
import { ContentListPage } from "@/components/contents/pages";
import { siteConfig } from "@/lib/site-config";
import type { Query } from "@/lib/contents/rules";

export const metadata = { title: `콘텐츠 | ${siteConfig.name}` };

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">콘텐츠를 불러오고 있습니다.</p>}>
      <ContentListPage {...props} />
    </Suspense>
  );
}
