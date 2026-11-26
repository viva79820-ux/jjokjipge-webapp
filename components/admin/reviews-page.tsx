import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { ReviewVisibility } from "@/components/admin/review-visibility";
import { ReviewCard } from "@/components/reviews/card";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { reviewList } from "@/lib/reviews/data";
import {
  pageSize,
  parseReviewQuery,
  reviewListUrl,
  type ReviewQuery,
} from "@/lib/reviews/rules";

export async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<ReviewQuery>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = parseReviewQuery(await searchParams, true);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-error">후기 목록 조건이 올바르지 않습니다.</p>
        <Button href="/admin/reviews" variant="secondary">
          필터 초기화
        </Button>
      </div>
    );

  const result = await reviewList(filters.page, filters.status, true);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages)
    redirect(reviewListUrl(true, pages, filters.status));

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-title font-bold">후기 관리</h1>
        <p className="mt-1 text-caption text-muted">
          후기 내용은 바꾸지 않고 공개 여부만 관리합니다.
        </p>
      </div>
      <form
        action="/admin/reviews"
        className="flex min-w-0 flex-wrap items-end gap-2"
      >
        <label className="min-w-0 flex-1 space-y-1 text-label">
          공개 상태
          <select
            name="status"
            defaultValue={filters.status}
            className="min-h-11 w-full min-w-0 cursor-pointer rounded-input border border-border bg-surface px-3"
          >
            <option value="">전체</option>
            <option value="public">공개</option>
            <option value="private">숨김</option>
          </select>
        </label>
        <Button type="submit">필터 적용</Button>
        <Button href="/admin/reviews" variant="secondary">
          초기화
        </Button>
      </form>
      <p className="text-caption text-muted">총 {result.count}건</p>
      {result.data.length ? (
        <div className="space-y-3">
          {result.data.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              admin
              controls={
                <ReviewVisibility
                  id={review.id}
                  version={review.updated_at}
                  isPublished={review.is_published}
                />
              }
            />
          ))}
        </div>
      ) : (
        <p
          role="status"
          className="rounded-card border border-border bg-surface p-6 text-center text-body text-muted"
        >
          조건에 맞는 후기가 없습니다.
        </p>
      )}
      {pages > 1 ? (
        <nav
          aria-label="관리자 후기 목록 페이지"
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {filters.page > 1 ? (
            <Button
              href={reviewListUrl(true, filters.page - 1, filters.status)}
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
              href={reviewListUrl(true, filters.page + 1, filters.status)}
              variant="secondary"
            >
              다음
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
