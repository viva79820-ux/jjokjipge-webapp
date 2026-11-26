"use client";

import { useState } from "react";
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
  const mark = channelMarks[channel];
  const missing = !src || failedSrc === src;
  const label = src
    ? `${channelLabels[channel]} 썸네일을 불러오지 못했습니다`
    : `${channelLabels[channel]} 썸네일 없음`;
  if (missing)
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
      <Image
        fill
        src={src}
        alt={alt || ""}
        sizes="112px"
        className="object-cover"
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}
