import { bookingConfig } from "@/lib/booking-config";

export function koreanDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function bookingDates(now = new Date()) {
  const today = koreanDate(now);
  return Array.from({ length: bookingConfig.maxDaysAhead + 1 }, (_, i) =>
    addDays(today, i),
  );
}

export function isBookingDate(date: string, now = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && bookingDates(now).includes(date);
}

export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+09:00`));
}

export function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function reservationTimeLabel(start: string, end: string) {
  return `${dateLabel(koreanDate(new Date(start)))} ${timeLabel(start)}~${timeLabel(end)}`;
}

export type Slot = { startsAt: string; available: boolean };
export function calculateSlots(
  date: string,
  minutes: number,
  busy: { starts_at: string; ends_at: string }[],
  now = new Date(),
): Slot[] {
  if (!isBookingDate(date, now) || !Number.isInteger(minutes) || minutes <= 0)
    return [];
  const opening = Date.parse(
    `${date}T${String(bookingConfig.openHour).padStart(2, "0")}:00:00+09:00`,
  );
  const closing = Date.parse(
    `${date}T${String(bookingConfig.closeHour).padStart(2, "0")}:00:00+09:00`,
  );
  const slots: Slot[] = [];
  for (
    let start = opening;
    start < closing;
    start += bookingConfig.slotMinutes * 60000
  ) {
    const end = start + minutes * 60000;
    slots.push({
      startsAt: new Date(start).toISOString(),
      available:
        start >= now.getTime() + bookingConfig.minLeadMinutes * 60000 &&
        end <= closing &&
        !busy.some(
          (r) => start < Date.parse(r.ends_at) && end > Date.parse(r.starts_at),
        ),
    });
  }
  return slots;
}
