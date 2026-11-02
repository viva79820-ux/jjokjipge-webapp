"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Counselor } from "@/lib/dummy/counselors";
import { Chip } from "@/components/ui/chip";
import { PhotoPlaceholder } from "./photo-placeholder";
export function CounselorBanner({ counselors }: { counselors: Counselor[] }) {
  const [index, setIndex] = useState(0);
  return (
    <section aria-label="추천 상담사 배너">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto rounded-card"
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(
            Math.min(
              counselors.length - 1,
              Math.round(el.scrollLeft / el.clientWidth),
            ),
          );
        }}
      >
        {counselors.map((counselor) => (
          <Link
            key={counselor.id}
            href={`/consult/${counselor.id}`}
            className="relative flex min-h-48 w-full shrink-0 snap-start items-center gap-4 overflow-hidden rounded-card bg-brand-deep p-5 text-on-brand"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 rounded-card border border-gold"
            />
            <PhotoPlaceholder className="h-32 w-24 shrink-0" />
            <div className="relative min-w-0">
              <p className="text-sm text-gold-light">추천 상담사</p>
              <p className="mt-2 font-serif text-xl font-bold">
                {counselor.name} 선생님
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {counselor.tags.map((tag, i) => (
                  <Chip key={tag} primary={i === 0}>
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          </Link>
        ))}
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
