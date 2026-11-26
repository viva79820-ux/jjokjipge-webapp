import { OrderStatusBadge } from "@/components/order-lookup/status-badge";
import { Button } from "@/components/ui/button";
import type { MemberOrderSummary } from "@/lib/member-auth/orders";
import { formatWon } from "@/lib/products/rules";

export function OrderHistory({ orders }: { orders: MemberOrderSummary[] }) {
  return (
    <section aria-labelledby="member-orders-title" className="mt-7">
      <h2 id="member-orders-title" className="text-title font-bold">
        주문·배송 내역
      </h2>
      {orders.length === 0 ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          회원 계정으로 주문한 내역이 없어요.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {orders.map((order) => (
            <li
              key={order.id}
              className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
            >
              <article>
                <OrderStatusBadge status={order.status} />
                <dl className="mt-4 space-y-3 text-body">
                  <div className="min-w-0">
                    <dt className="text-caption text-muted">주문번호</dt>
                    <dd className="mt-1 font-semibold break-all">
                      {order.orderNo}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-caption text-muted">주문일</dt>
                    <dd className="mt-1">
                      <time dateTime={order.orderedAt}>
                        {order.orderedAtLabel}
                      </time>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-caption text-muted">상품</dt>
                    <dd>
                      <ul className="mt-1 space-y-1">
                        {order.items.map((item, index) => (
                          <li
                            key={`${order.id}-${index}`}
                            className="wrap-anywhere"
                          >
                            {item.name} × {item.quantity}개
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-caption text-muted">금액</dt>
                    <dd className="mt-1 text-price font-extrabold text-pink">
                      {formatWon(order.total)}
                    </dd>
                  </div>
                </dl>
                <Button
                  href={`/mypage/orders/${order.orderNo}`}
                  variant="secondary"
                  className="mt-4 w-full"
                >
                  주문 상세
                </Button>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
