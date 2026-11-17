import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { InteriorGallery } from "@/components/store/interior-gallery";
import { StorePriceTable } from "@/components/store/price-table";
import { StoreCard } from "@/components/store/store-card";
import { getCounselors, type Counselor } from "@/lib/data/counselors";
import { getStores, type Store } from "@/lib/data/stores";
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
    <div
      data-store-page
      className="flex min-w-0 flex-col gap-4 px-4 pt-6 @3xl/app:px-6"
    >
      <header>
        <h1 className="text-display font-extrabold">매장상담</h1>
        <p className="mt-1 text-body text-muted">
          전국에 소문난 사주·타로 잘 보는 집, 동성로에서 직접 만나요.
        </p>
      </header>
      {storeError && (
        <div
          role="alert"
          className="space-y-3 rounded-card border border-border bg-surface p-4"
        >
          <p>매장 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
          <Button href="/stores" className="cursor-pointer">
            다시 불러오기
          </Button>
        </div>
      )}
      {!storeError && stores && stores.length === 0 && (
        <p
          role="status"
          className="rounded-card border border-border bg-surface p-4"
        >
          공개된 매장이 없습니다.
        </p>
      )}
      {counselorError && <p role="alert">상담사 연결을 불러오지 못했습니다.</p>}
      {stores && stores.length > 0 && (
        <ul
          data-store-list
          className="grid min-w-0 grid-cols-1 gap-4 @3xl/app:grid-cols-2"
        >
          {stores.map((store) => {
            const staff = counselorError
              ? []
              : (counselors || []).filter(
                  (counselor) => counselor.storeSlug === store.id,
                );
            return (
              <li key={store.id} className="min-w-0">
                <StoreCard
                  store={store}
                  staff={staff.map((counselor) => ({
                    id: counselor.id,
                    name: counselor.name,
                  }))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <section className="flex min-w-0 flex-col gap-2.5">
        <h2 className="text-title font-bold">매장 안</h2>
        <InteriorGallery />
      </section>
      <StorePriceTable />
      <Link
        href="/consult"
        data-consult-cta
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card bg-brand p-4 text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-halo text-foreground"
        >
          <Phone size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-subtitle font-extrabold">멀리 계신가요?</span>
          <span className="text-caption text-brand-soft">
            전화상담으로 매장 선생님께 상담받아요
          </span>
        </span>
        <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
      </Link>
    </div>
  );
}
