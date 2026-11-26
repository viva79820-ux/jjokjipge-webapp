import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductPhoto } from "@/components/products/photo";
import {
  charmKindLabel,
  productListUrl,
  publicImageUrl,
  type PublicProductSummary,
} from "@/lib/products/rules";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function CharmBand({
  rows,
  count,
}: {
  rows: PublicProductSummary[];
  count: number;
}) {
  if (!count || !rows.length) return null;
  const cover = rows.find((row) => row.image_path) ?? rows[0];
  const kinds = rows.map((row) => charmKindLabel(row.name)).join(" / ");
  return (
    <Link
      href={productListUrl(false, 1, "", "", "charm")}
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-card bg-brand p-3 text-on-brand ${focus}`}
    >
      <div className="size-18 shrink-0 overflow-hidden rounded-input">
        <ProductPhoto
          src={publicImageUrl(cover.image_path)}
          alt=""
          missing={!cover.image_path}
          sizes="72px"
          variant="fill"
        />
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-subtitle font-extrabold">천사부적 {count}종</span>
        <span className="text-caption wrap-anywhere text-on-brand-muted">
          {kinds}
        </span>
      </span>
      <ChevronRight aria-hidden="true" size={20} className="shrink-0" />
    </Link>
  );
}
