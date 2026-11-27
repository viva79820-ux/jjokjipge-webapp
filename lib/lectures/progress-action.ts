"use server";

import "server-only";

import { getConfirmedUser } from "@/lib/member-auth/session";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "./rules";
import { normalizeProgressSeconds } from "./resume";

export async function saveLectureProgress(
  lessonId: unknown,
  positionSeconds: unknown,
) {
  const position = normalizeProgressSeconds(positionSeconds);
  if (!uuid(lessonId) || position == null) return { ok: false as const };
  const confirmed = await getConfirmedUser();
  if (confirmed.status !== "ok") return { ok: false as const };
  const db = await createClient();
  const saved = await db.from("lecture_progress").upsert(
    {
      user_id: confirmed.id,
      lesson_id: lessonId,
      position_seconds: position,
    },
    { onConflict: "user_id,lesson_id" },
  );
  if (saved.error) return { ok: false as const };
  return { ok: true as const };
}
