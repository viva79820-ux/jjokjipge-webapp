import { Suspense } from "react";
import { AdminContentEditorPage } from "@/components/contents/pages";
import type { Query } from "@/lib/contents/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense fallback={<p role="status">콘텐츠를 불러오고 있습니다.</p>}>
      <AdminContentEditorPage {...props} />
    </Suspense>
  );
}
