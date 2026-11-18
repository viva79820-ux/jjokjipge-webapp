"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Counselor } from "@/lib/data/counselors";
import { visibleCareers } from "@/lib/home/counselors";
import { counselorHeading } from "@/lib/counselors/rules";
import { CounselorName } from "@/components/counselor/name";
import { CounselorPhoto } from "@/components/counselor/photo";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-brand";

export function HomeBanner({ counselors }: { counselors: Counselor[] }) {
  if (counselors.length === 0) return <HomeBannerFallback />;
  return <HomeBannerSlides counselors={counselors} />;
}

function HomeBannerFallback() {
  return (
    <section aria-label="전화상담 안내" data-home-banner-fallback>
      <div className="flex min-h-[228px] items-center gap-4 rounded-card bg-brand px-4 py-6">
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="h-16 w-auto shrink-0"
        />
        <div className="min-w-0">
          <p className="text-subtitle font-extrabold wrap-anywhere text-on-brand">
            전화상담
          </p>
          <p className="mt-1 text-label wrap-anywhere text-brand-soft">
            예약한 시간에 선생님이 매장 전화로 연락드려요.
          </p>
          <Link
            href="/consult"
            className={`mt-3 inline-flex min-h-11 max-w-full items-center gap-1 rounded-full bg-surface px-3.5 text-label font-extrabold wrap-anywhere text-brand ${focus}`}
          >
            전화상담 목록 보기
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HomeBannerSlides({ counselors }: { counselors: Counselor[] }) {
  const [viewport, embla] = useEmblaCarousel({ loop: false });
  const [index, setIndex] = useState(0);
  const update = useCallback(() => {
    if (!embla) return;
    setIndex(embla.selectedScrollSnap());
  }, [embla]);
  useEffect(() => {
    if (!embla) return;
    embla.on("select", update).on("reInit", update);
    return () => {
      embla.off("select", update).off("reInit", update);
    };
  }, [embla, update]);
  return (
    <section aria-label="추천 배너" data-home-banner className="min-w-0">
      <div className="relative">
        <div
          ref={viewport}
          className="cursor-grab overflow-hidden rounded-card active:cursor-grabbing"
        >
          <div className="flex touch-pan-y">
            {counselors.map((counselor) => {
              const careers = visibleCareers(counselor.careers);
              const heading = counselorHeading(counselor.name);
              return (
                <div
                  key={counselor.id}
                  data-home-banner-slide={counselor.id}
                  className="relative min-h-[228px] min-w-0 flex-[0_0_100%] cursor-grab bg-brand select-none active:cursor-grabbing"
                >
                  <div
                    data-home-banner-photo
                    className="pointer-events-none absolute inset-y-0 right-0 w-40"
                  >
                    <CounselorPhoto
                      src={counselor.imageUrl}
                      alt={`${heading} 사진`}
                      sizes="160px"
                      imageClassName="object-cover object-top"
                      className="h-full w-full"
                    />
                  </div>
                  <div
                    data-home-banner-copy
                    className="relative flex min-h-[228px] w-full max-w-[calc(100%-160px)] flex-col gap-2 py-5.5 pr-2 pl-4"
                  >
                    <span className="inline-flex h-[26px] w-fit max-w-full items-center rounded-full bg-halo px-2.5 text-fine font-extrabold text-foreground">
                      전화상담 선생님
                    </span>
                    <p
                      data-home-banner-name
                      className="text-display font-extrabold wrap-anywhere text-on-brand"
                    >
                      <CounselorName
                        name={counselor.name}
                        suffix="same"
                        honorificClassName="text-on-brand"
                      />
                    </p>
                    {careers.length > 0 ? (
                      <p
                        data-home-banner-career
                        className="line-clamp-2 min-w-0 max-w-full text-label wrap-anywhere whitespace-pre-line text-brand-soft"
                      >
                        {careers.join("\n")}
                      </p>
                    ) : null}
                    <Link
                      href={`/consult/${counselor.id}`}
                      draggable={false}
                      data-home-banner-reserve={counselor.id}
                      className={`mt-1.5 inline-flex min-h-11 w-fit max-w-full items-center gap-1 rounded-full bg-surface px-3.5 text-label font-extrabold text-brand ${focus}`}
                    >
                      상담 예약하기
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <span
          data-home-banner-index={index}
          aria-live="polite"
          className="pointer-events-none absolute right-3 bottom-3 inline-flex h-6 items-center rounded-full bg-foreground px-2.5 text-fine font-bold text-on-brand"
        >
          {index + 1} / {counselors.length}
        </span>
      </div>
    </section>
  );
}
