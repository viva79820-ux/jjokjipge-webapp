"use client";
import { useState } from "react";
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
            ["recommended", "추천"],
            ["new", "신규"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selected === value}
            onClick={() => setSelected(value)}
            className={`min-h-11 flex-1 rounded-button font-semibold ${selected === value ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ul>
        {filtered.map((c) => (
          <CounselorListItem key={c.id} counselor={c} />
        ))}
      </ul>
    </>
  );
}
