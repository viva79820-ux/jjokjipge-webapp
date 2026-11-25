import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function ClassDetailHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-surface px-2">
      <Link
        href="/class"
        aria-label="뒤로"
        className={`flex size-11 cursor-pointer items-center justify-center text-foreground ${focus}`}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      <p className="text-subtitle font-bold">클래스</p>
    </header>
  );
}
