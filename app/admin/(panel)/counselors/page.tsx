import { Suspense } from "react";
import { CounselorAdminListPage } from "@/components/admin/counselors/pages";
import type { Query } from "@/lib/counselors/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">상담사 목록을 불러오고 있습니다.</p>}>
      <CounselorAdminListPage {...props} />
    </Suspense>
  );
}
