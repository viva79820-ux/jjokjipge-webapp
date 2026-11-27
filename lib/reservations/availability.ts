import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addDays,
  bookingDates,
  calculateSlots,
  isBookingDate,
} from "@/lib/booking-time";
import { pendingWindowStart } from "./deposit-expiry";

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function getBookingProduct(slug: string, productId: string) {
  if (
    slug.length > 100 ||
    !slugPattern.test(slug) ||
    !uuidPattern.test(productId)
  )
    return null;
  const db = createAdminClient();
  const counselor = await db
    .from("counselors")
    .select("id,name")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .maybeSingle();
  if (counselor.error) throw counselor.error;
  if (!counselor.data) return null;
  const product = await db
    .from("consult_products")
    .select("id,name,minutes,price")
    .eq("id", productId)
    .eq("counselor_id", counselor.data.id)
    .eq("is_active", true)
    .maybeSingle();
  if (product.error) throw product.error;
  if (!product.data) return null;
  return { counselor: counselor.data, product: product.data };
}

// Only occupied intervals are read; customer information never leaves the database here.
async function occupiedRanges(
  counselorId: string,
  first: string,
  last: string,
  status: "pending_payment" | "confirmed",
  now: Date,
) {
  let query = createAdminClient()
    .from("reservations")
    .select("starts_at,ends_at")
    .eq("counselor_id", counselorId)
    .eq("status", status)
    .lt("starts_at", `${addDays(last, 1)}T00:00:00+09:00`)
    .gt("ends_at", `${first}T00:00:00+09:00`);
  if (status === "pending_payment")
    query = query.gte("created_at", pendingWindowStart(now.getTime()));
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function getBusyIntervals(
  counselorId: string,
  first: string,
  last: string,
  now: Date,
) {
  const [pending, confirmed] = await Promise.all([
    occupiedRanges(counselorId, first, last, "pending_payment", now),
    occupiedRanges(counselorId, first, last, "confirmed", now),
  ]);
  return [...pending, ...confirmed];
}

export async function getAvailableSlots(
  counselorSlug: string,
  productId: string,
  date: string,
  now = new Date(),
) {
  if (!isBookingDate(date, now)) return [];
  const context = await getBookingProduct(counselorSlug, productId);
  if (!context) return [];
  const busy = await getBusyIntervals(context.counselor.id, date, date, now);
  return calculateSlots(date, context.product.minutes, busy, now);
}

export async function getAvailabilityCalendar(
  counselorSlug: string,
  productId: string,
) {
  const context = await getBookingProduct(counselorSlug, productId);
  if (!context) return [];
  const now = new Date();
  const dates = bookingDates(now);
  const busy = await getBusyIntervals(
    context.counselor.id,
    dates[0],
    dates[dates.length - 1],
    now,
  );
  return dates.map((date) => ({
    date,
    slots: calculateSlots(date, context.product.minutes, busy, now),
  }));
}
