"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/member-auth/session";
import { createClient } from "@/lib/supabase/server";
import { getReviewReservation, listMyReviews } from "./member-data";
import {
  parseReviewDraft,
  reviewEligibilityMessage,
  type ReviewFieldErrors,
} from "./member-rules";
import { isUuid } from "./rules";

export type ReviewFormState = {
  status: "idle" | "error";
  message: string;
  fieldErrors?: ReviewFieldErrors;
};

const savedPath = "/mypage?notice=review-saved";
const deletedPath = "/mypage?notice=review-deleted";

function revalidateReviews() {
  revalidatePath("/mypage");
  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
}

function rejected(message: string, fieldErrors?: ReviewFieldErrors) {
  return { status: "error" as const, message, fieldErrors };
}

function databaseMessage(code: string | undefined, duplicate: string) {
  if (code === "23505") return duplicate;
  if (code === "42501") return "본인 후기만 저장할 수 있어요.";
  return "후기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function createMyReview(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const draft = parseReviewDraft(form);
  if (!draft.ok) return rejected(draft.message, draft.fieldErrors);

  const reservationId = form.get("reservation_id");
  if (
    typeof reservationId !== "string" ||
    !isUuid(reservationId) ||
    form.getAll("reservation_id").length !== 1
  )
    return rejected("후기를 작성할 예약을 확인해 주세요.");

  const member = await getMember();
  if (!member) redirect("/login");

  try {
    const reservation = await getReviewReservation(member.id, reservationId);
    if (!reservation.ok)
      return rejected(reviewEligibilityMessage(reservation.eligibility));

    const existing = await listMyReviews();
    if (existing.some((review) => review.reservation_id === reservationId))
      return rejected("이미 이 예약의 후기를 작성했어요.");

    const supabase = await createClient();
    const { error } = await supabase.from("reviews").insert({
      counselor_id: reservation.reservation.counselor_id,
      author_id: member.id,
      author_name: reservation.reservation.customer_name,
      rating: draft.value.rating,
      body: draft.value.body,
      reservation_id: reservationId,
      publish_consent: draft.value.publishConsent,
    });
    if (error)
      return rejected(
        databaseMessage(error.code, "이미 이 예약의 후기를 작성했어요."),
      );
  } catch {
    return rejected("후기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidateReviews();
  redirect(savedPath);
}

export async function updateMyReview(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const draft = parseReviewDraft(form);
  if (!draft.ok) return rejected(draft.message, draft.fieldErrors);

  const id = form.get("id");
  const version = form.get("version");
  if (
    typeof id !== "string" ||
    !isUuid(id) ||
    typeof version !== "string" ||
    version.length > 80 ||
    !Number.isFinite(Date.parse(version)) ||
    form.getAll("id").length !== 1 ||
    form.getAll("version").length !== 1
  )
    return rejected("후기를 다시 열어 주세요.");

  const member = await getMember();
  if (!member) redirect("/login");

  try {
    const mine = (await listMyReviews()).find((review) => review.id === id);
    if (!mine) return rejected("본인 후기만 수정할 수 있어요.");
    if (mine.updated_at !== version)
      return rejected("다른 작업으로 후기가 변경됐어요. 다시 열어 주세요.");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reviews")
      .update({
        rating: draft.value.rating,
        body: draft.value.body,
        publish_consent: draft.value.publishConsent,
      })
      .eq("id", id)
      .eq("updated_at", version)
      .select("id")
      .maybeSingle();
    if (error)
      return rejected(databaseMessage(error.code, "후기를 수정하지 못했어요."));
    if (!data)
      return rejected("다른 작업으로 후기가 변경됐어요. 다시 열어 주세요.");
  } catch {
    return rejected("후기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidateReviews();
  redirect(savedPath);
}

export async function deleteMyReview(
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const id = form.get("id");
  const version = form.get("version");
  if (
    !(form instanceof FormData) ||
    typeof id !== "string" ||
    !isUuid(id) ||
    typeof version !== "string" ||
    version.length > 80 ||
    !Number.isFinite(Date.parse(version)) ||
    form.getAll("id").length !== 1 ||
    form.getAll("version").length !== 1
  )
    return rejected("후기를 다시 확인해 주세요.");

  const member = await getMember();
  if (!member) redirect("/login");

  try {
    const mine = (await listMyReviews()).find((review) => review.id === id);
    if (!mine) return rejected("본인 후기만 삭제할 수 있어요.");
    if (mine.updated_at !== version)
      return rejected("다른 작업으로 후기가 변경됐어요. 다시 열어 주세요.");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", id)
      .eq("updated_at", version)
      .select("id");
    if (error) return rejected("본인 후기만 삭제할 수 있어요.");
    if (!data?.length)
      return rejected("다른 작업으로 후기가 변경됐어요. 다시 열어 주세요.");
  } catch {
    return rejected("후기를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  revalidateReviews();
  redirect(deletedPath);
}
