"use server";

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createFailure,
  lookupFailure,
  lookupMismatch,
  validateInquiry,
  validateLookup,
} from "./validation";
import type {
  CreateInquiryState,
  InquiryCategory,
  LookupInquiryState,
} from "./types";

export async function createInquiry(
  form: FormData,
): Promise<CreateInquiryState> {
  if (!(form instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateInquiry(form);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    const auth = await createClient();
    const { data: session, error: authError } = await auth.auth.getUser();
    if (
      !session ||
      session.user === undefined ||
      (session.user !== null && !session.user.id) ||
      (authError &&
        (authError.name !== "AuthSessionMissingError" || session.user))
    )
      return {
        message:
          "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    const userId = session?.user?.id ?? null;
    if (
      userId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId,
      )
    )
      return {
        message:
          "로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    const { data, error } = await createAdminClient()
      .from("inquiries")
      .insert({
        user_id: userId,
        category: values.category,
        customer_name: values.name,
        customer_email: values.email,
        customer_phone: values.phone,
        reservation_no: values.reservationNo,
        content: values.content,
      })
      .select("inquiry_no,created_at")
      .single();
    if (error || !data) return { message: createFailure };
    return {
      success: { inquiryNo: data.inquiry_no, createdAt: data.created_at },
    };
  } catch {
    // 원문 오류와 입력·인증 정보는 기록하거나 응답에 포함하지 않는다.
    return { message: createFailure };
  }
}

export async function lookupInquiry(
  form: FormData,
): Promise<LookupInquiryState> {
  if (!(form instanceof FormData))
    return { message: "입력한 내용을 확인해 주세요." };
  const { errors, values } = validateLookup(form);
  if (Object.keys(errors).length)
    return { errors, message: "입력한 내용을 확인해 주세요." };
  try {
    const { data, error } = await createAdminClient()
      .from("inquiries")
      .select(
        "inquiry_no,category,created_at,status,reservation_no,content,answer,answered_at",
      )
      .eq("inquiry_no", values.inquiryNo)
      .eq("customer_email", values.email)
      .maybeSingle();
    if (error) return { message: lookupFailure };
    if (!data) return { message: lookupMismatch };
    return {
      result: {
        inquiryNo: data.inquiry_no,
        category: data.category as InquiryCategory,
        createdAt: data.created_at,
        status: data.status,
        reservationNo: data.reservation_no,
        content: data.content,
        answer: data.status === "answered" ? data.answer : null,
        answeredAt: data.status === "answered" ? data.answered_at : null,
      },
    };
  } catch {
    return { message: lookupFailure };
  }
}
