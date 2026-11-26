import Link from "next/link";
import { Phone } from "lucide-react";
import type { Counselor } from "@/lib/data/counselors";
import { consultPriceLabel } from "@/lib/counselors/display";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CounselorName } from "./name";
import { CounselorPhoto } from "./photo";
import { RepresentativeBadge } from "./representative-badge";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function ConsultListCard({ counselor }: { counselor: Counselor }) {
  const href = `/consult/${counselor.id}`;
  const heading = counselorHeading(counselor.name);
  const price = consultPriceLabel(counselor.products);
  const storeName = counselor.storeName.trim() ? counselor.storeName : "";
  return (
    <li className="flex h-full min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3.5">
      <div className="flex min-w-0 gap-3">
        <Link
          href={href}
          aria-label={`${heading} 상세 보기`}
          className={`shrink-0 cursor-pointer rounded-xl ${focus}`}
        >
          <CounselorPhoto
            src={counselor.imageUrl}
            alt={`${heading} 사진`}
            sizes="84px"
            imageClassName="object-cover object-[center_18%]"
            className="size-21 rounded-xl"
          />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1.25">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
            <Link
              href={href}
              className={`-my-2.5 inline-flex min-h-11 min-w-0 cursor-pointer items-center text-subtitle font-bold ${focus}`}
            >
              <CounselorName
                name={counselor.name}
                honorificClassName="text-caption font-medium text-muted"
              />
            </Link>
            <RepresentativeBadge counselorId={counselor.id} tone="brand" />
          </div>
          {storeName ? (
            <p className="text-fine wrap-anywhere text-muted">{storeName}</p>
          ) : null}
          <div className="flex min-w-0 max-w-full flex-wrap gap-1">
            {displayChips(counselor).map((tag, index) => (
              <Chip key={tag} primary={index === 0}>
                {tag}
              </Chip>
            ))}
          </div>
          {counselor.intro.trim() ? (
            <p className="text-caption wrap-anywhere text-foreground">
              {counselor.intro}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {price ? (
          <>
            <p className="min-w-0 text-body font-extrabold wrap-anywhere text-pink">
              {price}
            </p>
            <Button href={href} className="shrink-0 gap-1.5 whitespace-nowrap">
              <Phone size={16} aria-hidden="true" />
              전화상담 예약
            </Button>
          </>
        ) : (
          <p className="text-caption text-muted">등록된 상담 상품이 없어요.</p>
        )}
      </div>
    </li>
  );
}
