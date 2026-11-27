import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorizationMatches } from "./cron-auth";
import { depositExpiryPatch, pendingWindowStart } from "./deposit-expiry";

type Admin = ReturnType<typeof createAdminClient>;

export async function cancelExpiredDeposits(db: Admin, now: number) {
  const { data, error } = await db
    .from("reservations")
    .update(depositExpiryPatch(now))
    .eq("status", "pending_payment")
    .lt("created_at", pendingWindowStart(now))
    .select("id");
  if (error || !Array.isArray(data)) throw error ?? new Error("expire failed");
  return data.length;
}

export async function expireDepositReservations(now = Date.now()) {
  return cancelExpiredDeposits(createAdminClient(), now);
}

// Unpaid rows stay inside the exclusion constraint until this cancel runs.
export async function releaseExpiredDepositHolds(
  db: Admin,
  hold: {
    counselorId: string;
    startsAt: string;
    endsAt: string;
    now: number;
  },
) {
  const { error } = await db
    .from("reservations")
    .update(depositExpiryPatch(hold.now))
    .eq("counselor_id", hold.counselorId)
    .eq("status", "pending_payment")
    .lt("created_at", pendingWindowStart(hold.now))
    .lt("starts_at", hold.endsAt)
    .gt("ends_at", hold.startsAt);
  if (error) throw error;
}

export async function handleDepositExpiryRequest(
  authorization: string | null,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!authorizationMatches(authorization, secret))
    return { status: 401 as const };
  try {
    const count = await expireDepositReservations(now);
    return { status: 200 as const, count };
  } catch {
    console.error("Reservation deposit expiry failed");
    return { status: 500 as const };
  }
}
