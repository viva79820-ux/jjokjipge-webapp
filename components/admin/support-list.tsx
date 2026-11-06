import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "./access-denied";
import { getFaqList, getInquiryList } from "@/lib/admin/support-data";
import {
  categoryLabels,
  faqCategories,
  inquiryStatuses,
  visibilityLabels,
  parseSupportFilters,
  supportUrl,
  type Kind,
  type Search,
} from "@/lib/admin/support-rules";
import { formatTime } from "@/lib/admin/reservation-rules";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SupportFiltersReset } from "./support-reset";

export async function SupportList({
  kind,
  searchParams,
}: {
  kind: Kind;
  searchParams: Promise<Search>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = parseSupportFilters(kind, await searchParams);
  const base = `/admin/support/${kind}`;
  if (!filters)
    return (
      <div role="alert">
        <p>필터 또는 페이지 값이 올바르지 않습니다.</p>
        <Button href={base}>필터 초기화</Button>
      </div>
    );
  const result =
    kind === "faqs" ? await getFaqList(filters) : await getInquiryList(filters);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / 20));
  if (filters.page > pages) redirect(supportUrl(kind, filters, pages));
  const returnTo = supportUrl(kind, filters);
  const categories = kind === "faqs" ? faqCategories : categoryLabels;
  const statuses = kind === "faqs" ? visibilityLabels : inquiryStatuses;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {kind === "faqs" ? "FAQ 관리" : "문의 관리"}
      </h1>
      {kind === "faqs" && (
        <Button href={`${base}/new?returnTo=${encodeURIComponent(returnTo)}`}>
          FAQ 등록
        </Button>
      )}
      <form key={returnTo} action={base} className="grid gap-3 md:grid-cols-2">
        <label>
          분류
          <select
            name="category"
            defaultValue={filters.category}
            className="mt-1 min-h-11 w-full rounded-button border border-border bg-surface px-3"
          >
            <option value="">전체</option>
            {Object.entries(categories).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          {kind === "faqs" ? "공개 상태" : "상태"}
          <select
            name="status"
            defaultValue={filters.status}
            className="mt-1 min-h-11 w-full rounded-button border border-border bg-surface px-3"
          >
            <option value="">전체</option>
            {Object.entries(statuses).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit">필터 적용</Button>
          <SupportFiltersReset href={base} />
        </div>
      </form>
      <p className="text-sm text-muted">총 {result.count}건 · 페이지당 20건</p>
      {!result.data.length && <p role="status">등록된 항목이 없습니다.</p>}
      <div className="space-y-3">
        {result.data.map((row) => (
          <article
            key={row.id}
            className="space-y-2 rounded-card border border-border bg-surface p-3 wrap-anywhere md:p-4"
          >
            {"question" in row ? (
              <>
                <p className="font-bold">{row.question}</p>
                <Badge>{row.is_active ? "공개" : "비공개"}</Badge>
                <p>표시 순서: {row.sort_order}</p>
              </>
            ) : (
              <>
                <p className="font-bold">
                  {row.inquiry_no} · {row.customer_name}
                </p>
                <Badge>{inquiryStatuses[row.status]}</Badge>
                <p>{formatTime(row.created_at)}</p>
              </>
            )}
            <p>{categories[row.category as keyof typeof categories]}</p>
            <Button
              variant="secondary"
              href={`${base}/${row.id}?returnTo=${encodeURIComponent(returnTo)}`}
            >
              {kind === "faqs" ? "편집" : "상세 보기"}
            </Button>
          </article>
        ))}
      </div>
      <nav
        aria-label="목록 페이지"
        className="flex items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button href={supportUrl(kind, filters, filters.page - 1)}>
            이전
          </Button>
        )}
        <span>
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button href={supportUrl(kind, filters, filters.page + 1)}>
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}
