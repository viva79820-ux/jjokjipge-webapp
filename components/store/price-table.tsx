import { storePriceConfig } from "@/lib/store-price-config";
import { formatStorePriceAmounts } from "./present";

const groups = [
  { id: "saju", title: "사주·작명" },
  { id: "tarot", title: "타로" },
] as const;

export function StorePriceTable() {
  return (
    <section
      id="store-prices"
      aria-labelledby="store-prices-title"
      className="scroll-mt-6 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="store-prices-title" className="text-title font-bold">
          가격표
        </h2>
        <p className="shrink-0 text-fine text-muted">1호점 가격판 기준</p>
      </div>
      <p className="mt-1 text-caption font-medium text-muted">매장 가격 기준</p>
      <p className="mt-2 text-caption text-muted">{storePriceConfig.notice}</p>
      <p className="mt-1 text-caption text-muted">{storePriceConfig.source}</p>
      {groups.map((group) => {
        const items = storePriceConfig.items.filter(
          (item) => item.group === group.id,
        );
        if (!items.length) return null;
        return (
          <div key={group.id} className="mt-4">
            <h3 className="text-label font-extrabold text-brand">
              {group.title}
            </h3>
            <div>
              {items.map((item) => (
                <div
                  key={item.key}
                  data-price-key={item.key}
                  className="flex items-start justify-between gap-3 border-b border-border py-3 text-body"
                >
                  <span className="min-w-0 font-semibold wrap-anywhere">
                    {item.name}
                  </span>
                  <span className="min-w-0 flex-1 text-right font-extrabold wrap-anywhere text-pink">
                    {formatStorePriceAmounts(item.amounts)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
