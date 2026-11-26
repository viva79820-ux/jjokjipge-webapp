import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeStoreBand() {
  return (
    <Link
      href="/stores"
      data-home-store-band
      className={`flex min-h-[100px] items-center gap-3 rounded-card bg-brand-soft p-3 text-brand-deep ${focus}`}
    >
      <Image
        src="/images/brand/store1.jpg"
        alt="쪽집게천사 동성로 1호점 외관"
        width={760}
        height={760}
        sizes="76px"
        className="size-[76px] shrink-0 rounded-input object-cover"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-body font-extrabold wrap-anywhere">
          동성로 1·2호점, 실제 매장 선생님
        </span>
        <span className="text-caption font-medium wrap-anywhere">
          매장에서 상담하는 선생님이 예약한 시간에 전화로 연락드려요.
        </span>
      </span>
      <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
    </Link>
  );
}
