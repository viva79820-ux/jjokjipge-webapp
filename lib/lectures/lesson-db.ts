import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasLectureConsent, isTeacher } from "./data";
import { getMember } from "@/lib/member-auth/session";
import { bucket, thumbnailPathFor } from "./rules";
import type {
  LessonDeps,
  OwnedLesson,
  StorageRow,
  WebhookDb,
} from "./lesson-ops";
import { getLectureVideoStore } from "./video";
import { lectureVideoProviderName, storageLimitFromEnv } from "./video/limits";
import {
  lectureVideoProviders,
  lessonVideoStatuses,
  type LessonVideoStatus,
} from "./video/types";

const lessonColumns =
  "id,lecture_id,teacher_id,title,sort_order,provider,provider_video_id,status,last_event_at";

function asStatus(value: unknown): LessonVideoStatus {
  if (
    typeof value === "string" &&
    lessonVideoStatuses.includes(value as LessonVideoStatus)
  ) {
    return value as LessonVideoStatus;
  }
  throw new Error("차시 상태를 읽지 못했어요.");
}

function asProvider(value: unknown): "mock" | "bunny" {
  if (
    typeof value === "string" &&
    lectureVideoProviders.includes(value as "mock" | "bunny")
  ) {
    return value as "mock" | "bunny";
  }
  throw new Error("차시 저장소를 읽지 못했어요.");
}

function asLesson(row: Record<string, unknown>): OwnedLesson {
  if (typeof row.id !== "string" || typeof row.lecture_id !== "string") {
    throw new Error("차시를 읽지 못했어요.");
  }
  if (typeof row.teacher_id !== "string" || typeof row.title !== "string") {
    throw new Error("차시를 읽지 못했어요.");
  }
  if (typeof row.sort_order !== "number") {
    throw new Error("차시를 읽지 못했어요.");
  }
  return {
    id: row.id,
    lectureId: row.lecture_id,
    teacherId: row.teacher_id,
    title: row.title,
    sortOrder: row.sort_order,
    provider: asProvider(row.provider),
    providerVideoId:
      typeof row.provider_video_id === "string" ? row.provider_video_id : null,
    status: asStatus(row.status),
    lastEventAt:
      typeof row.last_event_at === "string" ? row.last_event_at : null,
  };
}

export async function lessonDeps(): Promise<LessonDeps> {
  const provider = lectureVideoProviderName(process.env.LECTURE_VIDEO_PROVIDER);
  const store = getLectureVideoStore();
  return {
    async actor() {
      const member = await getMember();
      return member ? { id: member.id } : null;
    },
    teacher(userId) {
      return isTeacher(userId);
    },
    consent(userId) {
      return hasLectureConsent(userId);
    },
    async lecture(userId, lectureId) {
      const db = await createClient();
      const { data, error } = await db
        .from("lectures")
        .select("id,teacher_id,thumbnail_path")
        .eq("id", lectureId)
        .eq("teacher_id", userId)
        .maybeSingle();
      if (error) throw new Error("강의를 읽지 못했어요.");
      if (!data) return null;
      return {
        id: data.id,
        teacherId: data.teacher_id,
        thumbnailPath: data.thumbnail_path,
      };
    },
    async lesson(userId, lessonId) {
      const db = await createClient();
      const { data, error } = await db
        .from("lecture_lessons")
        .select(lessonColumns)
        .eq("id", lessonId)
        .eq("teacher_id", userId)
        .maybeSingle();
      if (error) throw new Error("차시를 읽지 못했어요.");
      if (!data) return null;
      return asLesson(data as Record<string, unknown>);
    },
    async lessons(userId, lectureId) {
      const db = await createClient();
      const { data, error } = await db
        .from("lecture_lessons")
        .select(lessonColumns)
        .eq("lecture_id", lectureId)
        .eq("teacher_id", userId);
      if (error) throw new Error("차시 목록을 읽지 못했어요.");
      return (data ?? []).map((row) =>
        asLesson(row as Record<string, unknown>),
      );
    },
    async insertLesson(row) {
      const db = createAdminClient();
      const { data, error } = await db
        .from("lecture_lessons")
        .insert({
          lecture_id: row.lectureId,
          teacher_id: row.teacherId,
          title: row.title,
          sort_order: row.sortOrder,
          provider: row.provider,
          provider_video_id: row.providerVideoId,
          status: row.status,
        })
        .select("id")
        .maybeSingle();
      if (error || !data?.id) throw new Error("차시를 저장하지 못했어요.");
      return { id: data.id };
    },
    async updateServerFields(lessonId, teacherId, patch) {
      const db = createAdminClient();
      const { data, error } = await db
        .from("lecture_lessons")
        .update({
          status: patch.status,
          duration_seconds: patch.durationSeconds,
          storage_bytes: patch.storageBytes,
        })
        .eq("id", lessonId)
        .eq("teacher_id", teacherId)
        .select("id");
      if (error) throw new Error("차시 상태를 저장하지 못했어요.");
      return Array.isArray(data) && data.length > 0;
    },
    async updateTitleOrder(lessonId, teacherId, patch) {
      const db = await createClient();
      const changes: { title?: string; sort_order?: number } = {};
      if (patch.title != null) changes.title = patch.title;
      if (patch.sortOrder != null) changes.sort_order = patch.sortOrder;
      const { data, error } = await db
        .from("lecture_lessons")
        .update(changes)
        .eq("id", lessonId)
        .eq("teacher_id", teacherId)
        .select("id");
      if (error) throw new Error("차시 제목이나 순서를 저장하지 못했어요.");
      return Array.isArray(data) && data.length > 0;
    },
    async deleteLesson(lessonId, teacherId) {
      const db = createAdminClient();
      const { error } = await db
        .from("lecture_lessons")
        .delete()
        .eq("id", lessonId)
        .eq("teacher_id", teacherId);
      return !error;
    },
    async deleteLessons(lectureId, teacherId) {
      const db = createAdminClient();
      const { error } = await db
        .from("lecture_lessons")
        .delete()
        .eq("lecture_id", lectureId)
        .eq("teacher_id", teacherId);
      return !error;
    },
    async deleteLecture(lectureId, teacherId) {
      const db = createAdminClient();
      const { error } = await db
        .from("lectures")
        .delete()
        .eq("id", lectureId)
        .eq("teacher_id", teacherId);
      return !error;
    },
    async removeThumbnail(userId, path) {
      if (!thumbnailPathFor(userId, path)) return false;
      const db = await createClient();
      const removed = await db.storage.from(bucket).remove([path]);
      return !removed.error;
    },
    store,
    provider,
  };
}

