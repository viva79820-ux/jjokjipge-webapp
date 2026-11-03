"use client";
import useEmblaCarousel from "embla-carousel-react";
import type { Counselor } from "@/lib/data/counselors";
import { CounselorCard } from "./counselor-card";
export function CounselorCarousel({ counselors }: { counselors: Counselor[] }) {
  const [viewport] = useEmblaCarousel({
    dragFree: true,
    containScroll: "trimSnaps",
  });
  return (
    <div
      ref={viewport}
      className="overflow-hidden cursor-grab active:cursor-grabbing"
    >
      <div className="-ml-3 flex touch-pan-y">
        {counselors.map((counselor) => (
          <div
            key={counselor.id}
            className="min-w-0 flex-[0_0_43.478%] pl-3 md:flex-[0_0_23.256%]"
          >
            <CounselorCard counselor={counselor} />
          </div>
        ))}
      </div>
    </div>
  );
}
