import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Phone, Store } from "lucide-react";
import { Suspense } from "react";
import { getCounselor } from "@/lib/data/counselors";
import { counselorHeading, displayChips } from "@/lib/counselors/rules";
import { CounselorName } from "@/components/counselor/name";
import { CounselorPhoto } from "@/components/counselor/photo";
import { CounselorDetailFrame } from "@/components/counselor/counselor-detail-frame";
import { CounselorMenu } from "@/components/counselor/counselor-menu";
import {
  CounselorDetailHeader,
  CounselorDetailPending,
} from "@/components/counselor/detail-header";
import { Chip } from "@/components/ui/chip";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  return { title: `${counselorHeading(counselor.name)} | ${siteConfig.name}` };
}

export default function CounselorPage({ params }: Props) {
  return (
    <Suspense fallback={<CounselorDetailPending />}>
      <CounselorContent params={params} />
    </Suspense>
  );
}

async function CounselorContent({ params }: Props) {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  const heading = counselorHeading(counselor.name);
  const chips = displayChips(counselor);
  const careers = counselor.careers.filter((career) => career.trim());
  const intro = counselor.intro.trim() ? counselor.intro : "";
  const description =
    counselor.description.trim() &&
    counselor.description.trim() !== counselor.intro.trim()
      ? counselor.description
      : "";
  const storeName = counselor.storeName.trim() ? counselor.storeName : "";
  return (
    <CounselorDetailFrame>
      <CounselorDetailHeader />
      <CounselorPhoto
        src={counselor.imageUrl}
        alt={`${heading} 사진`}
        sizes="100vw"
        imageClassName="object-cover object-[center_12%]"
        className="h-85 w-full"
      />
      <section className="relative z-10 -mt-7 mx-4 flex flex-col gap-2 rounded-card border border-border bg-surface px-4.5 pt-8 pb-4.5 @3xl/app:mx-6">
        <h1 className="m-0 text-display font-extrabold wrap-anywhere">
          <CounselorName
            name={counselor.name}
            honorificClassName="text-subtitle font-semibold text-muted"
          />
        </h1>
        {chips.length > 0 && (
          <div className="flex min-w-0 max-w-full flex-wrap gap-1">
            {chips.map((tag, index) => (
              <Chip key={tag} primary={index === 0}>
                {tag}
              </Chip>
            ))}
          </div>
        )}
        {storeName ? (
          <p className="flex items-start gap-1.5 text-label text-muted">
            <Store size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 wrap-anywhere">{storeName}</span>
          </p>
        ) : null}
        {intro ? (
          <p className="text-body wrap-anywhere whitespace-pre-wrap">{intro}</p>
        ) : null}
      </section>
      {careers.length > 0 && (
        <section className="min-w-0 px-4 pt-7 @3xl/app:px-6">
          <h2 className="mb-3 text-title font-bold">경력</h2>
          <ul className="flex list-none flex-col gap-2.5 p-0">
            {careers.map((career, index) => (
              <li
                key={`${index}-${career}`}
                className="flex min-w-0 items-start gap-2 text-body"
              >
                <Check
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-brand"
                />
                <span className="min-w-0 wrap-anywhere whitespace-pre-wrap">
                  {career}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {description ? (
        <section className="min-w-0 px-4 pt-7 @3xl/app:px-6">
          <h2 className="mb-3 text-title font-bold">소개</h2>
          <p className="text-body wrap-anywhere whitespace-pre-wrap">
            {description}
          </p>
        </section>
      ) : null}
      <CounselorMenu counselorId={counselor.id} products={counselor.products} />
      <section className="px-4 pt-7 @3xl/app:px-6">
        <div className="flex flex-col gap-2 rounded-card bg-brand-soft p-4 text-brand-deep">
          <p className="flex items-center gap-1.5 text-body font-extrabold">
            <Phone size={18} aria-hidden="true" />
            전화상담은 이렇게 해요
          </p>
          <p className="text-label">
            예약한 시간에 선생님이 쪽집게천사 매장 전화로 먼저 연락드려요. 개인
            번호는 쓰지 않아요.
          </p>
        </div>
      </section>
      <section className="px-4 pt-7 @3xl/app:px-6">
        <h2 className="mb-3 text-title font-bold">상담 후기</h2>
        <div className="rounded-card border border-border bg-surface px-5 py-5 text-center text-label text-muted">
          상담 후기는 준비 중이에요.
        </div>
      </section>
    </CounselorDetailFrame>
  );
}
