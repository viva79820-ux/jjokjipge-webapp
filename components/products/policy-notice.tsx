import { Truck } from "lucide-react";
import { shopPolicyNotice } from "@/lib/shop-policy-config";

export function ShopPolicyNotice({ icon = false }: { icon?: boolean }) {
  return (
    <section
      aria-label="배송·교환·환불"
      className={
        icon
          ? "flex gap-2.5 rounded-card border border-border bg-surface p-3.5 text-caption text-muted"
          : "rounded-card border border-border bg-surface px-4 py-3 text-label font-semibold text-foreground"
      }
    >
      {icon ? (
        <Truck className="shrink-0 text-brand" size={18} aria-hidden="true" />
      ) : null}
      <p>{shopPolicyNotice}</p>
    </section>
  );
}
