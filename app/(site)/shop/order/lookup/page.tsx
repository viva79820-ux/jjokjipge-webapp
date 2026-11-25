import type { Metadata } from "next";
import { OrderLookup } from "@/components/order-lookup/order-lookup";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `주문 조회 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="min-w-0 px-4 pt-6 @3xl/app:px-6 @3xl/app:pt-8">
      <OrderLookup />
    </div>
  );
}
