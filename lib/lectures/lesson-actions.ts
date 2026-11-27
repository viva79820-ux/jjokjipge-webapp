"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { lessonDeps } from "./lesson-db";
import {
  createLessonWith,
  deleteLectureWith,
  deleteLessonWith,
  refreshLessonWith,
  resignLessonWith,
  updateLessonWith,
  type CreateLessonInput,
  type LessonActionResult,
  type ResignLessonInput,
} from "./lesson-ops";
import { lectureVideoStorageJudgment } from "./video";
import { lectureVideoStoragePendingMessage } from "./video/limits";

export type { CreateLessonInput, LessonActionResult, ResignLessonInput };

function invalidate(lectureId?: string) {
  revalidatePath("/mypage");
  revalidatePath("/mypage/lectures");
  revalidatePath("/admin/lectures");
  revalidatePath("/class");
  if (lectureId) revalidatePath(`/mypage/lectures/${lectureId}`);
}

function failed(message: string): LessonActionResult {
  return { state: "unknown", message };
}

function storageNotReady(): LessonActionResult | null {
  if (lectureVideoStorageJudgment() === null) return null;
  return {
    state: "rejected",
    message: lectureVideoStoragePendingMessage,
  };
}

export async function createLesson(
  input: CreateLessonInput,
): Promise<LessonActionResult> {
  const blocked = storageNotReady();
  if (blocked) return blocked;
  try {
    const result = await createLessonWith(input, await lessonDeps());
    if (result.state === "saved") invalidate(result.lectureId);
    return result;
  } catch {
    return failed("차시를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function resignLessonUpload(
  input: ResignLessonInput,
): Promise<LessonActionResult> {
  const blocked = storageNotReady();
  if (blocked) return blocked;
  try {
    return await resignLessonWith(input, await lessonDeps());
  } catch {
    return failed("업로드 서명을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function refreshLessonVideo(
  lessonId: string,
): Promise<LessonActionResult> {
  try {
    const result = await refreshLessonWith(lessonId, await lessonDeps());
    if (result.state === "saved") invalidate(result.lectureId);
    return result;
  } catch {
    return failed("차시 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function deleteLesson(
  lessonId: string,
): Promise<LessonActionResult> {
  try {
    const result = await deleteLessonWith(lessonId, await lessonDeps());
    if (result.state === "saved") invalidate(result.lectureId);
    return result;
  } catch {
    return failed("차시를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function deleteLecture(
  lectureId: string,
): Promise<LessonActionResult> {
  try {
    const result = await deleteLectureWith(lectureId, await lessonDeps());
    if (result.state === "saved" || result.state === "partial") {
      invalidate(lectureId);
    }
    return result;
  } catch {
    return failed("강의를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function updateLessonDetails(input: {
  lessonId: string;
  title?: string;
  sortOrder?: number;
}): Promise<LessonActionResult> {
  try {
    const result = await updateLessonWith(input, await lessonDeps());
    if (result.state === "saved") invalidate(result.lectureId);
    return result;
  } catch {
    return failed("차시를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}
