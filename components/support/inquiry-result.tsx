import { Badge } from "@/components/ui/badge";
import { SectionTitle } from "@/components/ui/section-title";
import { categoryLabels } from "@/lib/inquiries/validation";
import type { InquiryResult as Result } from "@/lib/inquiries/types";
import { supportDate } from "./form-fields";

export function InquiryResult({ result }: { result: Result }) {
  return (
    <div className="mt-7 min-w-0 space-y-4 md:mt-9">
      <section
        aria-label="접수한 문의"
        className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
      >
        <SectionTitle title="접수한 문의" />
        <dl className="space-y-3 text-body md:text-base">
          <div>
            <dt className="text-caption text-muted">문의번호</dt>
            <dd className="font-semibold wrap-anywhere">{result.inquiryNo}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">분류</dt>
            <dd>{categoryLabels[result.category]}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">접수 시각</dt>
            <dd>
              <time dateTime={result.createdAt}>
                {supportDate(result.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-caption text-muted">상태</dt>
            <dd>
              <Badge>
                {result.status === "answered" ? "답변 완료" : "답변 대기"}
              </Badge>
            </dd>
          </div>
          {result.reservationNo && (
            <div>
              <dt className="text-caption text-muted">입력한 예약번호</dt>
              <dd className="wrap-anywhere">{result.reservationNo}</dd>
            </div>
          )}
          <div>
            <dt className="mb-1 text-caption text-muted">문의 내용</dt>
            <dd className="leading-relaxed whitespace-pre-wrap wrap-anywhere">
              {result.content}
            </dd>
          </div>
        </dl>
      </section>
      <section
        aria-label="문의 답변"
        className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
      >
        <SectionTitle title="문의 답변" />
        {result.status === "answered" ? (
          <>
            <p className="text-body leading-relaxed whitespace-pre-wrap wrap-anywhere md:text-base">
              {result.answer}
            </p>
            {result.answeredAt && (
              <p className="mt-3 text-caption text-muted">
                답변 시각:{" "}
                <time dateTime={result.answeredAt}>
                  {supportDate(result.answeredAt)}
                </time>
              </p>
            )}
          </>
        ) : (
          <p className="text-body text-muted md:text-base">
            아직 답변이 등록되지 않았습니다.
          </p>
        )}
      </section>
    </div>
  );
}
