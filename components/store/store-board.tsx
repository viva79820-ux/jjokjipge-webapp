"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Store } from "@/lib/data/stores";
import { InteriorGallery } from "./interior-gallery";
import { StorePriceTable } from "./price-table";
import {
  resolveStoreLocation,
  storeQueryKey,
  storeSelectionHref,
  storeSlugFromHash,
} from "./present";
import { StoreCard } from "./store-card";

export type StoreEntry = {
  store: Store;
  staff: { id: string; name: string }[];
};

const guide = "매장을 선택하면 사진과 참고 가격을 볼 수 있어요";

export function StorePriceHash() {
  useEffect(() => {
    if (window.location.hash !== "#store-prices") return;
    let frames = 0;
    const reveal = () => {
      if (window.location.hash !== "#store-prices") return;
      const target = document.getElementById("store-prices");
      const header = document.querySelector("[data-site-header]");
      if (!target) return;
      const limit = header?.getBoundingClientRect().bottom ?? 0;
      const top = target.getBoundingClientRect().top;
      if (top > limit + 12 || top < limit - 4)
        target.scrollIntoView({ block: "start" });
    };
    reveal();
    const timer = window.setInterval(() => {
      frames += 1;
      reveal();
      if (frames >= 10) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}

export function StoreBoard({ entries }: { entries: StoreEntry[] }) {
  const searchParams = useSearchParams();
  const [hash, setHash] = useState("");
  const values = searchParams.getAll(storeQueryKey);
  const stores = entries.map((entry) => entry.store);
  const selection = resolveStoreLocation(stores, values, hash);
  const selected =
    entries.find((entry) => entry.store.id === selection.store?.id) ?? null;

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  useEffect(() => {
    const slug = storeSlugFromHash(hash);
    if (!slug || selected?.store.id !== slug) return;
    document.getElementById(`store-${slug}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [hash, selected?.store.id]);

  function selectStore(id: string) {
    const href = storeSelectionHref(window.location.href, id);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (href === current) {
      document.getElementById(`store-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    // Next가 이 호출로 주소와 useSearchParams를 맞춘다.
    window.history.pushState(null, "", href);
    setHash(`#store-${id}`);
  }

  return (
    <>
      <p data-store-guide className="text-body text-muted">
        {guide}
      </p>
      <ul
        data-store-list
        className="grid min-w-0 grid-cols-1 gap-4 @3xl/app:grid-cols-2"
      >
        {entries.map((entry) => (
          <li key={entry.store.id} className="min-w-0">
            <StoreCard
              store={entry.store}
              staff={entry.staff}
              selected={selected?.store.id === entry.store.id}
              onSelect={selectStore}
            />
          </li>
        ))}
      </ul>
      <section id="store-detail" className="flex min-w-0 flex-col gap-4">
        {selected ? (
          <div
            id={`store-${selected.store.id}`}
            className="flex scroll-mt-site-header flex-col gap-4"
          >
            <SelectedStore entry={selected} />
          </div>
        ) : (
          <StoreChoicePrompt
            entries={entries}
            invalid={selection.invalid}
            onSelect={selectStore}
          />
        )}
      </section>
    </>
  );
}

function SelectedStore({ entry }: { entry: StoreEntry }) {
  return (
    <>
      <div data-selected-store={entry.store.id} className="flex flex-col gap-1">
        <h2 className="text-title font-bold">선택한 매장</h2>
        <p className="text-subtitle font-bold wrap-anywhere">
          {entry.store.name}
        </p>
        {entry.store.address ? (
          <p className="text-caption wrap-anywhere text-muted">
            {entry.store.address}
          </p>
        ) : null}
      </div>
      <section
        aria-labelledby="store-interior-title"
        className="flex min-w-0 flex-col gap-2.5"
      >
        <h2 id="store-interior-title" className="text-title font-bold">
          매장 내부 참고 사진
        </h2>
        <p className="text-caption text-muted">
          공통 소개 사진입니다. 선택한 매장의 내부로 확정된 사진이 아닙니다.
        </p>
        <InteriorGallery />
      </section>
      <StorePriceTable />
    </>
  );
}

function StoreChoicePrompt({
  entries,
  invalid,
  onSelect,
}: {
  entries: StoreEntry[];
  invalid: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      id="store-prices"
      className="flex scroll-mt-site-header flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="store-prices-title" className="text-title font-bold">
        사진과 참고 가격
      </h2>
      <p className="text-body text-muted">{guide}</p>
      {invalid ? (
        <p role="status" className="text-body">
          선택한 매장을 공개 목록에서 찾을 수 없습니다.
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.store.id}>
            <button
              type="button"
              data-store-select={entry.store.id}
              aria-expanded={false}
              aria-controls="store-detail"
              onClick={() => onSelect(entry.store.id)}
              className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-3 text-center text-label font-bold wrap-anywhere text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {entry.store.name} 사진과 참고 가격 보기
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
