import { isUuid } from "./rules";

export const reviewBodyLimit = 2000;

export type ReviewDraft = {
  rating: number;
  body: string;
  publishConsent: boolean;
};

export type ReviewFieldErrors = {
  rating?: string;
  body?: string;
};

export type ReviewDraftResult =
  | { ok: true; value: ReviewDraft }
  | { ok: false; message: string; fieldErrors: ReviewFieldErrors };

export type ReviewEligibility =
  "eligible" | "missing" | "incomplete" | "invalid";

export type ReviewEligibilityInput = {
  id: string;
  user_id: string | null;
  status: string;
  counselor_id: string | null;
  customer_name: string | null;
};

const eligibilityMessage: Record<
  Exclude<ReviewEligibility, "eligible">,
  string
> = {
  missing: "본인 예약이 아니거나 후기를 쓸 수 없어요.",
  incomplete: "상담이 완료된 예약에만 후기를 쓸 수 있어요.",
  invalid: "후기를 저장하지 못했어요. 예약 정보를 확인해 주세요.",
};

export const reviewWritePath = "/mypage/reviews/new";

export const noWritableReviewMessage =
  "완료된 상담·주문이 있으면 후기를 남길 수 있어요.";

export function reviewWriteHref(loggedIn: boolean) {
  if (loggedIn) return reviewWritePath;
  return `/login?next=${encodeURIComponent(reviewWritePath)}`;
}

export function canWriteReview(
  reservation: { id: string; status: string },
  reviewedReservationIds: ReadonlySet<string>,
) {
  return (
    reservation.status === "completed" &&
    !reviewedReservationIds.has(reservation.id)
  );
}

export function reviewEligibilityMessage(result: ReviewEligibility) {
  if (result === "eligible") return "";
  return eligibilityMessage[result];
}

export function reviewEligibility(
  reservation: ReviewEligibilityInput | null,
  memberId: string,
): ReviewEligibility {
  if (!reservation || !isUuid(reservation.id) || !isUuid(memberId))
    return "missing";
  if (!reservation.user_id || reservation.user_id !== memberId)
    return "missing";
  if (reservation.status !== "completed") return "incomplete";
  if (!isUuid(reservation.counselor_id)) return "invalid";
  if (
    typeof reservation.customer_name !== "string" ||
    !/\S/.test(reservation.customer_name) ||
    [...reservation.customer_name].length > 100
  )
    return "invalid";
  return "eligible";
}

export function reviewVisibilityLabel(review: {
  is_published: boolean;
  hidden_by_admin: boolean;
}) {
  if (review.hidden_by_admin) return "관리자에 의해 숨겨짐";
  return review.is_published ? "공개" : "비공개";
}

function oneString(form: FormData, name: string) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  return values[0];
}

export function parseReviewDraft(form: FormData): ReviewDraftResult {
  if (!(form instanceof FormData))
    return {
      ok: false,
      message: "입력한 내용을 확인해 주세요.",
      fieldErrors: {},
    };

  const fieldErrors: ReviewFieldErrors = {};
  const ratingText = oneString(form, "rating");
  const bodyText = oneString(form, "body");
  const consentValues = form.getAll("publish_consent");
  let rating: number | null = null;
  let body = "";

  if (!ratingText || !/^[1-5]$/.test(ratingText))
    fieldErrors.rating = "별점을 선택해 주세요.";
  else rating = Number(ratingText);

  if (bodyText === null) fieldErrors.body = "후기 내용을 입력해 주세요.";
  else {
    body = bodyText.trim();
    if (!/\S/.test(body)) fieldErrors.body = "후기 내용을 입력해 주세요.";
    else if ([...body].length > reviewBodyLimit)
      fieldErrors.body = "후기는 2,000자까지 쓸 수 있어요.";
  }

  if (
    consentValues.length > 1 ||
    consentValues.some((value) => value !== "true")
  )
    return {
      ok: false,
      message: "입력한 내용을 확인해 주세요.",
      fieldErrors,
    };

  if (fieldErrors.rating || fieldErrors.body || rating === null)
    return {
      ok: false,
      message: "입력한 내용을 확인해 주세요.",
      fieldErrors,
    };

  return {
    ok: true,
    value: {
      rating,
      body,
      publishConsent: consentValues.length === 1,
    },
  };
}
