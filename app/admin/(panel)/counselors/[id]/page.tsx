import { Suspense } from "react";
import { CounselorEditorPage } from "@/components/admin/counselors/pages";
import type { Query } from "@/lib/counselors/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense fallback={<p role="status">상담사를 불러오고 있습니다.</p>}>
      <CounselorEditorPage {...props} />
    </Suspense>
  );
}
