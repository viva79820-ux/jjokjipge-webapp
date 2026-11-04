"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  busy,
  onClose,
  children,
  footer,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    const originalRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalRootOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-card border border-border bg-surface p-0 text-foreground backdrop:bg-foreground/50"
    >
      <div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
        <header className="shrink-0 border-b border-border p-4">
          <h2
            ref={titleRef}
            tabIndex={-1}
            id={titleId}
            className="text-lg font-bold focus:outline-none"
          >
            {title}
          </h2>
        </header>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-border p-4">
          {footer}
        </footer>
      </div>
    </dialog>
  );
}
