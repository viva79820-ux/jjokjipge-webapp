import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ReviewWriteEntry } from "@/components/member-auth/review-write-entry";
import { getMemberReservations } from "@/lib/member-auth/reservations";
import { getMember } from "@/lib/member-auth/session";
import { listMyReviews } from "@/lib/reviews/member-data";
import { canWriteReview, reviewWriteHref } from "@/lib/reviews/member-rules";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `후기 쓰기 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense
        fallback={
          <p role="status">후기를 쓸 수 있는 내역을 확인하고 있어요.</p>
        }
      >
        <WriteEntry />
      </Suspense>
    </div>
  );
}

async function WriteEntry() {
  await connection();
  const member = await getMember();
  if (!member) redirect(reviewWriteHref(false));
  const [reservations, reviews] = await Promise.all([
    getMemberReservations(member.id),
    listMyReviews().then(
      (rows) => ({ rows, unavailable: false }),
      () => ({ rows: [], unavailable: true }),
    ),
  ]);
  const reviewedReservationIds = new Set(
    reviews.rows
      .map((review) => review.reservation_id)
      .filter((id): id is string => Boolean(id)),
  );
  const writable = reviews.unavailable
    ? []
    : reservations.filter((reservation) =>
        canWriteReview(reservation, reviewedReservationIds),
      );

  return (
    <ReviewWriteEntry
      reservations={writable}
      unavailable={reviews.unavailable}
    />
  );
}
