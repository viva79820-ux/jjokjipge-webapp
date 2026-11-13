import { Suspense } from "react";
import { StoreEditorPage } from "@/components/admin/stores/pages";
import type { Query } from "@/lib/stores/rules";

export const instant = false;

export default function Page(props: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<p role="status">관리자 권한을 확인하고 있습니다.</p>}>
      <StoreEditorPage searchParams={props.searchParams} />
    </Suspense>
  );
}
