"use client";

import { ShoppingCart } from "lucide-react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  cartServerSnapshot,
  cartSnapshot,
  cartUnits,
  subscribeCart,
} from "@/lib/products/cart";

export function ShopCartLink() {
  const stored = useSyncExternalStore(
    subscribeCart,
    cartSnapshot,
    cartServerSnapshot,
  );
  const count = stored.state === "ready" ? cartUnits(stored.lines) : 0;
  return (
    <Link
      href="/shop/cart"
      aria-label={count > 0 ? `장바구니, ${count}개` : "장바구니"}
      className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <ShoppingCart aria-hidden="true" size={24} />
      {count > 0 ? (
        <span className="absolute top-0 right-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pink px-1 text-fine font-bold text-on-brand">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
