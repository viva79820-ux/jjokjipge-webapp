import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function AuthScreenHeader({
  title,
  backHref,
}: {
  title: string;
  backHref: string;
}) {
  return (
    <header
      data-auth-header
      className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-surface px-2"
    >
      <Link
        href={backHref}
        aria-label="뒤로"
        className={`flex size-11 cursor-pointer items-center justify-center text-foreground ${focus}`}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      <p className="text-subtitle font-bold">{title}</p>
    </header>
  );
}

export function AuthScreenMain({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-6 px-5 @3xl/app:px-6 ${className}`}>
      {children}
    </div>
  );
}
