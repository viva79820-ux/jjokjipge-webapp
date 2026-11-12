"use client";

import { useState } from "react";
import Image from "next/image";
import { PhotoPlaceholder } from "./photo-placeholder";

export function CounselorPhoto({
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
  if (!src || failedSrc === src)
    return <PhotoPlaceholder className={className} />;
  return (
    <div
      className={`relative overflow-hidden bg-surface-muted ${className}`}
      data-counselor-photo-frame
    >
      <Image
        unoptimized
        fill
        src={src}
        alt={alt}
        sizes={sizes}
        className="object-contain"
        data-counselor-photo
        onError={() => setFailedSrc(src)}
      />
    </div>
  );
}
