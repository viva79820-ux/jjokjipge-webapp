import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUuid } from "./rules";
import {
  reviewEligibility,
  type ReviewEligibility,
  type ReviewEligibilityInput,
} from "./member-rules";

export type MyReview = {
  id: string;
  reservation_id: string | null;
  counselor_id: string | null;
  counselor_name: string | null;
  rating: number;
  body: string;
  is_published: boolean;
  publish_consent: boolean;
  hidden_by_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type EligibleReservation = ReviewEligibilityInput & {
  product_name: string;
  counselor_name: string | null;
};

const reservationColumns =
  "id,user_id,status,counselor_id,customer_name,product_name,counselors(name)";

function counselorName(value: unknown) {
  if (Array.isArray(value)) return counselorName(value[0]);
  if (!value || typeof value !== "object" || !("name" in value)) return null;
  return typeof value.name === "string" ? value.name : null;
}

function isMyReview(value: unknown): value is MyReview {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    isUuid(row.id) &&
    (row.reservation_id === null || isUuid(row.reservation_id)) &&
    (row.counselor_id === null || isUuid(row.counselor_id)) &&
    (typeof row.counselor_name === "string" || row.counselor_name === null) &&
    typeof row.rating === "number" &&
    Number.isInteger(row.rating) &&
    row.rating >= 1 &&
    row.rating <= 5 &&
    typeof row.body === "string" &&
    typeof row.is_published === "boolean" &&
    typeof row.publish_consent === "boolean" &&
    typeof row.hidden_by_admin === "boolean" &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}

export async function listMyReviews() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_reviews");
  if (error || !Array.isArray(data) || !data.every(isMyReview))
    throw new Error("내 후기를 불러오지 못했습니다.");
  return data;
}

export async function getReviewReservation(
  memberId: string,
  reservationId: string,
): Promise<
  | { ok: true; reservation: EligibleReservation }
  | { ok: false; eligibility: Exclude<ReviewEligibility, "eligible"> }
> {
  if (!isUuid(memberId) || !isUuid(reservationId))
    return { ok: false, eligibility: "missing" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(reservationColumns)
    .eq("id", reservationId)
    .eq("user_id", memberId)
    .maybeSingle();

  if (error) throw new Error("예약 정보를 확인하지 못했습니다.");

  const reservation = data as
    | (ReviewEligibilityInput & {
        product_name?: unknown;
        counselors?: unknown;
      })
    | null;
  const eligibility = reviewEligibility(
    reservation
      ? {
          id: reservation.id,
          user_id: reservation.user_id,
          status: reservation.status,
          counselor_id: reservation.counselor_id,
          customer_name: reservation.customer_name,
        }
      : null,
    memberId,
  );
  if (eligibility !== "eligible" || !reservation)
    return {
      ok: false,
      eligibility: eligibility === "eligible" ? "invalid" : eligibility,
    };

  const productName =
    typeof reservation.product_name === "string"
      ? reservation.product_name.trim()
      : "";
  if (!productName) return { ok: false, eligibility: "invalid" };

  return {
    ok: true,
    reservation: {
      id: reservation.id,
      user_id: reservation.user_id,
      status: reservation.status,
      counselor_id: reservation.counselor_id,
      customer_name: reservation.customer_name,
      product_name: productName,
      counselor_name: counselorName(reservation.counselors),
    },
  };
}
