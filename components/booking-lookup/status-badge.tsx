import { statusLabels } from "@/lib/reservations/lookup/display";
import type { ReservationStatus } from "@/lib/reservations/lookup/types";

const statusTone: Record<ReservationStatus, string> = {
  pending_payment: "bg-halo text-foreground",
  confirmed: "bg-brand text-on-brand",
  completed: "bg-brand-soft text-brand-deep",
  cancelled: "bg-border text-foreground",
};

export function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <span
      data-reservation-status={status}
      className={`inline-flex h-6.5 min-w-18 shrink-0 items-center justify-center rounded-full px-2.5 text-fine font-extrabold ${statusTone[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
