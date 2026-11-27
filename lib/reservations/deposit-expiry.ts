import { bookingConfig } from "@/lib/booking-config";

export const depositExpiredReason = "입금 기한 경과";
export const depositExpiredStatusLabel = "입금 기한 경과로 취소";

// Reservations created at this instant are still inside the deposit window.
export function pendingWindowStart(now: number) {
  return new Date(
    now - bookingConfig.depositHours * 60 * 60 * 1000,
  ).toISOString();
}

export function isPastDepositDeadline(createdAt: string, now: number) {
  const created = Date.parse(createdAt);
  return (
    Number.isFinite(created) && created < Date.parse(pendingWindowStart(now))
  );
}

export function depositExpiryPatch(now: number) {
  return {
    status: "cancelled" as const,
    cancelled_at: new Date(now).toISOString(),
    cancel_reason: depositExpiredReason,
  };
}

export function cancellationStatusLabel(
  status: string,
  cancelReason: string | null | undefined,
  fallback: string,
) {
  if (status === "cancelled" && cancelReason === depositExpiredReason)
    return depositExpiredStatusLabel;
  return fallback;
}
