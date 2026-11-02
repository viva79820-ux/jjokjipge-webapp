import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
type Props = {
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
} & (
  | { href: string }
  | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>)
);
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const styles = `inline-flex min-h-11 items-center justify-center rounded-button px-3 text-sm font-semibold ${variant === "primary" ? "bg-brand text-on-brand" : "border border-brand bg-surface text-brand"} ${className}`;
  if (typeof props.href === "string")
    return (
      <Link href={props.href} className={styles}>
        {children}
      </Link>
    );
  return (
    <button {...props} className={styles}>
      {children}
    </button>
  );
}
