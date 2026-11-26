import { formatWon } from "@/lib/products/rules";
import type { OrderLookupResult } from "@/lib/orders/lookup/types";
import { OrderStatusBadge } from "./status-badge";

export function OrderResult({ result }: { result: OrderLookupResult }) {
  return (
    <div data-order-lookup-result className="mt-7 min-w-0 scroll-mb-28">
      <h2
        id="order-lookup-result-title"
        tabIndex={-1}
        className="scroll-mt-4 text-title font-bold focus:outline-none"
      >
        조회 결과
      </h2>
      <section
        aria-label="주문 정보"
        className="mt-3 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <dl className="space-y-3 text-body">
          <div className="min-w-0">
            <dt className="text-caption text-muted">주문번호</dt>
            <dd className="font-semibold break-all">{result.orderNo}</dd>
          </div>
          <div>
            <dt className="mb-1 text-caption text-muted">주문 상태</dt>
            <dd>
              <OrderStatusBadge status={result.status} />
            </dd>
          </div>
        </dl>
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-subtitle font-bold">주문 상품</h3>
          <ul className="mt-3 space-y-3">
            {result.items.map((item, index) => (
              <li
                key={`${index}-${item.name}`}
                className="min-w-0 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <p className="font-semibold whitespace-pre-wrap wrap-anywhere">
                  {item.name}
                </p>
                <p className="mt-1 text-caption text-muted">
                  {formatWon(item.unitPrice)} × {item.quantity}개
                </p>
                <p className="mt-1 font-bold">{formatWon(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
        </div>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-body">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">상품 금액</dt>
            <dd>{formatWon(result.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">배송비</dt>
            <dd>{formatWon(result.shippingFee)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-bold">총 금액</dt>
            <dd className="text-price font-extrabold text-pink">
              {formatWon(result.total)}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-label="배송 정보"
        className="mt-4 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h3 className="text-subtitle font-bold">배송 정보</h3>
        <dl className="mt-3 space-y-3 text-body">
          <div>
            <dt className="text-caption text-muted">우편번호</dt>
            <dd>{result.postalCode}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">배송지</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              {result.addressLine1}
              {result.addressLine2 ? `\n${result.addressLine2}` : ""}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">송장번호</dt>
            <dd className="wrap-anywhere">
              {result.trackingNumber ?? "배송 시작 후 확인할 수 있어요."}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
