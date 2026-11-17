import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function CounselorDetailHeader() {
  return (
    <header
      data-counselor-header
      className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-surface px-2"
    >
      <Link
        href="/consult"
        aria-label="뒤로"
        className={`flex size-11 cursor-pointer items-center justify-center text-foreground ${focus}`}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      <p className="text-subtitle font-bold">선생님 소개</p>
    </header>
  );
}

export function CounselorDetailPending() {
  return (
    <div className="min-w-0">
      <CounselorDetailHeader />
      <p role="status" className="px-4 pt-6 text-body text-muted @3xl/app:px-6">
        선생님 정보를 불러오는 중이에요.
      </p>
    </div>
  );
}
