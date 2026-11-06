import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getFaqs } from "@/lib/data/faqs";
import { FaqList } from "@/components/support/faq-list";

export const metadata: Metadata = { title: "자주 묻는 질문 | 쪽집게천사" };

async function FaqContent() {
  await connection();
  const data = await getFaqs();
  return <FaqList {...data} />;
}
export default function Page() {
  return (
    <section>
      <h1 className="mb-3 text-lg font-bold md:text-xl">자주 묻는 질문</h1>
      <Suspense
        fallback={
          <p role="status" className="py-6 text-muted">
            자주 묻는 질문을 불러오는 중입니다.
          </p>
        }
      >
        <FaqContent />
      </Suspense>
    </section>
  );
}
