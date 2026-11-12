"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Counselor } from "@/lib/data/counselors";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { Chip } from "@/components/ui/chip";
import { CounselorName } from "./name";
import { CounselorPhoto } from "./photo";

export function CounselorBanner({ counselors }: { counselors: Counselor[] }) {
  const [viewport, embla] = useEmblaCarousel({ loop: false });
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(counselors.length > 1);
  const update = useCallback(() => {
    if (!embla) return;
    setIndex(embla.selectedScrollSnap());
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);
  useEffect(() => {
    if (!embla) return;
    embla.on("select", update).on("reInit", update);
    return () => {
      embla.off("select", update).off("reInit", update);
    };
  }, [embla, update]);
  return (
    <section aria-label="추천 상담사 배너" className="min-w-0 max-w-full">
      <div className="relative">
        <div
          ref={viewport}
          className="overflow-hidden rounded-card cursor-grab active:cursor-grabbing"
        >
          <div className="flex touch-pan-y">
            {counselors.map((counselor) => (
              <Link
                key={counselor.id}
                href={`/consult/${counselor.id}`}
                draggable={false}
                className="relative flex min-h-48 min-w-0 flex-[0_0_100%] cursor-grab items-center gap-4 overflow-hidden rounded-card bg-brand-deep p-5 text-on-brand select-none active:cursor-grabbing md:min-h-64 md:gap-8 md:px-20"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2 rounded-card border border-gold"
                />
                <CounselorPhoto
                  src={counselor.imageUrl}
                  alt={`${counselorHeading(counselor.name)} 사진`}
                  sizes="(min-width: 768px) 144px, 96px"
                  className="h-32 w-24 shrink-0 rounded-card md:h-48 md:w-36"
                />
                <div className="relative min-w-0">
                  <p className="text-sm text-gold-light md:text-base">
                    추천 상담사
                  </p>
                  <p className="mt-2 wrap-anywhere text-xl font-bold md:text-2xl">
                    <CounselorName name={counselor.name} suffix="same" />
                  </p>
                  <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-1">
                    {displayChips(counselor).map((tag, index) => (
                      <Chip key={tag} primary={index === 0}>
                        {tag}
                      </Chip>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label="이전 상담사"
          disabled={!canPrev}
          onClick={() => embla?.scrollPrev()}
          className="absolute top-1/2 left-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-brand-deep text-on-brand disabled:opacity-40 md:flex"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          aria-label="다음 상담사"
          disabled={!canNext}
          onClick={() => embla?.scrollNext()}
          className="absolute top-1/2 right-3 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-brand-deep text-on-brand disabled:opacity-40 md:flex"
        >
          <ChevronRight />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm">
        <span aria-live="polite" className="text-muted">
          {index + 1} / {counselors.length}
        </span>
        <Link
          href="/consult"
          className="flex min-h-11 items-center text-foreground"
        >
          전체 상담사 보기 <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
