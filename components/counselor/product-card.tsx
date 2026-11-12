import type { Counselor } from "@/lib/data/counselors";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
export function ProductCard({
  product,
  bookingHref,
}: {
  product: Counselor["products"][number];
  bookingHref: string;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={bookingHref}
        className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 md:p-4"
      >
        <div className="min-w-0">
          <h3 className="wrap-anywhere font-bold">{product.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">
            {product.price.toLocaleString("ko-KR")}원
          </span>
          <Badge>예시 가격</Badge>
        </div>
      </Link>
    </li>
  );
}
