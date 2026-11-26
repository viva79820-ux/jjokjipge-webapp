"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { channelLabels, type Channel } from "@/lib/contents/rules";

const channelMarks: Record<
  Channel,
  { src: string; width: number; height: number }
> = {
  blog: {
    src: "/images/channels/channel-naver-blog.png",
    width: 244,
    height: 244,
  },
  instagram: {
    src: "/images/channels/channel-instagram.png",
    width: 256,
    height: 256,
  },
  youtube: {
    src: "/images/channels/channel-youtube.png",
    width: 256,
    height: 179,
  },
};

export function ContentThumbnail({
  src,
  alt,
  channel,
}: {
  src: string | null;
  alt: string | null;
  channel: Channel;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const externalImage = useRef<HTMLImageElement>(null);
  const mark = channelMarks[channel];
  const external = Boolean(
    src &&
    src.startsWith("https://") &&
    !src.includes("/storage/v1/object/public/"),
  );
  useEffect(() => {
    const image = externalImage.current;
    if (!external || !image?.complete || image.naturalWidth > 0) return;
    setFailedSrc(src);
  }, [external, src]);
  const label = src
    ? `${channelLabels[channel]} 썸네일을 불러오지 못했습니다`
    : `${channelLabels[channel]} 썸네일 없음`;
  if (!src || failedSrc === src)
    return (
      <span
        role="img"
        aria-label={label}
        className="flex h-21 w-28 shrink-0 items-center justify-center rounded-input bg-brand-soft"
      >
        <Image
          unoptimized
          src={mark.src}
          alt=""
          width={mark.width}
          height={mark.height}
          className="h-10 w-12 object-contain"
        />
      </span>
    );
  return (
    <span className="relative h-21 w-28 shrink-0 overflow-hidden rounded-input bg-brand-soft">
      {external ? (
        // 피드 썸네일 호스트는 고정되어 있지 않다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={externalImage}
          src={src}
          alt={alt || ""}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Image
          fill
          src={src}
          alt={alt || ""}
          sizes="112px"
          className="object-cover"
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}
