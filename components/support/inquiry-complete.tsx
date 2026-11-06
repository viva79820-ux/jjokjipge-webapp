"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { InquiryReceipt } from "@/lib/inquiries/types";
import { supportDate } from "./form-fields";

export function InquiryComplete({ receipt }: { receipt: InquiryReceipt }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const numberRef = useRef<HTMLParagraphElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.scrollIntoView({ block: "start" });
  }, []);
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(receipt.inquiryNo);
      setMessage("문의번호를 복사했습니다.");
    } catch {
      const range = document.createRange();
      if (numberRef.current) {
        range.selectNodeContents(numberRef.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setMessage(
        "자동 복사를 하지 못했습니다. 선택된 문의번호를 직접 복사해 주세요.",
      );
    }
  }
  return (
    <section className="space-y-4 rounded-card border border-border bg-surface p-3 md:p-4">
      <Badge>접수 완료</Badge>
      <h1
        ref={titleRef}
        tabIndex={-1}
        className="scroll-mt-4 text-lg font-bold focus:outline-none md:text-xl"
      >
        문의가 접수되었습니다.
      </h1>
      <div>
        <p className="text-caption text-muted">문의번호</p>
        <p
          ref={numberRef}
          tabIndex={0}
          aria-label={`문의번호 ${receipt.inquiryNo}`}
          className="mt-1 select-text text-xl font-bold text-brand wrap-anywhere"
        >
          {receipt.inquiryNo}
        </p>
      </div>
      <p className="text-sm text-muted">
        접수 시각:{" "}
        <time dateTime={receipt.createdAt}>
          {supportDate(receipt.createdAt)}
        </time>
      </p>
      <p className="text-body md:text-base">
        문의번호와 작성한 이메일로 답변을 확인할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copyNumber}>
          문의번호 복사
        </Button>
        <Button href="/support/lookup">문의 조회</Button>
      </div>
      <p role="status" className="text-caption text-muted">
        {message}
      </p>
    </section>
  );
}
