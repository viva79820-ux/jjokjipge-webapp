import { Suspense } from "react";
import { ClassListPage } from "@/components/classes/pages";
import type { ClassQuery } from "@/lib/classes/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<ClassQuery> }) {
  return (
    <Suspense fallback={<p role="status">클래스 목록을 불러오고 있습니다.</p>}>
      <ClassListPage {...props} admin />
    </Suspense>
  );
}
