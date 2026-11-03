import Link from "next/link";
import type { Counselor } from "@/lib/data/counselors";
import { Chip } from "@/components/ui/chip";
import { PhotoPlaceholder } from "./photo-placeholder";
export function CounselorCard({ counselor }: { counselor: Counselor }) {
  return (
    <Link
      href={`/consult/${counselor.id}`}
      draggable={false}
      className="block h-full cursor-grab overflow-hidden rounded-card border border-gold bg-surface text-center select-none active:cursor-grabbing"
    >
      <PhotoPlaceholder className="h-32 w-full !rounded-none md:h-48" />
      <div className="p-3 md:p-4">
        <p className="text-base font-bold md:text-lg">
          {counselor.name} <span className="text-sm font-medium">선생님</span>
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {counselor.tags.map((tag, i) => (
            <Chip key={tag} primary={i === 0}>
              {tag}
            </Chip>
          ))}
        </div>
      </div>
    </Link>
  );
}
