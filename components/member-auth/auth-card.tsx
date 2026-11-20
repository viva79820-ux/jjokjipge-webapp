import type { ReactNode } from "react";

export function AuthCard({
  title,
  children,
  focus = false,
}: {
  title: string;
  children: ReactNode;
  focus?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <div className="mx-auto w-full min-w-0 max-w-md rounded-card border border-border bg-surface p-3 @3xl/app:p-4">
        <h1
          tabIndex={focus ? -1 : undefined}
          autoFocus={focus}
          className="text-display font-extrabold wrap-anywhere text-foreground outline-none"
        >
          {title}
        </h1>
        <div className="mt-3 min-w-0">{children}</div>
      </div>
    </div>
  );
}
