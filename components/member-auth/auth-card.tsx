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
    <div className="min-w-0 px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-md rounded-card border border-border bg-surface p-4 md:p-6">
        <h1
          tabIndex={focus ? -1 : undefined}
          autoFocus={focus}
          className="text-lg font-bold break-words text-brand outline-none md:text-xl"
        >
          {title}
        </h1>
        <div className="mt-5 min-w-0">{children}</div>
      </div>
    </div>
  );
}
