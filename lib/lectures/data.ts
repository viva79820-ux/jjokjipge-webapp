import "server-only";

import { createClient } from "@/lib/supabase/server";
import { lectureColumns, uuid, type LectureRecord } from "./rules";

export async function isTeacher(userId: string) {
  if (!uuid(userId)) return false;
  const db = await createClient();
  const { data, error } = await db
    .from("teachers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && !!data;
}

export async function hasLectureConsent(userId: string) {
  if (!uuid(userId)) return false;
  const db = await createClient();
  const { data, error } = await db
    .from("lecture_upload_consents")
    .select("agreed_at")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && !!data;
}

export async function listMyLectures(userId: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("lectures")
    .select(lectureColumns)
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<LectureRecord[]>();
  if (error) return { rows: null as LectureRecord[] | null, error: true };
  return { rows: data ?? [], error: false };
}

export async function readMyLecture(userId: string, id: string) {
  if (!uuid(id)) return { row: null, error: false };
  const db = await createClient();
  const { data, error } = await db
    .from("lectures")
    .select(lectureColumns)
    .eq("id", id)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (error) return { row: null, error: true };
  return { row: (data as LectureRecord | null) ?? null, error: false };
}
