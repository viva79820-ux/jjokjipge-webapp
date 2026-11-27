import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewForm } from "@/components/member-auth/review-form";
import { linkClass } from "@/components/member-auth/styles";
import { counselorHeading } from "@/lib/counselors/rules";
import { getMember } from "@/lib/member-auth/session";
import { getReviewReservation, listMyReviews } from "@/lib/reviews/member-data";
import { reviewEligibilityMessage } from "@/lib/reviews/member-rules";
import { isUuid } from "@/lib/reviews/rules";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `상담 후기 작성 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">예약 정보를 확인하고 있어요.</p>}>
        <WriteReview params={params} />
      </Suspense>
    </div>
  );
}

async function WriteReview({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  const { reservationId } = await params;
  if (!isUuid(reservationId)) redirect("/mypage");

  const reservation = await getReviewReservation(member.id, reservationId);
  let existing = false;
  try {
    existing = (await listMyReviews()).some(
      (review) => review.reservation_id === reservationId,
    );
  } catch {
    existing = false;
  }

  return (
    <section className="mx-auto w-full max-w-md min-w-0">
      <h1 className="text-display font-extrabold">상담 후기 작성</h1>
      {existing ? (
        <p className="mt-3 text-body text-muted">
          이미 이 예약의 후기를 작성했어요.
        </p>
      ) : !reservation.ok ? (
        <p className="mt-3 text-body text-muted">
          {reviewEligibilityMessage(reservation.eligibility)}
        </p>
      ) : (
        <ReviewForm
          mode="create"
          reservationId={reservation.reservation.id}
          counselorName={
            reservation.reservation.counselor_name
              ? counselorHeading(reservation.reservation.counselor_name)
              : "상담사 정보 없음"
          }
          productName={reservation.reservation.product_name}
        />
      )}
      <div className="mt-4">
        <Link href="/mypage" className={linkClass}>
          마이페이지로 돌아가기
        </Link>
      </div>
    </section>
  );
}
