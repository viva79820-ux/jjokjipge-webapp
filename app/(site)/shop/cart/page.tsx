import type { Metadata } from "next";
import { CartView } from "@/components/products/cart-view";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `장바구니 | ${siteConfig.name}`,
};

export const instant = false;

export default function Page() {
  return <CartView />;
}