export async function webhookDb(): Promise<WebhookDb> {
  const db = createAdminClient();
  return {
    async findEvent(eventId) {
      const { data, error } = await db
        .from("lecture_webhook_events")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (error) throw new Error("웹훅 기록을 읽지 못했어요.");
      return !!data;
    },
    async insertEvent(event) {
      const { error } = await db.from("lecture_webhook_events").insert({
        event_id: event.eventId,
        provider_video_id: event.videoGuid,
        status: event.status,
        happened_at: event.timestamp,
      });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      return "error";
    },
    async findLesson(videoId) {
      const { data, error } = await db
        .from("lecture_lessons")
        .select("id,last_event_at")
        .eq("provider", "bunny")
        .eq("provider_video_id", videoId)
        .maybeSingle();
      if (error) throw new Error("차시를 읽지 못했어요.");
      if (!data) return null;
      return {
        id: data.id,
        lastEventAt:
          typeof data.last_event_at === "string" ? data.last_event_at : null,
      };
    },
    async updateLessonIfCurrent(lessonId, patch, timestamp) {
      const { data, error } = await db
        .from("lecture_lessons")
        .update({
          status: patch.status,
          provider_status: patch.providerStatus,
          last_event_at: timestamp,
        })
        .eq("id", lessonId)
        .or(`last_event_at.is.null,last_event_at.lte."${timestamp}"`)
        .select("id");
      if (error) return "error";
      return Array.isArray(data) && data.length > 0 ? "updated" : "stale";
    },
  };
}

function asCount(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function asStorage(row: Record<string, unknown>): StorageRow {
  const used = asCount(row.used_bytes);
  const limit = row.limit_bytes == null ? null : asCount(row.limit_bytes);
  if (used == null || (row.limit_bytes != null && limit == null)) {
    throw new Error("저장 용량 기록을 읽지 못했어요.");
  }
  return {
    usedBytes: used,
    limitBytes: limit,
    alerted80At:
      typeof row.alerted_80_at === "string" ? row.alerted_80_at : null,
  };
}

export async function storageCheckDeps() {
  const store = getLectureVideoStore();
  const limitFromEnv = storageLimitFromEnv(
    process.env.LECTURE_STORAGE_LIMIT_BYTES,
  );
  const db = createAdminClient();
  return {
    store,
    limitFromEnv,
    now: new Date().toISOString(),
    async read() {
      const { data, error } = await db
        .from("lecture_storage_state")
        .select("used_bytes,limit_bytes,alerted_80_at")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) throw new Error("저장 용량 기록을 읽지 못했어요.");
      return asStorage(data as Record<string, unknown>);
    },
    async write(row: StorageRow) {
      const { error } = await db
        .from("lecture_storage_state")
        .update({
          used_bytes: row.usedBytes,
          limit_bytes: row.limitBytes,
          alerted_80_at: row.alerted80At,
        })
        .eq("id", 1);
      if (error) throw new Error("저장 용량 기록을 쓰지 못했어요.");
    },
  };
}
