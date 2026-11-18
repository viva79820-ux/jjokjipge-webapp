import { Suspense } from "react";
import { AdminContentEditorPage } from "@/components/contents/pages";
import type { Query } from "@/lib/contents/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense
      fallback={<p role="status">콘텐츠 등록 화면을 준비하고 있습니다.</p>}
    >
      <AdminContentEditorPage searchParams={props.searchParams} creating />
    </Suspense>
  );
}
