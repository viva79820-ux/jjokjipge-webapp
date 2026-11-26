import Link from "next/link";
import { linkClass } from "@/components/member-auth/styles";
import { Button } from "@/components/ui/button";
import { counselorHeading } from "@/lib/counselors/rules";
import type { MemberReservation } from "@/lib/member-auth/reservations";
import { noWritableReviewMessage } from "@/lib/reviews/member-rules";

export function ReviewWriteEntry({
  reservations,
  unavailable = false,
}: {
  reservations: MemberReservation[];
  unavailable?: boolean;
}) {
  return (
    <section className="mx-auto w-full max-w-md min-w-0">
      <h1 className="text-display font-extrabold">후기 쓰기</h1>
      {unavailable ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          후기를 쓸 수 있는 내역을 확인하지 못했어요. 잠시 후 다시 시도해
          주세요.
        </p>
      ) : reservations.length === 0 ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          {noWritableReviewMessage}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {reservations.map((reservation) => (
            <li
              key={reservation.id}
              className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
            >
              <article className="space-y-3">
                <h2 className="text-subtitle font-bold wrap-anywhere">
                  {reservation.counselors
                    ? counselorHeading(reservation.counselors.name)
                    : "상담사 정보 없음"}
                </h2>
                <p className="text-body wrap-anywhere">
                  {reservation.product_name}
                </p>
                <Button href={`/mypage/reviews/new/${reservation.id}`}>
                  후기 쓰기
                </Button>
              </article>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4">
        <Link href="/mypage" className={linkClass}>
          마이페이지로 돌아가기
        </Link>
      </div>
    </section>
  );
}
