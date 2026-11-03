import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Store } from "lucide-react";
import { getCounselor } from "@/lib/data/counselors";
import { getAvailabilityCalendar } from "@/lib/reservations/availability";
import { dateLabel } from "@/lib/booking-time";
import { BookingForm } from "@/components/booking/booking-form";
import { SectionTitle } from "@/components/ui/section-title";

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
  return { title: `${counselor.name} 선생님 예약 | 쪽집게천사` };
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
  const calendar = await getAvailabilityCalendar(counselor.id, product.id);
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
  const href = (productId: string, date: string) =>
    `/consult/${counselor.id}/book?product=${encodeURIComponent(productId)}&date=${date}`;
  return (
    <div className="space-y-7 px-4 pt-3 md:space-y-9 md:px-6">
      <header>
        <Link
          href={`/consult/${counselor.id}`}
          className="inline-flex min-h-11 items-center text-sm text-muted"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          상담사 정보
        </Link>
        <h1 className="mt-2 text-xl font-bold md:text-2xl">전화상담 예약</h1>
        <p className="mt-3 text-base font-bold md:text-lg">
          {counselor.name} 선생님
        </p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-gold bg-gold-soft px-3 py-1 text-xs text-gold-deep">
          <Store size={14} aria-hidden="true" />
          {counselor.storeName} 상담사
        </span>
      </header>
      <BookingForm
        key={`${product.id}-${selected.date}`}
        counselorSlug={counselor.id}
        product={product}
        date={selected.date}
        slots={selected.slots}
      >
        <section>
          <SectionTitle title="상품 선택" />
          <div className="grid gap-2 md:grid-cols-2">
            {counselor.products.map((item) => (
              <Link
                key={item.id}
                href={href(item.id, selected.date)}
                aria-current={item.id === product.id ? "true" : undefined}
                className={`block min-h-11 rounded-card border bg-surface p-3 md:p-4 ${item.id === product.id ? "border-brand" : "border-border"}`}
              >
                <p className="font-bold">{item.name}</p>
                <p className="mt-2">
                  {item.price.toLocaleString("ko-KR")}원{" "}
                  <span className="rounded-full border border-gold bg-gold-soft px-2 py-1 text-xs text-gold-deep">
                    예시 가격
                  </span>
                </p>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle title="날짜 선택" />
          <div className="flex gap-2 overflow-x-auto pb-2">
            {calendar.map((day) => {
              const available = day.slots.some((slot) => slot.available);
              const styles = `inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm ${day.date === selected.date ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`;
              return available ? (
                <Link
                  key={day.date}
                  href={href(product.id, day.date)}
                  aria-current={day.date === selected.date ? "date" : undefined}
                  className={styles}
                >
                  {dateLabel(day.date)}
                </Link>
              ) : (
                <span
                  key={day.date}
                  aria-disabled="true"
                  className={`${styles} opacity-40`}
                >
                  {dateLabel(day.date)}
                </span>
              );
            })}
          </div>
        </section>
      </BookingForm>
    </div>
  );
}
