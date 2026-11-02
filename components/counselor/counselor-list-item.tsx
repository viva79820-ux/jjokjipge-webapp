import Link from "next/link";
import type { Counselor } from "@/lib/dummy/counselors";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import { PhotoPlaceholder } from "./photo-placeholder";
export function CounselorListItem({ counselor }: { counselor: Counselor }) {
  const href = `/consult/${counselor.id}`;
  return (
    <li className="flex items-center gap-3 border-b border-border py-3">
      <Link
        href={href}
        aria-label={`${counselor.name} 선생님 상세 보기`}
        className="shrink-0"
      >
        <PhotoPlaceholder className="h-20 w-16" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-serif text-[17px] font-bold">
          {counselor.name}{" "}
          <span className="font-sans text-sm font-medium">선생님</span>
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          {counselor.tags.map((tag, i) => (
            <Chip key={tag} primary={i === 0}>
              {tag}
            </Chip>
          ))}
        </div>
        <p className="mt-1 truncate text-[13px] text-muted">
          {counselor.intro}
        </p>
      </div>
      <Button href={href} className="shrink-0">
        전화 상담 예약
      </Button>
    </li>
  );
}
