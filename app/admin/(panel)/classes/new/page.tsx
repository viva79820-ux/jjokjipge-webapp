import { Suspense } from "react";
import { ClassEditorPage } from "@/components/classes/pages";
import type { ClassQuery } from "@/lib/classes/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<ClassQuery> }) {
  return (
    <Suspense
      fallback={<p role="status">클래스 작성 화면을 준비하고 있습니다.</p>}
    >
      <ClassEditorPage searchParams={props.searchParams} />
    </Suspense>
  );
}
