"use client";
import { useState } from "react";
import Image from "next/image";
export function NoticeImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="space-y-2">
      {failed ? (
        <p role="status">이미지를 불러오지 못했습니다.</p>
      ) : (
        /* 유료 변환 없이 원본 비율 유지 */ <Image
          unoptimized
          width={1200}
          height={1200}
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="h-auto max-w-full rounded-card"
        />
      )}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-brand underline"
      >
        원본 이미지 새 탭에서 보기
      </a>
    </figure>
  );
}
