import Link from "next/link";
import type { Counselor } from "@/lib/data/counselors";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { Chip } from "@/components/ui/chip";
import { CounselorName } from "./name";
import { CounselorPhoto } from "./photo";
export function CounselorCard({ counselor }: { counselor: Counselor }) {
  const chips = displayChips(counselor);
  return (
    <Link
      href={`/consult/${counselor.id}`}
      draggable={false}
      className="block h-full min-w-0 cursor-grab overflow-hidden rounded-card border border-gold bg-surface text-center select-none active:cursor-grabbing"
    >
      <CounselorPhoto
        src={counselor.imageUrl}
        alt={`${counselorHeading(counselor.name)} 사진`}
        sizes="(min-width: 768px) 180px, 42vw"
        className="h-32 w-full rounded-none md:h-48"
      />
      <div className="min-w-0 max-w-full p-3 md:p-4">
        <p className="wrap-anywhere text-base font-bold md:text-lg">
          <CounselorName name={counselor.name} />
        </p>
        <div className="mt-2 flex min-w-0 max-w-full flex-wrap justify-center gap-1">
          {chips.map((tag, index) => (
            <Chip key={tag} primary={index === 0}>
              {tag}
            </Chip>
          ))}
        </div>
      </div>
    </Link>
  );
}
