import { Suspense } from "react";
import { StoreEditorPage } from "@/components/admin/stores/pages";
import type { Query } from "@/lib/stores/rules";

export const instant = false;

export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense fallback={<p role="status">매장을 불러오고 있습니다.</p>}>
      <StoreEditorPage {...props} />
    </Suspense>
  );
}
