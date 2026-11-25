"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

function syncInquirySpace(frame: HTMLElement) {
  const main = frame.closest("main");
  const mainPad = main
    ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0
    : 0;
  const bar = frame.querySelector<HTMLElement>("[data-class-inquiry]");
  if (bar && bar.getClientRects().length === 0) return;
  const barHeight = bar ? bar.getBoundingClientRect().height : 0;
  const nextMargin = mainPad > 0 ? `-${mainPad}px` : "";
  const nextPad = barHeight > 0 ? `${Math.ceil(barHeight)}px` : "";
  if (frame.style.marginBottom !== nextMargin)
    frame.style.marginBottom = nextMargin;
  if (frame.style.paddingBottom !== nextPad)
    frame.style.paddingBottom = nextPad;
}

export function ClassDetailFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let active = true;
    const apply = () => {
      if (!active) return;
      syncInquirySpace(frame);
    };
    apply();
    const observer = new ResizeObserver(() => apply());
    const bar = frame.querySelector<HTMLElement>("[data-class-inquiry]");
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
    <div ref={frameRef} data-class-detail className="min-w-0">
      {children}
    </div>
  );
}
