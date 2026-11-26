import { Suspense } from "react";
import { connection } from "next/server";
import { InquiryLookup } from "@/components/support/inquiry-lookup";
import { InquiryResult } from "@/components/support/inquiry-result";
import type { InquiryResult as InquiryResultData } from "@/lib/inquiries/types";
import { readNotifyInquiry } from "@/lib/notify-link/lookup";
import { inquiryLinkExpiredMessage } from "@/lib/notify-link/messages";
import { notifyTokenQuery } from "@/lib/notify-link/query";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

type Query = { t?: string | string[] };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Query>;
}): Promise<Metadata> {
  const token = (await searchParams).t;
  return {
    title: `문의 조회 | ${siteConfig.name}`,
    robots: { index: false, follow: false },
    ...(token !== undefined ? { referrer: "no-referrer" as const } : {}),
  };
}

function InquiryDirect({ result }: { result: InquiryResultData }) {
  return (
    <section>
      <h1 className="text-lg font-bold">문의 조회</h1>
      <div>
        <h2
          tabIndex={-1}
          className="mt-7 scroll-mt-4 text-lg font-bold focus:outline-none"
        >
          조회 결과
        </h2>
        <InquiryResult result={result} />
      </div>
    </section>
  );
}

async function InquiryLookupContent({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  await connection();
  const query = notifyTokenQuery((await searchParams).t);
  if (!query.present) return <InquiryLookup />;
  const result = query.token ? await readNotifyInquiry(query.token) : null;
  if (result) return <InquiryDirect result={result} />;
  return <InquiryLookup linkNotice={inquiryLinkExpiredMessage} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <Suspense
      fallback={
        <p role="status" className="text-body text-muted">
          문의 조회 화면을 준비하고 있어요.
        </p>
      }
    >
      <InquiryLookupContent searchParams={searchParams} />
    </Suspense>
  );
}
