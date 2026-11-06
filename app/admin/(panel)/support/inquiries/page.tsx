import { Suspense } from "react";
import { SupportList } from "@/components/admin/support-list";
import type { Search } from "@/lib/admin/support-rules";
export const instant = false;
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return (
    <Suspense fallback={<p role="status">문의 목록을 불러오는 중입니다.</p>}>
      <SupportList kind="inquiries" searchParams={searchParams} />
    </Suspense>
  );
}
