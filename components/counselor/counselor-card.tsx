import Link from "next/link";
import type { Counselor } from "@/lib/dummy/counselors";
import { Chip } from "@/components/ui/chip";
import { PhotoPlaceholder } from "./photo-placeholder";
export function CounselorCard({ counselor }: { counselor: Counselor }) {
  return (
    <Link
      href={`/consult/${counselor.id}`}
      className="w-40 shrink-0 rounded-card border border-gold bg-surface p-3"
    >
      <PhotoPlaceholder className="h-32 w-full" />
      <p className="mt-3 font-serif text-[17px] font-bold">
        {counselor.name}{" "}
        <span className="font-sans text-sm font-medium">선생님</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {counselor.tags.map((tag, i) => (
          <Chip key={tag} primary={i === 0}>
            {tag}
          </Chip>
        ))}
      </div>
    </Link>
  );
}
