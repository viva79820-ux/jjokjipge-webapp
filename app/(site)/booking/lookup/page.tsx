import { ReservationLookup } from "@/components/booking-lookup/reservation-lookup";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `예약 조회 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <div className="min-w-0 px-4 pt-6 md:px-6 md:pt-8">
      <ReservationLookup />
    </div>
  );
}
