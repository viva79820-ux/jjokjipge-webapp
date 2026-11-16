import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConsultListCard } from "@/components/counselor/consult-list-card";
import { ConsultSteps } from "@/components/counselor/consult-steps";
import { filterByField } from "@/lib/counselors/rules";
import { getCounselors } from "@/lib/data/counselors";

export const metadata: Metadata = { title: `전화상담 | ${siteConfig.name}` };
type SearchParams = Promise<{ type?: string | string[] }>;
const filters = [
  { label: "전체", href: "/consult", value: "all" },
  { label: "타로", href: "/consult?type=tarot", value: "tarot" },
  { label: "사주", href: "/consult?type=saju", value: "saju" },
] as const;
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

async function FilteredCounselors({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { type } = await searchParams;
  const counselors = await getCounselors();
  const selected = type === "tarot" || type === "saju" ? type : "all";
  const filtered = filterByField(counselors, selected);
  return (
    <>
      <nav aria-label="상담 분야" className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = selected === filter.value;
          return (
            <Link
              key={filter.value}
              href={filter.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4.5 text-label font-bold ${focus} ${active ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>
      <p className="text-caption font-semibold text-muted">
        선생님 {filtered.length}명
      </p>
      {filtered.length ? (
        <ul
          data-counselor-list
          className="grid min-w-0 gap-3 @3xl/app:grid-cols-2"
        >
          {filtered.map((counselor) => (
            <ConsultListCard key={counselor.id} counselor={counselor} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted">해당 분야 상담사가 아직 없어요.</p>
      )}
    </>
  );
}

export default function ConsultPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pt-6 @3xl/app:px-6">
      <div>
        <h1 className="text-display font-extrabold">전화상담</h1>
        <p className="mt-1 text-body text-muted">
          예약한 시간에 선생님이 매장 전화로 연락드려요.
        </p>
      </div>
      <ConsultSteps />
      <Suspense
        fallback={
          <p className="text-muted">상담사 목록을 불러오는 중이에요.</p>
        }
      >
        <FilteredCounselors searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
