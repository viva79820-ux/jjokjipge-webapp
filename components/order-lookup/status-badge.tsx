import type { OrderStatus } from "@/lib/orders/types";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "입금 대기",
  payment_confirmed: "입금 확인",
  shipping: "배송 중",
  completed: "완료",
  cancelled: "취소",
};

const tones: Record<OrderStatus, string> = {
  pending_payment: "bg-halo text-foreground",
  payment_confirmed: "bg-brand text-on-brand",
  shipping: "bg-brand-soft text-brand-deep",
  completed: "bg-brand-soft text-brand-deep",
  cancelled: "bg-border text-foreground",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      data-order-status={status}
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-fine font-bold ${tones[status]}`}
    >
      {orderStatusLabels[status]}
    </span>
  );
}
