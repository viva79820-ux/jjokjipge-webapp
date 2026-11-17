"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Main keeps the shared bottom-tab padding on every page. This screen hides
// those tabs, so the inline space below is only the measured booking bar.
// Activity hides the route without unmounting it. The layout effect measures
// again when the screen returns, and clears the inline space when it hides.
export function syncBookingSpace(frame: HTMLElement) {
  const main = frame.closest("main");
  const mainPad = main
    ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0
    : 0;
  const bar = frame.querySelector<HTMLElement>("[data-booking-bar]");
  if (bar && bar.getClientRects().length === 0) return;
  const barHeight = bar ? bar.getBoundingClientRect().height : 0;
  const nextMargin = mainPad > 0 ? `-${mainPad}px` : "";
  const nextPad = barHeight > 0 ? `${Math.ceil(barHeight)}px` : "";
  if (frame.style.marginBottom !== nextMargin)
    frame.style.marginBottom = nextMargin;
  if (frame.style.paddingBottom !== nextPad)
    frame.style.paddingBottom = nextPad;
}

export function CounselorDetailFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let active = true;
    const apply = () => {
      if (!active) return;
      syncBookingSpace(frame);
    };
    apply();
    const observer = new ResizeObserver(() => apply());
    const bar = frame.querySelector<HTMLElement>("[data-booking-bar]");
    if (bar) observer.observe(bar, { box: "border-box" });
    const main = frame.closest<HTMLElement>("main");
    if (main) observer.observe(main, { box: "border-box" });
    window.addEventListener("resize", apply);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", apply);
      viewport?.removeEventListener("resize", apply);
      frame.style.marginBottom = "";
      frame.style.paddingBottom = "";
    };
  }, []);

  return (
    <div ref={frameRef} data-counselor-detail className="min-w-0">
      {children}
    </div>
  );
}
