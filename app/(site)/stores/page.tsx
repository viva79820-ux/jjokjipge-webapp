import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { StorePhoto } from "@/components/store/photo";
import { getCounselors, type Counselor } from "@/lib/data/counselors";
import { getStores, type Store } from "@/lib/data/stores";
import { storeTelHref } from "@/lib/stores/rules";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = { title: `매장상담 | ${siteConfig.name}` };

export default function StoresPage() {
  return (
    <Suspense fallback={null}>
      <StoresContent />
    </Suspense>
  );
}

async function StoresContent() {
  let stores: Store[] | null = null;
  let storeError = false;
  try {
    stores = await getStores();
  } catch {
    storeError = true;
  }
  let counselors: Counselor[] | null = null;
  let counselorError = false;
  if (!storeError) {
    try {
      counselors = await getCounselors();
    } catch {
      counselorError = true;
    }
  }
  return (
    <div className="space-y-7 px-4 pt-6 md:space-y-9 md:px-6">
      <header>
        <h1 className="text-xl font-bold md:text-2xl">매장상담</h1>
        <p className="mt-2 text-caption text-muted md:text-sm">
          동성로 매장에서 직접 상담받을 수 있어요.
        </p>
      </header>
      {storeError && (
        <div role="alert" className="space-y-3">
          <p>매장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          <Button href="/stores" className="cursor-pointer">
            다시 불러오기
          </Button>
        </div>
      )}
      {!storeError && stores && stores.length === 0 && (
        <p role="status">공개된 매장이 없습니다.</p>
      )}
      {counselorError && <p role="alert">상담사 연결을 불러오지 못했습니다.</p>}
      {stores && stores.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {stores.map((store) => {
            const staff = counselorError
              ? []
              : (counselors || []).filter(
                  (counselor) => counselor.storeSlug === store.id,
                );
            return (
              <li
                key={store.id}
                data-store-slug={store.id}
                className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
              >
                <StorePhoto
                  src={store.imageUrl}
                  alt={`${store.name} 사진`}
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="w-full"
                />
                <h2 className="mt-4 text-lg font-bold wrap-anywhere md:text-xl">
                  {store.name}
                </h2>
                {store.description && (
                  <p className="mt-1 text-caption wrap-anywhere whitespace-pre-line text-muted md:text-sm">
                    {store.description}
                  </p>
                )}
                <div className="mt-4 space-y-2 text-body">
                  {store.address && (
                    <p className="flex min-w-0 items-start gap-2">
                      <MapPin
                        size={18}
                        className="mt-0.5 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 wrap-anywhere">
                        {store.address}
                      </span>
                    </p>
                  )}
                  {store.hours && (
                    <p className="flex min-w-0 items-start gap-2">
                      <Clock
                        size={18}
                        className="mt-0.5 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 wrap-anywhere whitespace-pre-line">
                        {store.hours}
                      </span>
                    </p>
                  )}
                </div>
                {staff.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold">이 매장 상담사</h3>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {staff.map((counselor) => (
                        <Link
                          key={counselor.id}
                          href={`/consult/${counselor.id}`}
                          className="inline-flex min-h-11 max-w-full cursor-pointer items-center rounded-full bg-brand-soft px-3 text-xs font-medium wrap-anywhere text-brand"
                        >
                          {counselor.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <a
                  href={storeTelHref(store.phone)}
                  className="mt-4 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-button bg-brand px-3 text-sm font-semibold text-on-brand"
                >
                  <Phone size={18} aria-hidden="true" />
                  전화하기
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <aside className="rounded-card bg-brand-soft p-3 md:p-4">
        <p className="font-semibold">
          전화상담은 매장에 오지 않아도 예약할 수 있어요.
        </p>
        <Button
          href="/consult"
          variant="secondary"
          className="mt-3 cursor-pointer"
        >
          전화상담 예약하러 가기
        </Button>
      </aside>
    </div>
  );
}
