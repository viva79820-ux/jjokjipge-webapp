"use client";

import { useState } from "react";
import Image from "next/image";
import { BookOpen, Camera, CirclePlay, type LucideIcon } from "lucide-react";
import { channelLabels, type Channel } from "@/lib/contents/rules";

const icons: Record<Channel, LucideIcon> = {
  blog: BookOpen,
  instagram: Camera,
  youtube: CirclePlay,
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
  const Icon = icons[channel];
  const missing = !src || failedSrc === src;
  const label = src
    ? `${channelLabels[channel]} 썸네일을 불러오지 못했습니다`
    : `${channelLabels[channel]} 썸네일 없음`;
  if (missing)
    return (
      <span
        role="img"
        aria-label={label}
        className="flex h-21 w-28 shrink-0 items-center justify-center rounded-input bg-brand-soft text-brand-deep"
      >
        <Icon size={30} aria-hidden="true" />
      </span>
    );
  return (
    <span className="relative h-21 w-28 shrink-0 overflow-hidden rounded-input bg-brand-soft">
      <Image
        unoptimized
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
