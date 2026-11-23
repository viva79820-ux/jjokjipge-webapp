"use client";

import { useState } from "react";
import Image from "next/image";

export function ProductPhoto({
  src,
  alt,
  missing,
  sizes = "(max-width: 1024px) 100vw, 560px",
}: {
  src: string | null;
  alt: string;
  missing: boolean;
  sizes?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frame =
    "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-card bg-brand-soft";
  if (missing)
    return (
      <div
        role="img"
        aria-label="상품 사진 없음"
        className={`${frame} flex-col gap-2`}
      >
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="h-auto w-3/5 object-contain"
        />
        <span className="text-caption text-foreground">상품 사진 없음</span>
      </div>
    );
  if (!src)
    return (
      <div role="status" className={frame}>
        <p className="px-3 text-center text-caption text-foreground">
          선택한 사진을 준비하고 있습니다.
        </p>
      </div>
    );
  if (failedSrc === src)
    return (
      <div
        role="img"
        aria-label="상품 사진을 불러오지 못했습니다"
        className={frame}
      >
        <p className="px-3 text-center text-caption text-foreground">
          상품 사진을 불러오지 못했습니다.
        </p>
      </div>
    );
  return (
    <div className={frame} data-product-photo>
      <Image
        unoptimized
        fill
        src={src}
        alt={alt}
        sizes={sizes}
        className="object-cover"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
