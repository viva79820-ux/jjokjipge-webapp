"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  busy,
  onClose,
  children,
  footer,
  restoreFocusId,
  initialFocusId,
  clearBottomTabs = false,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  restoreFocusId?: string;
  initialFocusId?: string;
  clearBottomTabs?: boolean;
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
    const initial = initialFocusId
      ? document.getElementById(initialFocusId)
      : null;
    if (initial instanceof HTMLElement) initial.focus();
    else titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = originalOverflow;
      document.documentElement.style.overflow = originalRootOverflow;
      const preferred = restoreFocusId
        ? document.getElementById(restoreFocusId)
        : null;
      if (preferred instanceof HTMLElement) preferred.focus();
      else if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [initialFocusId, restoreFocusId]);
  const frame = clearBottomTabs
    ? "fixed top-4 left-1/2 max-h-[calc(100dvh_-_8.5rem)] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2"
    : "fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg";
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={`${frame} overflow-hidden rounded-card border border-border bg-surface p-0 text-foreground backdrop:bg-foreground/50`}
    >
      <div
        className={`flex flex-col ${clearBottomTabs ? "max-h-[calc(100dvh_-_8.5rem)]" : "max-h-[calc(100dvh_-_2rem)]"}`}
      >
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
