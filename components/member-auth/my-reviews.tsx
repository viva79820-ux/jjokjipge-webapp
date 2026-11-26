import { DeleteReviewButton } from "@/components/member-auth/delete-review-button";
import { ReviewStars } from "@/components/reviews/card";
import { Button } from "@/components/ui/button";
import { counselorHeading } from "@/lib/counselors/rules";
import type { MyReview } from "@/lib/reviews/member-data";
import {
  noWritableReviewMessage,
  reviewWritePath,
  reviewVisibilityLabel,
} from "@/lib/reviews/member-rules";
import { formatReviewDate } from "@/lib/reviews/rules";

export function MyReviews({
  reviews,
  unavailable = false,
  writableCount = 0,
}: {
  reviews: MyReview[];
  unavailable?: boolean;
  writableCount?: number;
}) {
  return (
    <section aria-labelledby="my-reviews-title" className="mt-7">
      <h2 id="my-reviews-title" className="text-title font-bold">
        내 후기
      </h2>
      {unavailable ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          내 후기를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : reviews.length === 0 ? (
        <div className="mt-3 rounded-card border border-border bg-surface p-3 @3xl/app:p-4">
          <p className="text-body text-muted">작성한 후기가 없어요.</p>
          {writableCount === 0 ? (
            <p className="mt-2 text-body text-muted">
              {noWritableReviewMessage}
            </p>
          ) : null}
          <div className="mt-3">
            <Button href={reviewWritePath}>후기 쓰기</Button>
          </div>
        </div>
      ) : (
        <ol className="mt-3 space-y-3">
          {reviews.map((review) => {
            const counselor = review.counselor_name
              ? counselorHeading(review.counselor_name)
              : "상담사 정보 없음";
            return (
              <li
                key={review.id}
                data-my-review={review.id}
                className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
              >
                <article className="space-y-3">
                  <h3 className="text-subtitle font-bold wrap-anywhere">
                    {counselor}
                  </h3>
                  <ReviewStars rating={review.rating} />
                  <dl className="space-y-2 text-body">
                    <div>
                      <dt className="text-caption text-muted">작성일</dt>
                      <dd className="mt-1">
                        <time dateTime={review.created_at}>
                          {formatReviewDate(review.created_at)}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-muted">공개 여부</dt>
                      <dd className="mt-1 font-semibold wrap-anywhere">
                        {reviewVisibilityLabel(review)}
                      </dd>
                    </div>
                  </dl>
                  <p className="whitespace-pre-wrap text-body wrap-anywhere">
                    {review.body}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button
                      href={`/mypage/reviews/${review.id}/edit`}
                      variant="secondary"
                    >
                      수정
                    </Button>
                    <DeleteReviewButton
                      id={review.id}
                      version={review.updated_at}
                    />
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
