import { Suspense } from "react";
import { SupportDetail } from "@/components/admin/support-detail";
import type { Search } from "@/lib/admin/support-rules";
export const instant = false;
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return (
    <Suspense fallback={<p role="status">등록 화면을 불러오는 중입니다.</p>}>
      <SupportDetail kind="faqs" searchParams={searchParams} />
    </Suspense>
  );
}
