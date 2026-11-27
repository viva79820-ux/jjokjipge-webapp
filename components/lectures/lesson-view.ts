import {
  lectureVideoFileError,
  lessonTitleError,
} from "@/lib/lectures/video/limits";

export const lessonStatuses = [
  "created",
  "uploading",
  "processing",
  "ready",
  "failed",
] as const;

export type LessonStatus = (typeof lessonStatuses)[number];

export const lessonStatusRefreshMs = 10_000;

export const deleteMediaWarning = "영상 파일도 함께 지워지고 되돌릴 수 없어요.";

export type LessonView = {
  id: string;
  title: string;
  sortOrder: number;
  status: LessonStatus;
  durationSeconds: number | null;
  encodeProgress: number | null;
};

export type LessonRow = LessonView & { lectureId: string };

export function isLessonStatus(value: string): value is LessonStatus {
  return lessonStatuses.includes(value as LessonStatus);
}

export function lessonStatusLabel(
  status: string,
  encodeProgress: number | null,
) {
  if (status === "uploading") return "업로드 중";
  if (status === "processing") {
    if (encodeProgress == null || !Number.isFinite(encodeProgress)) {
      return "변환 중";
    }
    const percent = Math.max(0, Math.min(100, Math.round(encodeProgress)));
    return `변환 중 ${percent}%`;
  }
  if (status === "ready") return "공개 가능";
  if (status === "failed") return "실패";
  return "업로드 전";
}

export function durationLabel(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "없음";
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest}초`;
  if (rest === 0) return `${minutes}분`;
  return `${minutes}분 ${rest}초`;
}

export function summarizeLessons(statuses: string[]) {
  return {
    total: statuses.length,
    uploading: statuses.filter((status) => status === "uploading").length,
    processing: statuses.filter((status) => status === "processing").length,
    failed: statuses.filter((status) => status === "failed").length,
  };
}

export function lessonMimeType(file: { name: string; type: string }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (extension !== "mp4" && extension !== "mov") return null;
  if (file.type === "video/mp4" || file.type === "video/quicktime") {
    return file.type;
  }
  if (file.type === "" || file.type === "application/octet-stream") {
    return extension === "mp4" ? "video/mp4" : "video/quicktime";
  }
  return null;
}

export function lessonFileProblem(file: {
  name: string;
  type: string;
  size: number;
}) {
  const mimeType = lessonMimeType(file);
  if (!mimeType) return "영상은 mp4 또는 mov만 올릴 수 있어요.";
  return lectureVideoFileError({ mimeType, sizeBytes: file.size });
}

export function lessonListKey(
  lessons: Pick<
    LessonView,
    "id" | "title" | "sortOrder" | "status" | "durationSeconds"
  >[],
) {
  return lessons
    .map((lesson) =>
      [
        lesson.id,
        lesson.title,
        lesson.sortOrder,
        lesson.status,
        lesson.durationSeconds ?? "",
      ].join(":"),
    )
    .join("|");
}

export function parseLessonRow(row: unknown): LessonRow {
  if (typeof row !== "object" || row === null) {
    throw new Error("차시를 읽지 못했어요.");
  }
  const record = row as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.lecture_id !== "string") {
    throw new Error("차시를 읽지 못했어요.");
  }
  if (typeof record.title !== "string" || lessonTitleError(record.title)) {
    throw new Error("차시를 읽지 못했어요.");
  }
  if (
    typeof record.sort_order !== "number" ||
    !Number.isInteger(record.sort_order)
  ) {
    throw new Error("차시를 읽지 못했어요.");
  }
  if (typeof record.status !== "string" || !isLessonStatus(record.status)) {
    throw new Error("차시를 읽지 못했어요.");
  }
  let durationSeconds: number | null = null;
  if (record.duration_seconds != null) {
    if (
      typeof record.duration_seconds !== "number" ||
      !Number.isInteger(record.duration_seconds) ||
      record.duration_seconds < 0
    ) {
      throw new Error("차시를 읽지 못했어요.");
    }
    durationSeconds = record.duration_seconds;
  }
  return {
    id: record.id,
    lectureId: record.lecture_id,
    title: record.title,
    sortOrder: record.sort_order,
    status: record.status,
    durationSeconds,
    encodeProgress: null,
  };
}

export function lessonsForLecture(rows: LessonRow[], lectureId: string) {
  return rows
    .filter((row) => row.lectureId === lectureId)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
}

export function reorderLessons<T extends { id: string; sortOrder: number }>(
  lessons: T[],
  lessonId: string,
  direction: "up" | "down",
) {
  const ordered = [...lessons].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1),
  );
  const index = ordered.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return null;
  const next = ordered.slice();
  const [item] = next.splice(index, 1);
  if (!item) return null;
  next.splice(target, 0, item);
  return next.map((lesson, sortOrder) => ({ id: lesson.id, sortOrder }));
}

export function sortPatches(
  before: { id: string; sortOrder: number }[],
  after: { id: string; sortOrder: number }[],
) {
  const previous = new Map(
    before.map((lesson) => [lesson.id, lesson.sortOrder]),
  );
  return after.filter((lesson) => previous.get(lesson.id) !== lesson.sortOrder);
}

export function mergeLessons(
  current: LessonView[],
  incoming: LessonView[],
  keepId?: string,
) {
  const progress = new Map(
    current.map((lesson) => [lesson.id, lesson.encodeProgress]),
  );
  const merged = incoming.map((lesson) => ({
    ...lesson,
    encodeProgress: progress.get(lesson.id) ?? lesson.encodeProgress,
  }));
  if (keepId && !merged.some((lesson) => lesson.id === keepId)) {
    const kept = current.find((lesson) => lesson.id === keepId);
    if (kept) merged.push(kept);
  }
  return merged.sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1),
  );
}

export function canResumeLesson(status: LessonStatus) {
  return status === "created" || status === "uploading" || status === "failed";
}
