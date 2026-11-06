"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { categoryLabels } from "@/lib/inquiries/validation";
import type { Faq } from "@/lib/data/faqs";

export function FaqList({ faqs, error }: { faqs: Faq[]; error: boolean }) {
  const [category, setCategory] = useState("all");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const visible =
    category === "all" ? faqs : faqs.filter((faq) => faq.category === category);
  return (
    <div aria-busy={pending}>
      <div
        role="group"
        aria-label="질문 분류"
        className="mb-4 flex flex-wrap gap-2"
      >
        {[
          ["all", "전체"],
          ...Object.entries(categoryLabels).filter(([key]) => key !== "other"),
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => setCategory(key)}
            className={`min-h-11 rounded-full px-3 text-sm font-medium ${category === key ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {pending ? (
        <p role="status" className="py-6 text-muted">
          자주 묻는 질문을 불러오는 중입니다.
        </p>
      ) : error ? (
        <div className="rounded-card border border-border bg-surface p-4">
          <p role="alert">
            자주 묻는 질문을 불러오지 못했습니다. 다시 시도해 주세요.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => startTransition(() => router.refresh())}
          >
            다시 시도
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p
          role="status"
          className="rounded-card border border-border bg-surface p-4 text-muted"
        >
          {category === "all"
            ? "등록된 자주 묻는 질문이 없습니다."
            : "이 분류에 등록된 질문이 없습니다."}
        </p>
      ) : (
        <div key={category} className="space-y-2 md:space-y-3">
          {visible.map((faq) => (
            <details
              key={faq.id}
              className="rounded-card border border-border bg-surface p-3 md:p-4"
            >
              <summary className="min-h-11 cursor-pointer content-center text-body font-semibold wrap-anywhere md:text-base">
                {faq.question}
              </summary>
              <p className="mt-3 border-t border-border pt-3 text-body leading-relaxed whitespace-pre-wrap wrap-anywhere md:text-base">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      )}
      <div className="mt-7 rounded-card bg-brand-soft p-3 md:mt-9 md:p-4">
        <p className="font-semibold">찾으시는 답변이 없으신가요?</p>
        <p className="mt-1 text-caption text-muted md:text-sm">
          로그인 없이도 1:1 문의를 남길 수 있습니다.
        </p>
        <Button href="/support/inquiry" className="mt-3">
          1:1 문의 작성
        </Button>
      </div>
    </div>
  );
}
