import { ExternalLink } from "lucide-react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getMember } from "@/lib/member-auth/session";
import { reviewList } from "@/lib/reviews/data";
import { reviewWriteHref } from "@/lib/reviews/member-rules";
import { naverReviewLinks } from "@/lib/reviews/naver-links";
import {
  pageSize,
  parseReviewQuery,
  reviewListUrl,
  type ReviewQuery,
} from "@/lib/reviews/rules";
import { ReviewCard } from "./card";

const externalButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export async function PublicReviewPage({
  searchParams,
}: {
  searchParams: Promise<ReviewQuery>;
}) {
  await connection();
  const filters = parseReviewQuery(await searchParams);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-error">후기 목록 조건이 올바르지 않습니다.</p>
        <Button href="/reviews" variant="secondary">
          처음부터 보기
        </Button>
      </div>
    );

  const result = await reviewList(filters.page);
  if (!result) throw Error("후기 목록을 불러오지 못했습니다.");
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages) redirect(reviewListUrl(false, pages));
  const writeHref = reviewWriteHref(Boolean(await getMember()));

  return (
    <div className="min-w-0 px-4 pt-6 @3xl/app:px-6 @3xl/app:pt-8">
      <header className="mb-7 space-y-2">
        <h1 className="text-display font-extrabold">고객 후기</h1>
        <p className="text-body text-muted">
          공개에 동의한 상담·상품 후기만 보여 드려요.
        </p>
      </header>

      <section aria-labelledby="naver-review-title" className="mb-7">
        <h2 id="naver-review-title" className="mb-3 text-title font-bold">
          네이버 방문자 리뷰
        </h2>
        <div className="rounded-card border border-border bg-brand-soft p-3 @3xl/app:p-4">
          <p className="text-caption text-brand-deep">
            네이버에 등록된 매장별 리뷰는 아래 링크에서 확인해 주세요.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {naverReviewLinks.map((store) => (
              <a
                key={store.placeId}
                href={store.href}
                target="_blank"
                rel="noopener noreferrer"
                data-naver-review-link={store.placeId}
                className={externalButton}
              >
                <span className="min-w-0 wrap-anywhere">
                  {store.storeName} 네이버 리뷰 보러가기
                </span>
                <ExternalLink
                  size={16}
                  className="shrink-0"
                  aria-hidden="true"
                />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="site-review-title" className="pb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 id="site-review-title" className="text-title font-bold">
              운세통 후기
            </h2>
            <Button href={writeHref} className="shrink-0">
              후기 쓰기
            </Button>
          </div>
          <p className="text-caption text-muted">총 {result.count}건</p>
        </div>
        {result.data.length ? (
          <div className="space-y-3">
            {result.data.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <div
            role="status"
            className="rounded-card border border-border bg-surface p-6 text-center text-body text-muted"
          >
            아직 공개된 후기가 없어요.
          </div>
        )}
        {pages > 1 ? (
          <nav
            aria-label="후기 목록 페이지"
            className="mt-5 flex flex-wrap items-center justify-center gap-3"
          >
            {filters.page > 1 ? (
              <Button
                href={reviewListUrl(false, filters.page - 1)}
                variant="secondary"
              >
                이전
              </Button>
            ) : null}
            <span className="text-label">
              {filters.page} / {pages}
            </span>
            {filters.page < pages ? (
              <Button
                href={reviewListUrl(false, filters.page + 1)}
                variant="secondary"
              >
                다음
              </Button>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
