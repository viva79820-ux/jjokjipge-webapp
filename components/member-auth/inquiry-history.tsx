import { Badge } from "@/components/ui/badge";
import { supportDate } from "@/components/support/form-fields";
import { categoryLabels } from "@/lib/inquiries/validation";
import type { MemberInquiry } from "@/lib/member-auth/inquiries";

export function InquiryHistory({ inquiries }: { inquiries: MemberInquiry[] }) {
  return (
    <section aria-labelledby="member-inquiries-title" className="mt-7">
      <h2 id="member-inquiries-title" className="text-title font-bold">
        내 문의
      </h2>
      <p className="mt-3 text-caption leading-relaxed wrap-anywhere text-muted">
        로그인한 뒤에 접수한 문의만 보여요. 비회원으로 남긴 문의는 문의번호와
        이메일로 조회해 주세요.
      </p>
      {inquiries.length === 0 ? (
        <p className="mt-3 rounded-card border border-border bg-surface p-3 text-body text-muted @3xl/app:p-4">
          접수한 문의가 없어요.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {inquiries.map((inquiry) => {
            const category = Object.hasOwn(categoryLabels, inquiry.category)
              ? categoryLabels[inquiry.category]
              : "기타";
            const answered =
              inquiry.status === "answered" &&
              typeof inquiry.answer === "string";
            return (
              <li
                key={inquiry.id}
                className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
              >
                <article className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <Badge>{answered ? "답변 완료" : "답변 대기"}</Badge>
                    <span className="text-caption text-muted break-all">
                      {inquiry.inquiry_no}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-3 text-body">
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">분류</dt>
                      <dd className="mt-1 wrap-anywhere">{category}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">접수 시각</dt>
                      <dd className="mt-1 wrap-anywhere">
                        <time dateTime={inquiry.created_at}>
                          {supportDate(inquiry.created_at)}
                        </time>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">문의 내용</dt>
                      <dd className="mt-1 leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {inquiry.content}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-caption text-muted">답변</dt>
                      <dd className="mt-1 leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {answered
                          ? inquiry.answer
                          : "아직 답변이 등록되지 않았습니다."}
                      </dd>
                      {answered && inquiry.answered_at && (
                        <dd className="mt-2 text-caption text-muted">
                          답변 시각:{" "}
                          <time dateTime={inquiry.answered_at}>
                            {supportDate(inquiry.answered_at)}
                          </time>
                        </dd>
                      )}
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
