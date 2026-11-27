import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  parseLessonRow,
  type LessonRow,
} from "@/components/lectures/lesson-view";

export async function listLessonRecords(userId: string) {
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("lecture_lessons")
      .select("id,lecture_id,title,sort_order,status,duration_seconds")
      .eq("teacher_id", userId);
    if (error || !Array.isArray(data)) {
      return { rows: null as LessonRow[] | null, error: true };
    }
    return {
      rows: data.map((row) => parseLessonRow(row)),
      error: false,
    };
  } catch {
    return { rows: null as LessonRow[] | null, error: true };
  }
}
