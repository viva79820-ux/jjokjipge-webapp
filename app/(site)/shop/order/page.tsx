import type { Metadata } from "next";
import { OrderCheckout } from "@/components/orders/order-checkout";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `주문서 | ${siteConfig.name}`,
};

export const instant = false;

export default function Page() {
  return <OrderCheckout />;
}
