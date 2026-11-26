"use client";

import { useActionState } from "react";
import {
  changeReviewVisibility,
  type ReviewVisibilityResult,
} from "@/lib/reviews/actions";

const initialState: ReviewVisibilityResult = {
  state: "idle",
  message: "",
};

export function ReviewVisibility({
  id,
  version,
  isPublished,
}: {
  id: string;
  version: string;
  isPublished: boolean;
}) {
  const [result, action, pending] = useActionState(
    changeReviewVisibility,
    initialState,
  );
  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input
          type="hidden"
          name="is_published"
          value={isPublished ? "false" : "true"}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "처리 중" : isPublished ? "숨김으로 전환" : "공개로 전환"}
        </button>
      </form>
      {result.message ? (
        <p
          role="status"
          className={`max-w-64 text-right text-caption wrap-anywhere ${result.state === "saved" ? "text-brand" : "text-error"}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
