"use client";
import { useState } from "react";
import { Star, Sparkles } from "lucide-react";
import type { Counselor } from "@/lib/dummy/counselors";
import { CounselorListItem } from "./counselor-list-item";
export function CounselorList({ counselors }: { counselors: Counselor[] }) {
  const [selected, setSelected] = useState<"recommended" | "new">(
    "recommended",
  );
  const filtered = counselors.filter((c) =>
    selected === "recommended" ? c.isRecommended : c.isNew,
  );
  return (
    <>
      <div className="flex gap-1" role="tablist" aria-label="상담사 목록 분류">
        {(
          [
            ["recommended", "추천", Star],
            ["new", "신규", Sparkles],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected === value}
            onClick={() => setSelected(value)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-button font-semibold ${selected === value ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3">
        {filtered.map((c) => (
          <CounselorListItem key={c.id} counselor={c} />
        ))}
      </ul>
    </>
  );
}
