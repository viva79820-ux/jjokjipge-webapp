import { OrderStatusBadge } from "@/components/order-lookup/status-badge";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/admin/reservation-rules";
import type { AdminOrderSummary } from "@/lib/admin/orders";
import { formatWon } from "@/lib/products/rules";

export function OrderCards({
  rows,
  returnTo,
}: {
  rows: AdminOrderSummary[];
  returnTo?: string;
}) {
  if (!rows.length)
    return (
      <p className="rounded-card border border-border bg-surface p-4 text-muted">
        조건에 맞는 주문이 없습니다.
      </p>
    );
  return (
    <ul className="grid gap-2 @3xl/app:gap-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-bold">{row.order_no}</p>
            <OrderStatusBadge status={row.status} />
          </div>
          <p className="mt-2 text-sm">{formatTime(row.created_at)}</p>
          <p className="mt-1 break-words text-sm">
            {row.customer_name} · {formatWon(row.total)}
          </p>
          {row.tracking_number && (
            <p className="mt-1 text-sm break-all text-muted">
              송장번호 {row.tracking_number}
            </p>
          )}
          <Button
            className="mt-2"
            variant="secondary"
            href={`/admin/orders/${row.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          >
            주문 상세
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function OrderAdminLoading() {
  return (
    <p role="status" className="p-4 text-muted">
      주문 정보를 불러오고 있습니다.
    </p>
  );
}
