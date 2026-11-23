"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  browserCartStorage,
  cartAddedMessage,
  cartMessages,
  storeAddedProduct,
} from "@/lib/products/cart";

export function ProductCartActions({ productId }: { productId: string }) {
  const [message, setMessage] = useState("");
  const [alert, setAlert] = useState(false);
  function add() {
    const result = storeAddedProduct(browserCartStorage(), productId);
    if (result.state === "storage-error") {
      setAlert(true);
      setMessage(cartMessages.storage);
      return;
    }
    if (result.state === "rejected") {
      setAlert(true);
      setMessage(
        result.reason === "full" ? cartMessages.full : cartMessages.quantity,
      );
      return;
    }
    setAlert(false);
    setMessage(cartAddedMessage(result.quantity));
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={add}>
          장바구니 담기
        </Button>
        <Button href="/shop/cart" variant="secondary">
          장바구니
        </Button>
      </div>
      {message ? <p role={alert ? "alert" : "status"}>{message}</p> : null}
    </div>
  );
}
