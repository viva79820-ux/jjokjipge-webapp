"use client";

import { useState } from "react";
import Image from "next/image";

export function ClassPoster({
  src,
  alt,
  fit,
}: {
  src: string | null;
  alt: string;
  fit: "cover" | "contain";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const missing = !src || failedSrc === src;
  if (missing) {
    return (
      <div
        role="img"
        aria-label={
          src ? `${alt} 이미지를 불러오지 못했습니다` : "등록된 포스터 없음"
        }
        className={`flex items-center justify-center bg-brand-soft ${fit === "cover" ? "h-[210px]" : "min-h-[210px]"}`}
      >
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="h-auto w-3/5 max-w-40 object-contain"
        />
      </div>
    );
  }
  if (fit === "contain") {
    return (
      // The file's own ratio is unknown until the browser reads it.
      // A sized next/image box would crop or letterbox to a guessed ratio.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="block h-auto w-full bg-surface object-contain"
        onError={() => setFailedSrc(src)}
      />
    );
  }
  return (
    <div className="relative h-[210px] overflow-hidden bg-brand-soft">
      <Image
        unoptimized
        fill
        src={src}
        alt={alt}
        sizes="(max-width: 1024px) 100vw, 560px"
        className="object-cover object-top"
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
