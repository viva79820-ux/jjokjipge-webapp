import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Badge({
  children,
  icon: Icon,
  tone = "soft",
  className = "",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  tone?: "soft" | "halo" | "brand";
  className?: string;
}) {
  const toneClass =
    tone === "halo"
      ? "h-6.5 bg-halo px-2.5 text-fine font-extrabold text-foreground"
      : tone === "brand"
        ? "h-6 bg-brand-soft px-2 text-fine font-bold text-brand"
        : "bg-brand-soft px-2 py-1 text-fine font-semibold text-brand-deep";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${toneClass} ${className}`}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}
