import { Suspense } from "react";
import { connection } from "next/server";
import { ReservationLookup } from "@/components/booking-lookup/reservation-lookup";
import { ReservationResult } from "@/components/booking-lookup/reservation-result";
import { readNotifyReservation } from "@/lib/notify-link/lookup";
import { reservationLinkExpiredMessage } from "@/lib/notify-link/messages";
import { notifyTokenQuery } from "@/lib/notify-link/query";
import type { LookupResult } from "@/lib/reservations/lookup/types";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

type Query = { t?: string | string[] };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Query>;
}): Promise<Metadata> {
  const token = (await searchParams).t;
  return {
    title: `예약 조회 | ${siteConfig.name}`,
    robots: { index: false, follow: false },
    ...(token !== undefined ? { referrer: "no-referrer" as const } : {}),
  };
}

function ReservationDirect({ result }: { result: LookupResult }) {
  return (
    <section className="min-w-0">
      <header>
        <h1 className="text-display font-extrabold">예약 조회</h1>
      </header>
      <ReservationResult result={result} />
    </section>
  );
}

async function ReservationLookupContent({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await connection();
  const query = notifyTokenQuery((await searchParams).t);
  if (!query.present) return <ReservationLookup />;
  const result = query.token ? await readNotifyReservation(query.token) : null;
  if (result) return <ReservationDirect result={result} />;
  return <ReservationLookup linkNotice={reservationLinkExpiredMessage} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <div className="min-w-0 px-4 pt-6 @3xl/app:px-6 @3xl/app:pt-8">
      <Suspense
        fallback={
          <p role="status" className="text-body text-muted">
            예약 조회 화면을 준비하고 있어요.
          </p>
        }
      >
        <ReservationLookupContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
