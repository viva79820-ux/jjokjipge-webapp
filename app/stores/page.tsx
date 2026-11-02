import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Phone, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { counselors } from "@/lib/dummy/counselors";
import { stores } from "@/lib/dummy/stores";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: "매장상담 | 쪽집게천사" };

export default function StoresPage() {
  return (
    <div className="space-y-7 px-4 pt-6 md:space-y-9 md:px-6">
      <header>
        <h1 className="text-xl font-bold md:text-2xl">매장상담</h1>
        <p className="mt-2 text-caption text-muted md:text-sm">
          동성로 매장에서 직접 상담받을 수 있어요.
        </p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {stores.map((store) => {
          const staff = counselors.filter(
            (counselor) => counselor.storeName === store.name,
          );
          return (
            <li
              key={store.id}
              className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
            >
              <div
                role="img"
                aria-label="매장 사진 자리"
                className="flex aspect-video w-full items-center justify-center rounded-card bg-surface-muted text-muted"
              >
                <Store size={56} strokeWidth={1} aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-lg font-bold md:text-xl">
                {store.name}
              </h2>
              <p className="mt-1 text-caption text-muted md:text-sm">
                {store.description}
              </p>
              <div className="mt-4 space-y-2 text-body">
                <p className="flex items-start gap-2">
                  <MapPin
                    size={18}
                    className="mt-0.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{store.address}</span>
                </p>
                <p className="flex items-start gap-2">
                  <Clock
                    size={18}
                    className="mt-0.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{store.hours}</span>
                </p>
              </div>
              {staff.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">이 매장 상담사</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {staff.map((counselor) => (
                      <Link
                        key={counselor.id}
                        href={`/consult/${counselor.id}`}
                        className="inline-flex min-h-11 items-center rounded-full bg-brand-soft px-3 text-xs font-medium text-brand"
                      >
                        {counselor.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <a
                href={`tel:${siteConfig.phone}`}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-button bg-brand px-3 text-sm font-semibold text-on-brand"
              >
                <Phone size={18} aria-hidden="true" />
                전화하기
              </a>
            </li>
          );
        })}
      </ul>
      <aside className="rounded-card bg-brand-soft p-3 md:p-4">
        <p className="font-semibold">
          전화상담은 매장에 오지 않아도 예약할 수 있어요.
        </p>
        <Button href="/consult" variant="secondary" className="mt-3">
          전화상담 예약하러 가기
        </Button>
      </aside>
    </div>
  );
}
