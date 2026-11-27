"use client";

import { useState } from "react";
import Image from "next/image";

export function LectureThumbnail({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const missing = !src || failedSrc === src;
  if (missing) {
    return (
      <div
        role="img"
        aria-label={src ? "썸네일을 불러오지 못했어요" : "등록된 썸네일 없음"}
        className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-input bg-brand-soft"
      >
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="h-auto w-3/5 object-contain"
        />
      </div>
    );
  }
  return (
    // The uploaded file keeps its own ratio.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="h-24 w-24 shrink-0 rounded-input bg-brand-soft object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
