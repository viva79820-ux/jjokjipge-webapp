import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SectionTitle({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="min-w-0 text-title font-bold wrap-anywhere">{title}</h2>
      {href && (
        <Link
          href={href}
          className="flex min-h-11 shrink-0 items-center text-caption font-semibold text-muted"
        >
          더보기 <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
