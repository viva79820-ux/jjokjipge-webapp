import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsultFieldFilter } from "@/components/counselor/consult-field-filter";
import { ConsultSteps } from "@/components/counselor/consult-steps";
import { consultFieldParam } from "@/lib/counselors/rules";
import { getCounselors } from "@/lib/data/counselors";

export const metadata: Metadata = { title: `전화상담 | ${siteConfig.name}` };
type SearchParams = Promise<{ type?: string | string[] }>;

async function FilteredCounselors({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { type } = await searchParams;
  const counselors = await getCounselors();
  return (
    <ConsultFieldFilter
      counselors={counselors}
      initialSelected={consultFieldParam(type)}
    />
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
