import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTime, statusLabels } from "@/lib/admin/reservation-rules";
import type { ReservationSummary } from "@/lib/admin/reservations";

export function ReservationCards({
  rows,
  returnTo,
  compact = false,
}: {
  rows: ReservationSummary[];
  returnTo?: string;
  compact?: boolean;
}) {
  if (!rows.length)
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-muted">
        조건에 맞는 예약이 없습니다.
      </p>
    );
  return (
    <ul className="grid gap-2 md:gap-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-bold">{row.reservation_no}</p>
            <Badge>{statusLabels[row.status]}</Badge>
          </div>
          <p className="mt-2 text-sm">{formatTime(row.starts_at)}</p>
          <p className="mt-1 break-words text-sm">
            {row.counselors?.name ?? "상담사 정보 없음"} · {row.customer_name}
          </p>
          {!compact && (
            <p className="mt-1 break-words text-sm text-muted">
              {row.product_name} · {row.price.toLocaleString("ko-KR")}원
            </p>
          )}
          <Button
            className="mt-2"
            variant="secondary"
            href={`/admin/reservations/${row.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          >
            예약 상세
          </Button>
        </li>
      ))}
    </ul>
  );
}
export function AdminLoading() {
  return (
    <p role="status" className="p-4 text-muted">
      예약 정보를 불러오고 있습니다.
    </p>
  );
}
