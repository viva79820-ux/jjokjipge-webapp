import Link from "next/link";
import { ChevronRight, Headphones } from "lucide-react";

export default function Page() {
  return (
    <div className="px-4 pt-6 md:px-6 md:pt-8">
      <h1 className="mb-4 text-lg font-bold md:text-xl">카테고리</h1>
      <Link
        href="/notices"
        className="mb-3 flex min-h-24 items-center justify-between rounded-card border border-border bg-surface p-4"
      >
        <span className="font-bold">공지사항</span>
        <ChevronRight size={20} aria-hidden="true" className="text-muted" />
      </Link>
      <Link
        href="/support"
        className="flex min-h-24 items-center gap-3 rounded-card border border-border bg-surface p-3 md:p-4"
      >
        <Headphones
          size={28}
          className="shrink-0 text-gold"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold">고객센터</p>
          <p className="mt-1 text-caption text-muted md:text-sm">
            자주 묻는 질문 · 1:1 문의 · 문의 조회
          </p>
        </div>
        <ChevronRight
          size={20}
          className="shrink-0 text-muted"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
