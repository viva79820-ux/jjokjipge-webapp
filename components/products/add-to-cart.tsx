"use client";

import { useState } from "react";
import { ShopCartLink } from "@/components/products/cart-link";
import { Button } from "@/components/ui/button";
import {
  browserCartStorage,
  cartAddedMessage,
  cartMessages,
  maxCartQuantity,
  storeAddedProduct,
} from "@/lib/products/cart";

const stepClass =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-subtitle font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60";

export function ProductCartActions({
  productId,
  soldOut,
}: {
  productId: string;
  soldOut: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [alert, setAlert] = useState(false);
  function add() {
    const result = storeAddedProduct(
      browserCartStorage(),
      productId,
      quantity,
      { soldOut },
    );
    if (result.state === "storage-error") {
      setAlert(true);
      setMessage(cartMessages.storage);
      return;
    }
    if (result.state === "rejected") {
      setAlert(true);
      setMessage(
        result.reason === "full"
          ? cartMessages.full
          : result.reason === "sold-out"
            ? cartMessages.soldOutAdd
            : cartMessages.quantity,
      );
      return;
    }
    setAlert(false);
    setMessage(cartAddedMessage(result.quantity));
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p id={`shop-qty-${productId}`} className="text-label font-semibold">
          수량
        </p>
        <div
          role="group"
          aria-labelledby={`shop-qty-${productId}`}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            className={stepClass}
            aria-label="수량 줄이기"
            disabled={soldOut || quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            −
          </button>
          <span
            aria-live="polite"
            className="min-w-6 text-center text-subtitle font-bold"
          >
            {quantity}
          </span>
          <button
            type="button"
            className={stepClass}
            aria-label="수량 늘리기"
            disabled={soldOut || quantity >= maxCartQuantity}
            onClick={() =>
              setQuantity((value) => Math.min(maxCartQuantity, value + 1))
            }
          >
            +
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={add} disabled={soldOut}>
          장바구니 담기
        </Button>
        <ShopCartLink />
      </div>
      {soldOut ? (
        <p className="text-body text-muted">{cartMessages.soldOutAdd}</p>
      ) : null}
      {message ? <p role={alert ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
