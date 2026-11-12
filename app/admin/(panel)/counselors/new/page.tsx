import { Suspense } from "react";
import { CounselorEditorPage } from "@/components/admin/counselors/pages";
import type { Query } from "@/lib/counselors/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">관리자 권한을 확인하고 있습니다.</p>}>
      <CounselorEditorPage searchParams={props.searchParams} />
    </Suspense>
  );
}
