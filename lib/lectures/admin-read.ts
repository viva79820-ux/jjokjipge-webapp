import "server-only";

import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import {
  parseByteCount,
  type StorageAmounts,
} from "@/lib/lectures/storage-view";
import { lectureColumns, uuid, type LectureRecord } from "@/lib/lectures/rules";

export type AdminStorageRead =
  | { state: "empty" }
  | { state: "unavailable" }
  | { state: "ready"; row: StorageAmounts };

export type AdminLessonView = {
  id: string;
  title: string;
  sortOrder: number;
  status: string;
  durationSeconds: number | null;
  storageBytes: number | null;
};

export type AdminLectureDetail =
  | { state: "missing" }
  | { state: "unavailable" }
  | {
      state: "ready";
      lecture: LectureRecord & { teacherName: string | null };
      lessons: AdminLessonView[] | null;
    };

const lessonColumns =
  "id,title,sort_order,status,duration_seconds,storage_bytes";

export async function readLectureStorageForAdmin(): Promise<AdminStorageRead> {
  const admin = await requireAdmin();
  if (!admin) return { state: "unavailable" };
  const db = await createClient();
  // 점검 시각 칸은 없다. 카드는 기록 없음으로 보여 준다.
  const result = await db
    .from("lecture_storage_state")
    .select("used_bytes,limit_bytes,alerted_80_at")
    .eq("id", 1)
    .maybeSingle();
  if (result.error) return { state: "unavailable" };
  if (!result.data) return { state: "empty" };
  const row = result.data as Record<string, unknown>;
  const usedBytes = parseByteCount(row.used_bytes);
  const limitBytes =
    row.limit_bytes == null ? null : parseByteCount(row.limit_bytes);
  if (usedBytes == null || (row.limit_bytes != null && limitBytes == null)) {
    return { state: "unavailable" };
  }
  if (row.alerted_80_at != null && typeof row.alerted_80_at !== "string") {
    return { state: "unavailable" };
  }
  return {
    state: "ready",
    row: {
      usedBytes,
      limitBytes,
      alerted80At:
        typeof row.alerted_80_at === "string" ? row.alerted_80_at : null,
    },
  };
}

export async function readLectureDetailForAdmin(
  id: string,
): Promise<AdminLectureDetail> {
  const admin = await requireAdmin();
  if (!admin || !uuid(id)) return { state: "unavailable" };
  const db = await createClient();
  const lecture = await db
    .from("lectures")
    .select(lectureColumns)
    .eq("id", id)
    .maybeSingle()
    .returns<LectureRecord>();
  if (lecture.error) return { state: "unavailable" };
  if (!lecture.data) return { state: "missing" };
  const profile = await db
    .from("profiles")
    .select("id,name")
    .eq("id", lecture.data.teacher_id)
    .maybeSingle();
  if (profile.error) return { state: "unavailable" };
  const name = profile.data?.name;
  const teacherName =
    typeof name === "string" && name.trim() ? name.trim() : null;
  const lessons = await db
    .from("lecture_lessons")
    .select(lessonColumns)
    .eq("lecture_id", id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (lessons.error || !lessons.data) {
    return {
      state: "ready",
      lecture: { ...lecture.data, teacherName },
      lessons: null,
    };
  }
  const parsed: AdminLessonView[] = [];
  for (const row of lessons.data) {
    const lesson = parseLesson(row);
    if (!lesson) {
      return {
        state: "ready",
        lecture: { ...lecture.data, teacherName },
        lessons: null,
      };
    }
    parsed.push(lesson);
  }
  parsed.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return {
    state: "ready",
    lecture: { ...lecture.data, teacherName },
    lessons: parsed,
  };
}

function parseLesson(row: unknown): AdminLessonView | null {
  if (typeof row !== "object" || row === null) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || !uuid(record.id)) return null;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  if (
    typeof record.sort_order !== "number" ||
    !Number.isInteger(record.sort_order) ||
    record.sort_order < 0
  ) {
    return null;
  }
  if (typeof record.status !== "string" || !record.status.trim()) return null;
  let durationSeconds: number | null = null;
  if (record.duration_seconds != null) {
    if (
      typeof record.duration_seconds !== "number" ||
      !Number.isInteger(record.duration_seconds) ||
      record.duration_seconds < 0
    ) {
      return null;
    }
    durationSeconds = record.duration_seconds;
  }
  const storageBytes =
    record.storage_bytes == null ? null : parseByteCount(record.storage_bytes);
  if (record.storage_bytes != null && storageBytes == null) return null;
  return {
    id: record.id,
    title: record.title,
    sortOrder: record.sort_order,
    status: record.status,
    durationSeconds,
    storageBytes,
  };
}
