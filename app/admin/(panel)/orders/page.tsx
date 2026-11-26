import { Suspense } from "react";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { OrderAdminLoading, OrderCards } from "@/components/admin/order-cards";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ORDER_PAGE_SIZE,
  orderListUrl,
  orderStatusLabels,
  parseOrderFilters,
  type OrderSearch,
} from "@/lib/admin/order-rules";
import { getOrderList } from "@/lib/admin/orders";

export const instant = false;

export default function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrderSearch>;
}) {
  return (
    <Suspense fallback={<OrderAdminLoading />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({
  searchParams,
}: {
  searchParams: Promise<OrderSearch>;
}) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const filters = parseOrderFilters(await searchParams);
  if (!filters) return <InvalidFilters />;
  const result = await getOrderList(filters);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / ORDER_PAGE_SIZE));
  if (filters.page > pages) return <InvalidFilters />;
  return (
    <div className="space-y-4">
      <h1 className="text-title font-bold">주문 관리</h1>
      <p className="text-sm text-muted">
        주문 접수 최신순 · 모든 날짜와 시각은 한국 시간 기준입니다.
      </p>
      <form
        key={orderListUrl(filters)}
        action="/admin/orders"
        className="flex flex-col gap-3 @3xl/app:flex-row @3xl/app:items-end"
      >
        <label className="min-w-0 flex-1 space-y-1 text-sm">
          상태
          <select
            name="status"
            defaultValue={filters.status}
            className="min-h-11 w-full min-w-0 cursor-pointer rounded-input border border-border bg-surface px-3"
          >
            <option value="">전체</option>
            {Object.entries(orderStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit">필터 적용</Button>
          <Button href="/admin/orders" variant="secondary">
            필터 초기화
          </Button>
        </div>
      </form>
      <p className="text-sm text-muted">
        총 {result.count}건 · 페이지당 {ORDER_PAGE_SIZE}건
      </p>
      <OrderCards rows={result.data} returnTo={orderListUrl(filters)} />
      <nav
        aria-label="주문 목록 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button
            variant="secondary"
            href={orderListUrl(filters, filters.page - 1)}
          >
            이전
          </Button>
        )}
        <span>
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button
            variant="secondary"
            href={orderListUrl(filters, filters.page + 1)}
          >
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}

function InvalidFilters() {
  return (
    <div role="alert" className="space-y-3">
      <p className="text-error">
        필터 또는 페이지 값이 올바르지 않습니다. 선택 항목을 확인해 주세요.
      </p>
      <Button href="/admin/orders" variant="secondary">
        필터 초기화
      </Button>
    </div>
  );
}
