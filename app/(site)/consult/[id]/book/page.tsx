import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Store } from "lucide-react";
import { getCounselor } from "@/lib/data/counselors";
import { counselorHeading } from "@/lib/counselors/rules";
import { getAvailabilityCalendar } from "@/lib/reservations/availability";
import { BookingForm } from "@/components/booking/booking-form";
import { Badge } from "@/components/ui/badge";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    product?: string | string[];
    date?: string | string[];
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  return {
    title: `${counselorHeading(counselor.name)} 예약 | ${siteConfig.name}`,
  };
}

export default function BookingPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <BookingContent {...props} />
    </Suspense>
  );
}

async function BookingContent({ params, searchParams }: Props) {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  const query = await searchParams;
  const product =
    counselor.products.find((item) => item.id === query.product) ||
    counselor.products[0];
  if (!product)
    return (
      <div className="px-4 pt-6 md:px-6">
        <h1 className="text-xl font-bold">전화상담 예약</h1>
        <p className="mt-3 text-muted">
          지금은 예약 가능한 상담 상품이 없어요.
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-brand"
          href={`/consult/${counselor.id}`}
        >
          상담사 정보
        </Link>
      </div>
    );
  const calendars = Object.fromEntries(
    await Promise.all(
      counselor.products.map(
        async (item) =>
          [
            item.id,
            await getAvailabilityCalendar(counselor.id, item.id),
          ] as const,
      ),
    ),
  );
  const calendar = calendars[product.id];
  const selected =
    calendar.find(
      (day) =>
        day.date === query.date && day.slots.some((slot) => slot.available),
    ) ||
    calendar.find((day) => day.slots.some((slot) => slot.available)) ||
    calendar[0];
  if (!selected)
    return (
      <p className="px-4 py-6 text-muted">
        지금은 예약 가능한 상담 상품이 없어요.
      </p>
    );
  return (
    <div className="min-w-0 space-y-7 px-4 pt-3 md:space-y-9 md:px-6">
      <header className="min-w-0">
        <Link
          href={`/consult/${counselor.id}`}
          className="inline-flex min-h-11 items-center text-sm text-muted"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          상담사 정보
        </Link>
        <h1 className="mt-2 text-xl font-bold md:text-2xl">전화상담 예약</h1>
        <p className="mt-3 wrap-anywhere text-base font-bold md:text-lg">
          {counselorHeading(counselor.name)}
        </p>
        {counselor.storeName.trim() && (
          <Badge icon={Store} className="mt-2 px-3">
            {counselor.storeName} 상담사
          </Badge>
        )}
      </header>
      <BookingForm
        counselorSlug={counselor.id}
        products={counselor.products}
        calendars={calendars}
        initialProductId={product.id}
        initialDate={selected.date}
      />
    </div>
  );
}
