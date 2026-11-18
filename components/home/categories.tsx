import Link from "next/link";
import { Layers, Moon, PenLine, Sparkles, Store } from "lucide-react";

const categories = [
  { key: "all", label: "전체", href: "/consult", icon: Sparkles },
  { key: "tarot", label: "타로", href: "/consult?type=tarot", icon: Layers },
  { key: "saju", label: "사주", href: "/consult?type=saju", icon: Moon },
  {
    key: "naming",
    label: "작명",
    href: "/stores#store-prices",
    icon: PenLine,
  },
  { key: "store", label: "매장", href: "/stores", icon: Store },
] as const;

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeCategories() {
  return (
    <section aria-label="상담 카테고리" className="grid grid-cols-5 gap-2">
      {categories.map(({ key, label, href, icon: Icon }) => {
        const selected = key === "all";
        return (
          <Link
            key={key}
            href={href}
            data-home-category={key}
            className={`flex h-[76px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border px-0.5 text-center text-label font-bold ${focus} ${selected ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
          >
            <Icon
              size={26}
              aria-hidden="true"
              className={selected ? "text-on-brand" : "text-brand"}
            />
            <span className="max-w-full wrap-anywhere">{label}</span>
          </Link>
        );
      })}
    </section>
  );
}
