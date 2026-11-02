import type { Counselor } from "@/lib/dummy/counselors";
export function ProductCard({
  product,
}: {
  product: Counselor["products"][number];
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 md:p-4">
      <div>
        <h3 className="font-bold">{product.name}</h3>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-bold">
          {product.price.toLocaleString("ko-KR")}원
        </span>
        <span className="rounded-full border border-gold bg-gold-soft px-2 py-1 text-xs font-medium text-gold-deep">
          예시 가격
        </span>
      </div>
    </li>
  );
}
