import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";
import type { Store } from "@/lib/data/stores";
import { storeTelHref } from "@/lib/stores/rules";
import { Chip } from "@/components/ui/chip";
import { StorePhoto } from "./photo";
import { localStoreExterior, naverMapSearchUrl } from "./present";

const control =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-label font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function StoreCard({
  store,
  staff,
}: {
  store: Store;
  staff: { id: string; name: string }[];
}) {
  const exterior = store.imageUrl ? null : localStoreExterior(store.name);
  const src = store.imageUrl ?? exterior?.src ?? null;
  const mapUrl = naverMapSearchUrl(store.address);
  const photoSource = store.imageUrl ? "db" : exterior ? "local" : "empty";
  return (
    <article
      data-store-slug={store.id}
      data-photo-source={photoSource}
      className="min-w-0 overflow-hidden rounded-card border border-border bg-surface"
    >
      <StorePhoto
        src={src}
        alt={exterior?.alt ?? `${store.name} 사진`}
        sizes="(max-width: 767px) 100vw, 480px"
        className="w-full"
        cover
      />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="max-w-full text-title font-extrabold wrap-anywhere">
            {store.name}
          </h2>
          <Chip>사주·타로·작명</Chip>
        </div>
        {store.description && (
          <p className="text-caption wrap-anywhere whitespace-pre-line text-muted">
            {store.description}
          </p>
        )}
        {store.address && (
          <p className="flex min-w-0 items-start gap-2 text-label">
            <MapPin
              size={18}
              className="mt-0.5 shrink-0 text-brand"
              aria-hidden="true"
            />
            <span className="min-w-0 wrap-anywhere">{store.address}</span>
          </p>
        )}
        {store.hours && (
          <p className="flex min-w-0 items-start gap-2 text-label">
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
        {staff.length > 0 && (
          <div>
            <h3 className="text-label font-semibold">이 매장 상담사</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {staff.map((counselor) => (
                <Link
                  key={counselor.id}
                  href={`/consult/${counselor.id}`}
                  className="inline-flex min-h-11 max-w-full cursor-pointer items-center rounded-full bg-brand-soft px-3 text-fine font-semibold wrap-anywhere text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {counselor.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className={`grid gap-2 ${mapUrl ? "grid-cols-2" : "grid-cols-1"}`}>
          <a
            href={storeTelHref(store.phone)}
            aria-label={`${store.name} 전화하기`}
            className={`${control} bg-brand text-on-brand`}
          >
            <Phone size={16} aria-hidden="true" />
            전화하기
          </a>
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${store.name} 길찾기`}
              className={`${control} border border-brand bg-surface text-brand`}
            >
              <MapPin size={16} aria-hidden="true" />
              길찾기
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
