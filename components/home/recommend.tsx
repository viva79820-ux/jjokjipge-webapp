"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { DragRow } from "@/components/ui/drag-row";
import type { Counselor } from "@/lib/data/counselors";
import { displayChips } from "@/lib/counselors/rules";
import { Chip } from "@/components/ui/chip";
import { CounselorName } from "@/components/counselor/name";
import { CounselorPhoto } from "@/components/counselor/photo";
import { homeRecommendPhotoSizes } from "@/lib/images";
import { RepresentativeBadge } from "@/components/counselor/representative-badge";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeRecommend({ counselors }: { counselors: Counselor[] }) {
  return (
    <section aria-labelledby="home-recommend-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="home-recommend-title"
          className="min-w-0 text-title font-bold wrap-anywhere"
        >
          추천 선생님
        </h2>
        <Link
          href="/consult"
          className={`flex min-h-11 shrink-0 items-center gap-0.5 text-caption font-semibold text-muted ${focus}`}
        >
          전체 보기
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {counselors.length === 0 ? (
        <p className="text-body text-muted">추천 선생님이 아직 없어요.</p>
      ) : (
        <div data-home-recommend>
          <DragRow containerClassName="-ml-2.5">
            {counselors.map((counselor) => (
              <div
                key={counselor.id}
                className="min-w-0 flex-[0_0_158px] pl-2.5"
              >
                <RecommendCard counselor={counselor} />
              </div>
            ))}
          </DragRow>
        </div>
      )}
    </section>
  );
}

function RecommendCard({ counselor }: { counselor: Counselor }) {
  return (
    <Link
      href={`/consult/${counselor.id}`}
      draggable={false}
      data-home-recommend-card={counselor.id}
      className={`block h-full w-[148px] min-w-0 cursor-grab overflow-hidden rounded-card border border-border bg-surface text-foreground select-none active:cursor-grabbing ${focus}`}
    >
      <CounselorPhoto
        src={counselor.imageUrl}
        alt=""
        sizes={homeRecommendPhotoSizes}
        imageClassName="object-cover object-top"
        className="h-[168px] w-full"
      />
      <div className="flex min-w-0 flex-col gap-1.5 p-2.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-subtitle font-bold">
          <CounselorName
            name={counselor.name}
            honorificClassName="text-caption font-medium text-muted"
          />
          <RepresentativeBadge counselorId={counselor.id} tone="brand" />
        </p>
        <div className="flex min-w-0 max-w-full flex-wrap gap-1">
          {displayChips(counselor).map((tag, index) => (
            <Chip key={tag} primary={index === 0}>
              {tag}
            </Chip>
          ))}
        </div>
      </div>
    </Link>
  );
}
