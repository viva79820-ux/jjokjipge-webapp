import "server-only";
import { requireAdmin } from "./auth";
import { createClient } from "@/lib/supabase/server";
import { summaryColumns, type ReservationSummary } from "./reservations";
import { koreanDay, dayStart, dayEndExclusive } from "./reservation-rules";

export async function getDashboard() {
  if (!(await requireAdmin())) return null;
  const db = await createClient();
  const now = new Date();
  const today = koreanDay(now);
  const [daily, pending, upcoming, recent] = await Promise.all([
    db
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .neq("status", "cancelled")
      .gte("starts_at", dayStart(today))
      .lt("starts_at", dayEndExclusive(today)),
    db
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_payment"),
    db
      .from("reservations")
      .select(summaryColumns)
      .eq("status", "confirmed")
      .gt("starts_at", now.toISOString())
      .order("starts_at")
      .order("id")
      .limit(5)
      .returns<ReservationSummary[]>(),
    db
      .from("reservations")
      .select(summaryColumns)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5)
      .returns<ReservationSummary[]>(),
  ]);
  if (
    daily.error ||
    pending.error ||
    upcoming.error ||
    recent.error ||
    daily.count === null ||
    pending.count === null ||
    !upcoming.data ||
    !recent.data
  )
    throw new Error("대시보드를 불러오지 못했습니다.");
  return {
    today,
    daily: daily.count,
    pending: pending.count,
    upcoming: upcoming.data,
    recent: recent.data,
  };
}
