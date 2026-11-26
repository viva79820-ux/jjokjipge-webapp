"use client";

import { useState } from "react";
import { BankTransferAccount } from "@/components/payments/bank-transfer-account";
import { Button } from "@/components/ui/button";
import { formatWon } from "@/lib/products/rules";
import type { OrderSuccess } from "@/lib/orders/types";

const statusLabels = {
  pending_payment: "입금 대기",
  payment_confirmed: "입금 확인",
  shipping: "배송 중",
  completed: "완료",
  cancelled: "취소",
} as const;

export function OrderComplete({ order }: { order: OrderSuccess }) {
  const [copyMessage, setCopyMessage] = useState("");

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(order.orderNo);
      setCopyMessage("주문번호를 복사했어요.");
    } catch {
      setCopyMessage("복사하지 못했어요. 주문번호를 직접 기록해 주세요.");
    }
  }

  return (
    <section aria-label="주문 완료" className="space-y-7 wrap-anywhere">
      <header className="space-y-2">
        <h1 className="text-display font-extrabold">주문이 접수되었어요</h1>
        <p className="text-body text-muted">
          {order.status === "pending_payment"
            ? "입금 확인 전까지 주문 상태는 입금 대기예요."
            : `현재 주문 상태는 ${statusLabels[order.status]}예요.`}
        </p>
      </header>

      <div className="rounded-card border border-border bg-surface p-3 @3xl/app:p-4">
        <p className="text-caption text-muted">주문번호</p>
        <p className="mt-1 break-all text-title font-bold text-brand">
          {order.orderNo}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={copyNumber}
        >
          주문번호 복사
        </Button>
        <p role="status" className="mt-1 text-caption text-muted">
          {copyMessage}
        </p>
        <dl className="mt-4 space-y-2 text-body">
          <div>
            <dt className="text-caption text-muted">주문 상태</dt>
            <dd>{statusLabels[order.status]}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">상품 금액</dt>
            <dd>{formatWon(order.subtotal)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">배송비</dt>
            <dd>{formatWon(order.shippingFee)}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">입금할 금액</dt>
            <dd className="text-price font-extrabold text-pink">
              {formatWon(order.total)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-card bg-brand-soft p-3 @3xl/app:p-4">
        <h2 className="text-subtitle font-bold">입금 안내</h2>
        <BankTransferAccount />
        <p className="mt-3 text-price font-extrabold text-pink">
          {formatWon(order.total)}
        </p>
        <p className="mt-2 text-body">
          주문자 이름으로 입금해 주세요. 입금 확인 후 배송을 준비해요.
        </p>
      </div>

      <p className="text-caption text-muted">
        주문번호와 주문할 때 입력한 이메일로 배송 상태를 확인할 수 있어요.
        로그인한 계정으로 주문했다면 마이페이지의 주문·배송 내역에서도 볼 수
        있어요.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button href="/shop/order/lookup">주문 조회</Button>
        <Button href="/mypage" variant="secondary">
          마이페이지
        </Button>
        <Button href="/shop" variant="secondary">
          상품 목록으로
        </Button>
      </div>
    </section>
  );
}
