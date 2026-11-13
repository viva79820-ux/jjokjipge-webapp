import { Suspense } from "react";
import { StoreAdminListPage } from "@/components/admin/stores/pages";
import type { Query } from "@/lib/stores/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">매장 목록을 불러오고 있습니다.</p>}>
      <StoreAdminListPage {...props} />
    </Suspense>
  );
}
