"use client";

import { useActionState, useState } from "react";
import {
  deleteMyReview,
  type ReviewFormState,
} from "@/lib/reviews/member-actions";

const initialState: ReviewFormState = {
  status: "idle",
  message: "",
};

const buttonClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand disabled:cursor-not-allowed disabled:opacity-60";

export function DeleteReviewButton({
  id,
  version,
}: {
  id: string;
  version: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteMyReview, initialState);

  if (!confirming)
    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => setConfirming(true)}
      >
        삭제
      </button>
    );

  return (
    <form action={action} className="flex min-w-0 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "삭제 중" : "삭제 확인"}
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setConfirming(false)}
      >
        취소
      </button>
      {state.message ? (
        <p className="w-full text-caption text-error wrap-anywhere">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
