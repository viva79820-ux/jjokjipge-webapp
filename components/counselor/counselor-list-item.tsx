import Link from "next/link";
import { Phone } from "lucide-react";
import type { Counselor } from "@/lib/data/counselors";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { CounselorName } from "./name";
import { CounselorPhoto } from "./photo";
export function CounselorListItem({ counselor }: { counselor: Counselor }) {
  const href = `/consult/${counselor.id}`;
  const chips = displayChips(counselor);
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-card border border-border bg-surface p-3 md:gap-3 md:p-4">
      <Link
        href={href}
        aria-label={`${counselorHeading(counselor.name)} 상세 보기`}
        className="shrink-0"
      >
        <CounselorPhoto
          src={counselor.imageUrl}
          alt={`${counselorHeading(counselor.name)} 사진`}
          sizes="64px"
          className="h-20 w-16 rounded-card"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block max-w-full wrap-anywhere text-base font-bold md:text-lg"
        >
          <CounselorName name={counselor.name} />
        </Link>
        <div className="mt-1 flex min-w-0 max-w-full flex-wrap gap-1">
          {chips.map((tag, index) => (
            <Chip key={tag} primary={index === 0}>
              {tag}
            </Chip>
          ))}
        </div>
        <p className="mt-1 truncate text-caption text-muted md:text-sm">
          {counselor.intro}
        </p>
      </div>
      <Button href={href} className="shrink-0 gap-1 whitespace-nowrap">
        <Phone size={16} aria-hidden="true" />
        전화 상담 예약
      </Button>
    </li>
  );
}
