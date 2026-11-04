import { Suspense } from "react";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import {
  AdminLoading,
  ReservationCards,
} from "@/components/admin/reservation-cards";
import { Button } from "@/components/ui/button";
import {
  ReservationDateRange,
  ResetReservationFilters,
} from "@/components/admin/reservation-date-range";
import { requireAdmin } from "@/lib/admin/auth";
import { getReservationList } from "@/lib/admin/reservations";
import {
  listUrl,
  parseFilters,
  statusLabels,
  PAGE_SIZE,
  type Search,
} from "@/lib/admin/reservation-rules";

export const instant = false;

export default function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Reservations searchParams={searchParams} />
    </Suspense>
  );
}

async function Reservations({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = parseFilters(await searchParams);
  if (!filters) return <InvalidFilters />;
  const result = await getReservationList(filters);
  if (!result) return <AdminAccessDenied />;
  if (result.invalid) return <InvalidFilters />;
  const pages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
  if (filters.page > pages) return <InvalidFilters />;
  const fieldClass =
    "min-h-11 w-full min-w-0 rounded-button border border-border bg-surface px-3";
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">예약 관리</h1>
      <p className="text-sm text-muted">
        상담 시작일 기준 · 한국 시간(Asia/Seoul) · 최근 접수순
      </p>
      <form
        key={listUrl(filters)}
        action="/admin/reservations"
        className="grid gap-3 md:grid-cols-2"
      >
        <label className="space-y-1 text-sm">
          상태
          <select
            name="status"
            defaultValue={filters.status}
            className={`${fieldClass} cursor-pointer`}
          >
            <option value="">전체</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          상담사
          <select
            name="counselor"
            defaultValue={filters.counselor}
            className={`${fieldClass} cursor-pointer`}
          >
            <option value="">전체 상담사</option>
            {result.counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <ReservationDateRange from={filters.from} to={filters.to} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="exclude_cancelled"
            value="1"
            defaultChecked={filters.excludeCancelled}
          />
          취소 예약 제외
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">필터 적용</Button>
          <ResetReservationFilters />
        </div>
      </form>
      <p className="text-sm text-muted">총 {result.count}건 · 페이지당 20건</p>
      <ReservationCards rows={result.data} returnTo={listUrl(filters)} />
      <nav
        aria-label="예약 목록 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button variant="secondary" href={listUrl(filters, filters.page - 1)}>
            이전
          </Button>
        )}
        <span>
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button variant="secondary" href={listUrl(filters, filters.page + 1)}>
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}
function InvalidFilters() {
  return (
    <div role="alert" className="space-y-3">
      <p className="text-error">
        필터 또는 페이지 값이 올바르지 않습니다. 날짜와 선택 항목을 확인해
        주세요.
      </p>
      <Button href="/admin/reservations" variant="secondary">
        필터 초기화
      </Button>
    </div>
  );
}
