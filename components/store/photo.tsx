"use client";

import { useState } from "react";
import Image from "next/image";
import { Store } from "lucide-react";

export function StorePhoto({
  src,
  alt,
  sizes,
  className = "",
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frame = `relative aspect-video overflow-hidden rounded-card bg-surface-muted ${className}`;
  if (!src || failedSrc === src)
    return (
      <div
        role="img"
        aria-label="매장 사진 자리"
        className={`flex items-center justify-center text-muted ${frame}`}
      >
        <Store
          aria-hidden="true"
          className="h-1/3 max-h-14 w-1/3 max-w-14"
          strokeWidth={1}
        />
      </div>
    );
  return (
    <div className={frame} data-store-photo-frame>
      <Image
        unoptimized
        fill
        src={src}
        alt={alt}
        sizes={sizes}
        className="object-cover"
        data-store-photo
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
