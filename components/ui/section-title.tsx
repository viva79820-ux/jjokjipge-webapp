import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
export function SectionTitle({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-serif text-lg font-bold">
        <Sparkles size={18} className="text-gold" aria-hidden="true" />
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="flex min-h-11 items-center text-sm text-muted"
        >
          더보기 <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
