"use server";

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { reservationLookupColumns, toPublicResult } from "./public-result";
import { lookupFailure, lookupMismatch, validateLookup } from "./validation";
import type { LookupState } from "./types";

export async function lookupReservation(form: FormData): Promise<LookupState> {
  if (!(form instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateLookup(form);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    // 상담사 이름은 예약 행과 함께 읽는다. 공개 상담사 조회로 거르면 비공개 상담사의 과거 예약이 빠진다.
    const { data, error } = await createAdminClient()
      .from("reservations")
      .select(reservationLookupColumns)
      .eq("reservation_no", values.reservationNo)
      .eq("customer_email", values.email)
      .maybeSingle();
    if (error) return { message: lookupFailure };
    if (!data) return { message: lookupMismatch };
    const result = toPublicResult(data, values.reservationNo);
    if (!result) return { message: lookupFailure };
    return { result };
  } catch {
    // 원문 DB 오류, 입력값, 인증 정보는 응답하거나 기록하지 않는다.
    return { message: lookupFailure };
  }
}
