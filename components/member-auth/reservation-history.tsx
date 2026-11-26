import { StatusBadge } from "@/components/booking-lookup/status-badge";
import { counselorHeading } from "@/lib/counselors/rules";
import type { MemberReservation } from "@/lib/member-auth/reservations";
import { formatSchedule } from "@/lib/reservations/lookup/display";

export function ReservationHistory({
  reservations,
}: {
  reservations: MemberReservation[];
}) {
  return (
    <section aria-labelledby="member-reservations-title" className="mt-7">
      <h2 id="member-reservations-title" className="text-title font-bold">
        예약·상담 내역
      </h2>
      {reservations.length === 0 ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          회원 계정으로 예약한 내역이 없어요.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {reservations.map((reservation) => {
            const schedule = formatSchedule(
              reservation.starts_at,
              reservation.ends_at,
            );
            return (
              <li
                key={reservation.id}
                className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
              >
                <article>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <StatusBadge status={reservation.status} />
                    <span className="text-caption text-muted break-all">
                      {reservation.reservation_no}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-body">
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">상담사</dt>
                      <dd className="mt-1 font-semibold wrap-anywhere">
                        {reservation.counselors
                          ? counselorHeading(reservation.counselors.name)
                          : "상담사 정보 없음"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">상담 상품</dt>
                      <dd className="mt-1 whitespace-pre-wrap wrap-anywhere">
                        {reservation.product_name}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">상담 일시</dt>
                      <dd className="mt-1 wrap-anywhere">
                        <time dateTime={reservation.starts_at}>
                          {schedule.date} {schedule.startTime}
                        </time>
                        {" ~ "}
                        <time dateTime={reservation.ends_at}>
                          {schedule.endTime}
                        </time>
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
