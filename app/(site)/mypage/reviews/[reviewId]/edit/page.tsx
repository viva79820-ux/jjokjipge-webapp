import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewForm } from "@/components/member-auth/review-form";
import { linkClass } from "@/components/member-auth/styles";
import { counselorHeading } from "@/lib/counselors/rules";
import { getMember } from "@/lib/member-auth/session";
import { listMyReviews, type MyReview } from "@/lib/reviews/member-data";
import { isUuid } from "@/lib/reviews/rules";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `상담 후기 수정 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">후기를 확인하고 있어요.</p>}>
        <EditReview params={params} />
      </Suspense>
    </div>
  );
}

async function EditReview({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  const { reviewId } = await params;
  let review: MyReview | null = null;
  let unavailable = false;
  try {
    review = isUuid(reviewId)
      ? ((await listMyReviews()).find((item) => item.id === reviewId) ?? null)
      : null;
  } catch {
    unavailable = true;
  }

  return (
    <section className="mx-auto w-full max-w-md min-w-0">
      <h1 className="text-display font-extrabold">상담 후기 수정</h1>
      {unavailable ? (
        <p className="mt-3 text-body text-muted">
          후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : review ? (
        <ReviewForm
          mode="edit"
          reviewId={review.id}
          version={review.updated_at}
          counselorName={
            review.counselor_name
              ? counselorHeading(review.counselor_name)
              : "상담사 정보 없음"
          }
          defaultRating={review.rating}
          defaultBody={review.body}
          defaultConsent={review.publish_consent}
          hiddenByAdmin={review.hidden_by_admin}
        />
      ) : (
        <p className="mt-3 text-body text-muted">
          본인 후기만 수정할 수 있어요.
        </p>
      )}
      <div className="mt-4">
        <Link href="/mypage" className={linkClass}>
          마이페이지로 돌아가기
        </Link>
      </div>
    </section>
  );
}
