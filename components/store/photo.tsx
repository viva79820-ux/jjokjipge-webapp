"use client";

import { useState } from "react";
import Image from "next/image";
import { Store } from "lucide-react";

export function StorePhoto({
  src,
  alt,
  sizes,
  className = "",
  cover = false,
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  cover?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frame = cover
    ? `relative h-50 overflow-hidden bg-brand-soft ${className}`
    : `relative aspect-video overflow-hidden rounded-card bg-surface-muted ${className}`;
  if (!src || failedSrc === src)
    return (
      <div
        role="img"
        aria-label="매장 사진 자리"
        className={`flex flex-col items-center justify-center gap-1 text-muted ${frame}`}
      >
        <Store
          aria-hidden="true"
          className="h-1/3 max-h-14 w-1/3 max-w-14"
          strokeWidth={1}
        />
        <span className="text-fine">사진 준비 중</span>
      </div>
    );
  return (
    <div className={frame} data-store-photo-frame>
      <Image
        fill
        src={src}
        alt={alt}
        sizes={sizes}
        quality={90}
        className={cover ? "object-cover object-[center_35%]" : "object-cover"}
        data-store-photo
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
