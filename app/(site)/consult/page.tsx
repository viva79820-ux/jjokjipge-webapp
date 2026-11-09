import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CounselorListItem } from "@/components/counselor/counselor-list-item";
import { getCounselors } from "@/lib/data/counselors";

export const metadata: Metadata = { title: `전화상담 | ${siteConfig.name}` };
type SearchParams = Promise<{ type?: string | string[] }>;
const filters = [
  { label: "전체", href: "/consult", value: "all" },
  { label: "타로", href: "/consult?type=tarot", value: "tarot" },
  { label: "사주", href: "/consult?type=saju", value: "saju" },
] as const;

async function FilteredCounselors({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { type } = await searchParams;
  const counselors = await getCounselors();
  const selected = type === "tarot" || type === "saju" ? type : "all";
  const filtered = counselors.filter(
    (counselor) => selected === "all" || counselor.field === selected,
  );
  return (
    <>
      <nav aria-label="상담 분야" className="flex gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.value}
            href={filter.href}
            aria-current={selected === filter.value ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-button font-semibold ${selected === filter.value ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>
      <p className="mt-5 text-caption text-muted">상담사 {filtered.length}명</p>
      {filtered.length ? (
        <ul className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3">
          {filtered.map((counselor) => (
            <CounselorListItem key={counselor.id} counselor={counselor} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-muted">해당 분야 상담사가 아직 없어요.</p>
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
    <div className="px-4 pt-6 md:px-6">
      <h1 className="text-xl font-bold md:text-2xl">전화상담</h1>
      <p className="mt-2 text-caption text-muted md:text-sm">
        예약한 시간에 상담사가 매장 전화로 연락드려요.
      </p>
      <div className="mt-7 md:mt-9">
        <Suspense
          fallback={
            <p className="text-muted">상담사 목록을 불러오는 중이에요.</p>
          }
        >
          <FilteredCounselors searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
