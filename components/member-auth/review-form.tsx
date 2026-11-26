"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  alertClass,
  fieldClass,
  labelClass,
  noteClass,
} from "@/components/member-auth/styles";
import {
  createMyReview,
  updateMyReview,
  type ReviewFormState,
} from "@/lib/reviews/member-actions";
import { reviewBodyLimit } from "@/lib/reviews/member-rules";

const initialState: ReviewFormState = {
  status: "idle",
  message: "",
};

export function ReviewForm({
  mode,
  reservationId,
  reviewId,
  version,
  counselorName,
  productName,
  defaultRating,
  defaultBody,
  defaultConsent,
  hiddenByAdmin,
}: {
  mode: "create" | "edit";
  reservationId?: string;
  reviewId?: string;
  version?: string;
  counselorName: string;
  productName?: string;
  defaultRating?: number;
  defaultBody?: string;
  defaultConsent?: boolean;
  hiddenByAdmin?: boolean;
}) {
  const [state, action, pending] = useActionState(
    mode === "create" ? createMyReview : updateMyReview,
    initialState,
  );
  const [rating, setRating] = useState(defaultRating ?? 0);
  const [body, setBody] = useState(defaultBody ?? "");

  return (
    <form action={action} className="mt-5 space-y-5">
      {mode === "create" ? (
        <input type="hidden" name="reservation_id" value={reservationId} />
      ) : (
        <>
          <input type="hidden" name="id" value={reviewId} />
          <input type="hidden" name="version" value={version} />
        </>
      )}
      <dl className="space-y-3 rounded-card border border-border bg-surface p-3">
        <div>
          <dt className="text-caption text-muted">상담사</dt>
          <dd className="mt-1 text-subtitle font-bold wrap-anywhere">
            {counselorName}
          </dd>
        </div>
        {productName ? (
          <div>
            <dt className="text-caption text-muted">상담 상품</dt>
            <dd className="mt-1 text-body wrap-anywhere">{productName}</dd>
          </div>
        ) : null}
      </dl>
      <fieldset>
        <legend className={labelClass}>별점</legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <label
              key={score}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border text-label font-bold ${
                rating === score
                  ? "border-brand bg-brand text-on-brand"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              <input
                type="radio"
                name="rating"
                value={score}
                checked={rating === score}
                onChange={() => setRating(score)}
                className="sr-only"
              />
              {score}점
            </label>
          ))}
        </div>
        {state.fieldErrors?.rating ? (
          <p className={`mt-2 ${alertClass}`}>{state.fieldErrors.rating}</p>
        ) : null}
      </fieldset>
      <div>
        <label htmlFor="review-body" className={labelClass}>
          후기 내용
        </label>
        <textarea
          id="review-body"
          name="body"
          required
          rows={6}
          maxLength={reviewBodyLimit}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className={`${fieldClass(Boolean(state.fieldErrors?.body))} mt-2 resize-y py-3`}
        />
        <p className={`mt-1 text-right ${noteClass}`}>
          {[...body.trim()].length.toLocaleString("ko-KR")} / 2,000자
        </p>
        {state.fieldErrors?.body ? (
          <p className={alertClass}>{state.fieldErrors.body}</p>
        ) : null}
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="publish_consent"
          value="true"
          defaultChecked={defaultConsent}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand"
        />
        <span>
          <span className="text-label font-semibold">후기 공개에 동의</span>
          <span className={`mt-1 block ${noteClass}`}>
            동의하지 않으면 비공개로 저장돼요. 공개 화면에서는 이름이 일부만
            보여요.
          </span>
        </span>
      </label>
      {hiddenByAdmin ? (
        <p className="text-label font-semibold text-brand-deep">
          관리자에 의해 숨겨짐. 내용을 고쳐도 공개 화면에는 보이지 않아요.
        </p>
      ) : null}
      {state.message ? <p className={alertClass}>{state.message}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "저장 중" : mode === "create" ? "후기 등록" : "후기 저장"}
      </Button>
    </form>
  );
}
