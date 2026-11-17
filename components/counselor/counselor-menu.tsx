"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { appFixedBarClass } from "@/lib/app-frame";
import { syncBookingSpace } from "@/components/counselor/counselor-detail-frame";

type Product = { id: string; name: string; minutes: number; price: number };

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function won(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}

export function CounselorMenu({
  counselorId,
  products,
}: {
  counselorId: string;
  products: Product[];
}) {
  if (!products.length)
    return (
      <section className="min-w-0 px-4 pt-7 @3xl/app:px-6">
        <h2 className="mb-3 text-title font-bold">상담 메뉴</h2>
        <p className="text-body text-muted">등록된 상담 상품이 없어요.</p>
      </section>
    );
  return <ProductPicker counselorId={counselorId} products={products} />;
}

function ProductPicker({
  counselorId,
  products,
}: {
  counselorId: string;
  products: Product[];
}) {
  const [selectedId, setSelectedId] = useState(products[0].id);
  const barRef = useRef<HTMLDivElement>(null);
  const selected =
    products.find((product) => product.id === selectedId) ?? products[0];
  const href = `/consult/${counselorId}/book?product=${selected.id}`;
  useLayoutEffect(() => {
    const frame = barRef.current?.closest<HTMLElement>(
      "[data-counselor-detail]",
    );
    if (frame) syncBookingSpace(frame);
  }, [selected.id, selected.name]);
  return (
    <>
      <section className="min-w-0 px-4 pt-7 @3xl/app:px-6">
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="mb-3 block w-full p-0 text-title font-bold">
            상담 메뉴
          </legend>
          <div className="flex flex-col gap-2">
            {products.map((product) => {
              const active = product.id === selected.id;
              return (
                <label
                  key={product.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-card bg-surface p-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${active ? "border-2 border-brand" : "border border-border"}`}
                >
                  <input
                    type="radio"
                    name={`consult-product-${counselorId}`}
                    value={product.id}
                    checked={active}
                    onChange={() => setSelectedId(product.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-brand" : "border-muted"}`}
                  >
                    {active ? (
                      <span className="size-2.5 rounded-full bg-brand" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold wrap-anywhere">
                      {product.name}
                    </span>
                    <span className="mt-0.5 block text-caption text-muted">
                      {product.minutes}분
                    </span>
                  </span>
                  <span className="shrink-0 text-price font-extrabold text-pink">
                    {won(product.price)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>
      <div
        ref={barRef}
        data-booking-bar
        data-product-id={selected.id}
        className={`${appFixedBarClass} flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-fine wrap-anywhere text-muted">{selected.name}</p>
          <p className="text-price font-extrabold wrap-anywhere text-pink">
            {won(selected.price)}
          </p>
        </div>
        <Link
          href={href}
          className={`inline-flex h-13 max-w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-base font-bold whitespace-nowrap text-on-brand ${focus}`}
        >
          <Phone size={18} aria-hidden="true" />
          전화상담 예약하기
        </Link>
      </div>
    </>
  );
}
