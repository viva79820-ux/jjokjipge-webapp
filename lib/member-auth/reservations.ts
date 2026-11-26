import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReservationStatus } from "@/lib/reservations/lookup/types";

export type MemberReservation = {
  id: string;
  reservation_no: string;
  status: ReservationStatus;
  starts_at: string;
  ends_at: string;
  product_name: string;
  counselors: { name: string } | null;
};

const memberReservationColumns =
  "id,reservation_no,status,starts_at,ends_at,product_name,counselors(name)";

export async function getMemberReservations(memberId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(memberReservationColumns)
    .eq("user_id", memberId)
    .order("starts_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<MemberReservation[]>();

  if (error || !data) {
    throw new Error("회원 예약 내역을 불러오지 못했습니다.");
  }
  return data;
}
