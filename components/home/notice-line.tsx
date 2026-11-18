import Link from "next/link";
import { ChevronRight, Megaphone } from "lucide-react";
import type { HomeNoticeLine } from "@/lib/home/notice";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeNoticeLine({ notice }: { notice: HomeNoticeLine }) {
  const href = notice.status === "ready" ? `/notices/${notice.id}` : "/notices";
  const text =
    notice.status === "ready"
      ? notice.title
      : notice.status === "error"
        ? "공지를 불러오지 못했어요. 목록에서 확인해 주세요."
        : "등록된 공지가 없어요. 목록을 확인해 주세요.";
  return (
    <Link
      href={href}
      data-home-notice={notice.status}
      className={`flex min-w-0 items-center gap-2.5 rounded-card border border-border bg-surface p-3.5 ${focus}`}
    >
      <Megaphone size={22} aria-hidden="true" className="shrink-0 text-brand" />
      <span className="min-w-0 flex-1 text-label wrap-anywhere">
        <b className="text-brand">공지</b> {text}
      </span>
      <ChevronRight
        size={18}
        aria-hidden="true"
        className="shrink-0 text-muted"
      />
    </Link>
  );
}
