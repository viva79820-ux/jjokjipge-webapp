"use client";
import { DragRow } from "@/components/ui/drag-row";
import type { Counselor } from "@/lib/data/counselors";
import { CounselorCard } from "./counselor-card";
export function CounselorCarousel({ counselors }: { counselors: Counselor[] }) {
  return (
    <DragRow containerClassName="-ml-3">
      {counselors.map((counselor) => (
        <div
          key={counselor.id}
          className="min-w-0 flex-[0_0_43.478%] pl-3 md:flex-[0_0_23.256%]"
        >
          <CounselorCard counselor={counselor} />
        </div>
      ))}
    </DragRow>
  );
}
