import Link from "next/link";
import { OrderStatusBadge } from "@/components/order-lookup/status-badge";
import { BankTransferAccount } from "@/components/payments/bank-transfer-account";
import { linkClass } from "@/components/member-auth/styles";
import type { MemberOrderDetail } from "@/lib/member-auth/orders";
import { formatWon } from "@/lib/products/rules";

export function MemberOrderDetailView({ order }: { order: MemberOrderDetail }) {
  return (
    <div className="min-w-0">
      <Link href="/mypage" className={linkClass}>
        주문 목록으로
      </Link>
      <h1 className="mt-3 text-display font-extrabold wrap-anywhere">
        주문 상세
      </h1>
      <section
        aria-label="주문 정보"
        className="mt-5 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <OrderStatusBadge status={order.status} />
        <dl className="mt-4 space-y-3 text-body">
          <div className="min-w-0">
            <dt className="text-caption text-muted">주문번호</dt>
            <dd className="mt-1 font-semibold break-all">{order.orderNo}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">주문일</dt>
            <dd className="mt-1">
              <time dateTime={order.orderedAt}>{order.orderedAtLabel}</time>
            </dd>
          </div>
        </dl>
        <div className="mt-5 border-t border-border pt-4">
          <h2 className="text-subtitle font-bold">상품</h2>
          <ul className="mt-3 space-y-3">
            {order.items.map((item, index) => (
              <li
                key={`${order.id}-${index}`}
                className="min-w-0 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <p className="font-semibold wrap-anywhere">{item.name}</p>
                <p className="mt-1 text-caption text-muted">
                  {formatWon(item.unitPrice)} × {item.quantity}개
                </p>
                <p className="mt-1 font-bold">{formatWon(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
        </div>
        <dl className="mt-5 space-y-2 border-t border-border pt-4 text-body">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-muted">상품 금액</dt>
            <dd>{formatWon(order.subtotal)}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="text-muted">배송비</dt>
            <dd>{formatWon(order.shippingFee)}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <dt className="font-bold">금액</dt>
            <dd className="text-price font-extrabold text-pink">
              {formatWon(order.total)}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-label="배송지"
        className="mt-4 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2 className="text-subtitle font-bold">배송지</h2>
        <dl className="mt-3 space-y-3 text-body">
          <div>
            <dt className="text-caption text-muted">우편번호</dt>
            <dd className="mt-1">{order.postalCode}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">주소</dt>
            <dd className="mt-1 wrap-anywhere whitespace-pre-wrap">
              {order.addressLine1}
              {order.addressLine2 ? `\n${order.addressLine2}` : ""}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">송장번호</dt>
            <dd className="mt-1 wrap-anywhere">
              {order.trackingNumber ?? "배송 시작 후 확인할 수 있어요."}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-label="입금 안내"
        className="mt-4 min-w-0 rounded-card bg-brand-soft p-3 @3xl/app:p-4"
      >
        <h2 className="text-subtitle font-bold">입금 안내</h2>
        {order.status === "pending_payment" ? (
          <>
            <BankTransferAccount />
            <p className="mt-3 text-price font-extrabold text-pink">
              {formatWon(order.total)}
            </p>
            <p className="mt-2 text-body">
              주문자 이름으로 입금해 주세요. 입금 확인 후 배송을 준비해요.
            </p>
          </>
        ) : (
          <p className="mt-2 text-body">
            {order.status === "cancelled"
              ? "취소된 주문이에요."
              : "입금이 확인된 주문이에요."}
          </p>
        )}
      </section>
    </div>
  );
}
