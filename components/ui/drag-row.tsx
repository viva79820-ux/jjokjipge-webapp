"use client";

import { useEffect, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";

export function DragRow({
  children,
  className = "",
  containerClassName = "",
  selectedIndex,
}: {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  selectedIndex?: number;
}) {
  const [viewport, api] = useEmblaCarousel({
    dragFree: true,
    // Keep one snap per date so scrollTo uses the same index as the buttons.
    containScroll: selectedIndex === undefined ? "trimSnaps" : "keepSnaps",
  });

  useEffect(() => {
    if (!api || selectedIndex === undefined || selectedIndex < 0) return;
    const revealSelection = () => api.scrollTo(selectedIndex);
    revealSelection();
    api.on("reInit", revealSelection);
    return () => {
      api.off("reInit", revealSelection);
    };
  }, [api, selectedIndex]);

  return (
    <div
      ref={viewport}
      className={`overflow-hidden cursor-grab active:cursor-grabbing [&_*]:active:cursor-grabbing ${className}`}
    >
      {/* Embla cancels clicks after a drag in its native capture listener. */}
      <div className={`flex touch-pan-y ${containerClassName}`}>{children}</div>
    </div>
  );
}
