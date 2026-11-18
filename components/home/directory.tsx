"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import type { Counselor } from "@/lib/data/counselors";
import { consultPriceLabel } from "@/lib/counselors/display";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { CounselorName } from "@/components/counselor/name";
import { CounselorPhoto } from "@/components/counselor/photo";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function HomeDirectory({ counselors }: { counselors: Counselor[] }) {
  const [selected, setSelected] = useState<"recommended" | "new">(
    "recommended",
  );
  const visible = counselors.filter((counselor) =>
    selected === "recommended" ? counselor.isRecommended : counselor.isNew,
  );
  return (
    <section aria-labelledby="home-directory-title" data-home-directory>
      <h2
        id="home-directory-title"
        className="mb-3 text-title font-bold wrap-anywhere"
      >
        선생님 목록
      </h2>
      <div
        role="tablist"
        aria-label="선생님 목록 분류"
        data-home-directory-tabs
        className="mb-3 grid grid-cols-2 gap-1.5 rounded-full border border-border bg-surface p-1"
      >
        {(
          [
            ["recommended", "추천"],
            ["new", "신규"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            data-home-tab={value}
            aria-selected={selected === value}
            onClick={() => setSelected(value)}
            className={`min-h-11 cursor-pointer rounded-full text-label ${selected === value ? "bg-brand font-bold text-on-brand" : "bg-transparent font-semibold text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-body text-muted">해당하는 선생님이 아직 없어요.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2.5">
          {visible.map((counselor) => (
            <DirectoryCard key={counselor.id} counselor={counselor} />
          ))}
        </ul>
      )}
      <Link
        href="/reviews"
        className={`mt-3 inline-flex min-h-11 items-center text-label font-bold text-brand ${focus}`}
      >
        상담 후기 보기
      </Link>
    </section>
  );
}

function DirectoryCard({ counselor }: { counselor: Counselor }) {
  const href = `/consult/${counselor.id}`;
  const heading = counselorHeading(counselor.name);
  const price = consultPriceLabel(counselor.products);
  const storeName = counselor.storeName.trim();
  return (
    <li
      data-home-list-item={counselor.id}
      className="flex min-w-0 flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3.5"
    >
      <Link
        href={href}
        aria-label={`${heading} 상세 보기`}
        className={`shrink-0 cursor-pointer rounded-xl ${focus}`}
      >
        <CounselorPhoto
          src={counselor.imageUrl}
          alt={`${heading} 사진`}
          sizes="72px"
          imageClassName="object-cover object-top"
          className="size-[72px] rounded-xl"
        />
      </Link>
      <div className="min-w-0 flex-1 basis-36">
        <Link
          href={href}
          className={`block max-w-full text-subtitle font-bold ${focus}`}
        >
          <CounselorName
            name={counselor.name}
            honorificClassName="text-caption font-medium text-muted"
          />
        </Link>
        {storeName ? (
          <p className="text-fine wrap-anywhere text-muted">{storeName}</p>
        ) : null}
        <div className="mt-1 flex min-w-0 max-w-full flex-wrap gap-1">
          {displayChips(counselor).map((tag, index) => (
            <Chip key={tag} primary={index === 0}>
              {tag}
            </Chip>
          ))}
        </div>
        {price ? (
          <p className="text-label font-extrabold wrap-anywhere text-pink">
            {price}
          </p>
        ) : (
          <p className="text-caption text-muted">등록된 상담 상품이 없어요.</p>
        )}
      </div>
      <Button href={href} className="shrink-0 gap-1.5 px-3.5 whitespace-nowrap">
        <Phone size={16} aria-hidden="true" />
        예약
      </Button>
    </li>
  );
}
