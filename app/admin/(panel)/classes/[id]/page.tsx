import { Suspense } from "react";
import { ClassEditorPage } from "@/components/classes/pages";
import type { ClassQuery } from "@/lib/classes/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ClassQuery>;
}) {
  return (
    <Suspense fallback={<p role="status">클래스를 불러오고 있습니다.</p>}>
      <ClassEditorPage {...props} />
    </Suspense>
  );
}
