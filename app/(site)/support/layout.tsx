import { Suspense } from "react";
import { SupportNav } from "@/components/support/support-nav";

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-4 pt-6 md:px-6 md:pt-8">
      <p className="mb-4 text-2xl font-bold text-brand md:text-3xl">고객센터</p>
      <Suspense
        fallback={<p role="status">고객센터 메뉴를 불러오는 중입니다.</p>}
      >
        <SupportNav />
      </Suspense>
      {children}
    </div>
  );
}
