import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Badge({
  children,
  icon: Icon,
  className = "",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-gold bg-gold-soft px-2 py-1 text-xs font-medium text-gold-deep ${className}`}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}
