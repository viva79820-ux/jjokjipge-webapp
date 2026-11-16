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
  const styles = `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-4.5 text-label font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${variant === "primary" ? "bg-brand text-on-brand" : "border border-brand bg-surface text-brand"} ${className}`;
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
