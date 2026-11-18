import Link from "next/link";
import { homeStoreMenuItems, homeStorePriceNotice } from "@/lib/home/menu";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeStoreMenu() {
  const items = homeStoreMenuItems();
  return (
    <section aria-labelledby="home-store-menu-title" data-home-menu>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="home-store-menu-title"
          className="min-w-0 text-title font-bold wrap-anywhere"
        >
          매장 상담 메뉴
        </h2>
        <Link
          href="/stores#store-prices"
          className={`flex min-h-11 shrink-0 items-center text-caption font-semibold text-muted ${focus}`}
        >
          매장 가격 기준
        </Link>
      </div>
      <p className="mb-3 text-caption wrap-anywhere text-muted">
        {homeStorePriceNotice}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((item) => (
          <article
            key={item.key}
            data-home-menu-key={item.key}
            className="flex min-h-[124px] min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-3.5"
          >
            <h3 className="text-subtitle font-bold wrap-anywhere">
              {item.name}
            </h3>
            <p className="mt-auto text-price font-extrabold wrap-anywhere text-pink">
              {item.price}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
