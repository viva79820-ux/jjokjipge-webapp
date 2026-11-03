"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { calculateSlots, koreanDate } from "@/lib/booking-time";
import { getAvailableSlots, getBookingProduct } from "./availability";
import { validateReservation } from "./validation";
import type { BookingState } from "./types";
import { duplicateMessage } from "./rules";

const failureMessage =
  "예약 중 문제가 생겼어요. 잠시 후 다시 시도하거나 매장으로 연락해 주세요.";

export async function createReservation(
  _prevState: BookingState,
  formData: FormData,
): Promise<BookingState> {
  if (!(formData instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateReservation(formData);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    const { counselorSlug, productId, startsAt } = values;
    const context = await getBookingProduct(counselorSlug, productId);
    if (!context)
      return {
        errors: {
          productId: "예약 가능한 상담사와 상품을 다시 선택해 주세요.",
        },
      };
    const start = new Date(startsAt).toISOString();
    const date = koreanDate(new Date(start));
    if (
      !calculateSlots(date, context.product.minutes, []).some(
        (slot) => slot.startsAt === start && slot.available,
      )
    ) {
      return {
        errors: { startsAt: "예약 가능한 날짜와 시간을 다시 선택해 주세요." },
        message: "예약 가능한 날짜와 시간을 다시 선택해 주세요.",
      };
    }
    const slots = await getAvailableSlots(counselorSlug, productId, date);
    const slot = slots.find((item) => item.startsAt === start);
    if (!slot?.available)
      return {
        errors: { startsAt: duplicateMessage },
        message: duplicateMessage,
      };
    const auth = await createClient();
    const { data: claims, error: authError } = await auth.auth.getClaims();
    if (authError && authError.name !== "AuthSessionMissingError")
      throw authError;
    const endsAt = new Date(
      Date.parse(start) + context.product.minutes * 60000,
    ).toISOString();
    const { data, error } = await createAdminClient()
      .from("reservations")
      .insert({
        user_id: claims?.claims?.sub || null,
        counselor_id: context.counselor.id,
        product_id: context.product.id,
        product_name: context.product.name,
        minutes: context.product.minutes,
        price: context.product.price,
        starts_at: start,
        ends_at: endsAt,
        customer_name: values.name,
        customer_phone: values.phone,
        customer_email: values.email,
        payment_method: "bank_transfer",
        depositor_name: values.depositor,
      })
      .select("reservation_no,product_name,starts_at,ends_at,price")
      .single();
    if (error) {
      if (error.code === "23P01")
        return {
          errors: { startsAt: duplicateMessage },
          message: duplicateMessage,
        };
      throw error;
    }
    return {
      success: {
        reservationNo: data.reservation_no,
        counselorName: context.counselor.name,
        productName: data.product_name,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        price: data.price,
        paymentMethod: "bank_transfer",
      },
    };
  } catch (error) {
    // Never log raw database messages, form values, or authentication tokens.
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[0-9A-Z]{5}$/.test(error.code)
        ? error.code
        : "UNKNOWN";
    console.error("Reservation creation failed", { code });
    return { message: failureMessage };
  }
}
