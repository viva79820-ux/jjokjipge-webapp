import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  formatReviewDate,
  maskReviewAuthor,
  reviewTarget,
  type ReviewListItem,
} from "@/lib/reviews/rules";

export function ReviewStars({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-pink"
      aria-label={`별점 5점 중 ${rating}점`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={17}
          fill={index < rating ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review,
  admin = false,
  controls,
}: {
  review: ReviewListItem;
  admin?: boolean;
  controls?: React.ReactNode;
}) {
  const target = reviewTarget(review);
  return (
    <article
      data-review-card={review.id}
      className="min-w-0 space-y-3 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
    >
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge>{target.kind}</Badge>
            <h2 className="text-subtitle font-bold wrap-anywhere">
              {target.name}
            </h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ReviewStars rating={review.rating} />
            <span className="text-caption text-muted">
              {admin
                ? review.author_name
                : maskReviewAuthor(review.author_name)}
            </span>
          </div>
        </div>
        {admin ? (
          <Badge tone={review.is_published ? "brand" : "soft"}>
            {review.is_published ? "공개" : "숨김"}
          </Badge>
        ) : null}
      </header>
      <p className="whitespace-pre-wrap text-body wrap-anywhere">
        {review.body}
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <time dateTime={review.created_at} className="text-caption text-muted">
          {formatReviewDate(review.created_at)}
        </time>
        {controls}
      </div>
    </article>
  );
}
