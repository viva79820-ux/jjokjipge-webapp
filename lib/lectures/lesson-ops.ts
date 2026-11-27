import { timingSafeEqual } from "node:crypto";
import { bunnyWebhookSignatureMatches } from "./video/bunny";
import {
  lectureVideoFileError,
  lessonTitleError,
  sortOrderError,
} from "./video/limits";
import {
  lessonStatusFromBunnyWebhook,
  type LectureUploadAuthorization,
  type LectureVideoStore,
  type LessonVideoStatus,
} from "./video/types";

export type LessonActor = { id: string };

export type OwnedLecture = {
  id: string;
  teacherId: string;
  thumbnailPath: string | null;
};

export type OwnedLesson = {
  id: string;
  lectureId: string;
  teacherId: string;
  title: string;
  sortOrder: number;
  provider: "mock" | "bunny";
  providerVideoId: string | null;
  status: LessonVideoStatus;
  lastEventAt: string | null;
};

export type LessonDeps = {
  actor(): Promise<LessonActor | null>;
  teacher(userId: string): Promise<boolean>;
  consent(userId: string): Promise<boolean>;
  lecture(userId: string, lectureId: string): Promise<OwnedLecture | null>;
  lesson(userId: string, lessonId: string): Promise<OwnedLesson | null>;
  lessons(userId: string, lectureId: string): Promise<OwnedLesson[]>;
  insertLesson(row: {
    lectureId: string;
    teacherId: string;
    title: string;
    sortOrder: number;
    provider: "mock" | "bunny";
    providerVideoId: string;
    status: "created";
  }): Promise<{ id: string }>;
  updateServerFields(
    lessonId: string,
    teacherId: string,
    patch: {
      status: LessonVideoStatus;
      durationSeconds: number | null;
      storageBytes: number | null;
    },
  ): Promise<boolean>;
  updateTitleOrder(
    lessonId: string,
    teacherId: string,
    patch: { title?: string; sortOrder?: number },
  ): Promise<boolean>;
  deleteLesson(lessonId: string, teacherId: string): Promise<boolean>;
  deleteLessons(lectureId: string, teacherId: string): Promise<boolean>;
  deleteLecture(lectureId: string, teacherId: string): Promise<boolean>;
  removeThumbnail(userId: string, path: string): Promise<boolean>;
  store: LectureVideoStore;
  provider: "mock" | "bunny";
};

export type CreateLessonInput = {
  lectureId: string;
  title: string;
  sortOrder?: number;
  mimeType: string;
  sizeBytes: number;
};

export type ResignLessonInput = {
  lessonId: string;
  mimeType: string;
  sizeBytes: number;
};

export type LessonActionResult =
  | {
      state: "saved";
      message: string;
      lessonId?: string;
      lectureId?: string;
      upload?: LectureUploadAuthorization;
      status?: LessonVideoStatus;
      durationSeconds?: number | null;
      storageBytes?: number | null;
    }
  | { state: "rejected"; message: string }
  | { state: "unknown"; message: string }
  | { state: "partial"; message: string; remaining: string[] };

const loginNeeded: LessonActionResult = {
  state: "rejected",
  message: "로그인이 필요해요.",
};
const teacherNeeded: LessonActionResult = {
  state: "rejected",
  message: "선생님 권한이 필요해요.",
};
const notFound: LessonActionResult = {
  state: "rejected",
  message: "강의를 찾지 못했어요.",
};
const lessonMissing: LessonActionResult = {
  state: "rejected",
  message: "차시를 찾지 못했어요.",
};
const badRequest: LessonActionResult = {
  state: "rejected",
  message: "요청을 확인해 주세요.",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rejected(message: string): LessonActionResult {
  return { state: "rejected", message };
}

function unknown(message: string): LessonActionResult {
  return { state: "unknown", message };
}

function partial(remaining: string[]): LessonActionResult {
  return {
    state: "partial",
    message: "삭제를 멈추었어요. 남은 항목을 확인해 주세요.",
    remaining,
  };
}

export function cronAuthorized(
  header: string | null,
  secret: string | undefined,
) {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const actual = header ?? "";
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}

export function shouldAlertStorage(
  usedBytes: number,
  limitBytes: number | null,
  alerted80At: string | null,
) {
  if (limitBytes == null || alerted80At) return false;
  if (!Number.isSafeInteger(usedBytes) || !Number.isSafeInteger(limitBytes)) {
    return false;
  }
  if (usedBytes < 0 || limitBytes < 0) return false;
  return BigInt(usedBytes) * BigInt(10) >= BigInt(limitBytes) * BigInt(8);
}

export function eventTimeMs(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return null;
  }
  const normalized = value.replace(
    /\.(\d+)(Z|[+-]\d{2}:\d{2})$/,
    (_, fraction: string, zone: string) =>
      `.${fraction.slice(0, 3).padEnd(3, "0")}${zone}`,
  );
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function publicUpload(
  upload: LectureUploadAuthorization,
  metadata: { filetype: string; title: string },
): LectureUploadAuthorization {
  return {
    videoId: upload.videoId,
    endpoint: upload.endpoint,
    signature: upload.signature,
    expireUnix: upload.expireUnix,
    libraryId: upload.libraryId,
    metadata,
  };
}

async function requireTeacher(deps: LessonDeps) {
  const actor = await deps.actor();
  if (!actor) return { actor: null, failure: loginNeeded };
  if (!(await deps.teacher(actor.id))) {
    return { actor: null, failure: teacherNeeded };
  }
  return { actor, failure: null };
}

function videoLabel(videoId: string) {
  return `영상 ${videoId}`;
}

function videoLabels(lessons: OwnedLesson[]) {
  return lessons.flatMap((lesson) =>
    lesson.providerVideoId ? [videoLabel(lesson.providerVideoId)] : [],
  );
}

function thumbnailLabel(path: string) {
  return `썸네일 ${path}`;
}

function lessonsLabel(count: number) {
  return `차시 ${count}건`;
}

const lectureLabel = "강의";

export async function createLessonWith(
  input: CreateLessonInput,
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(input.lectureId)) return badRequest;
  if (!(await deps.consent(gate.actor.id))) {
    return rejected("강의를 만들려면 업로드 동의가 필요해요.");
  }
  const lecture = await deps.lecture(gate.actor.id, input.lectureId);
  if (!lecture) return notFound;
  const titleError = lessonTitleError(input.title);
  if (titleError) return rejected(titleError);
  const fileError = lectureVideoFileError(input);
  if (fileError) return rejected(fileError);
  const existing = await deps.lessons(gate.actor.id, input.lectureId);
  const sortOrder =
    input.sortOrder ??
    existing.reduce((max, lesson) => Math.max(max, lesson.sortOrder), -1) + 1;
  const orderError = sortOrderError(sortOrder);
  if (orderError) return rejected(orderError);

  let videoId: string;
  try {
    const created = await deps.store.createVideo({ title: input.title });
    videoId = created.videoId;
  } catch {
    return unknown("영상을 만들지 못했어요.");
  }

  let lessonId: string;
  try {
    const inserted = await deps.insertLesson({
      lectureId: input.lectureId,
      teacherId: gate.actor.id,
      title: input.title,
      sortOrder,
      provider: deps.provider,
      providerVideoId: videoId,
      status: "created",
    });
    lessonId = inserted.id;
  } catch {
    try {
      await deps.store.deleteVideo(videoId);
    } catch {
      return unknown("영상을 만들었지만 차시 기록을 저장하지 못했어요.");
    }
    return unknown("차시를 저장하지 못했어요.");
  }

  try {
    const issued = await deps.store.issueUpload({ videoId });
    return {
      state: "saved",
      message: "차시를 만들었어요.",
      lessonId,
      lectureId: input.lectureId,
      upload: publicUpload(issued, {
        filetype: input.mimeType,
        title: input.title,
      }),
    };
  } catch {
    try {
      await deps.deleteLesson(lessonId, gate.actor.id);
      await deps.store.deleteVideo(videoId);
    } catch {
      return unknown("업로드 서명을 만들지 못했고 차시가 남아 있을 수 있어요.");
    }
    return unknown("업로드 서명을 만들지 못했어요.");
  }
}

export async function resignLessonWith(
  input: ResignLessonInput,
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(input.lessonId)) return badRequest;
  const lesson = await deps.lesson(gate.actor.id, input.lessonId);
  if (!lesson) return lessonMissing;
  const fileError = lectureVideoFileError(input);
  if (fileError) return rejected(fileError);
  if (lesson.provider !== deps.provider || !lesson.providerVideoId) {
    return rejected("이 차시의 저장소와 현재 설정이 달라요.");
  }
  if (
    lesson.status !== "created" &&
    lesson.status !== "uploading" &&
    lesson.status !== "failed"
  ) {
    return rejected("지금 상태에서는 이어 올릴 수 없어요.");
  }
  try {
    const issued = await deps.store.issueUpload({
      videoId: lesson.providerVideoId,
    });
    return {
      state: "saved",
      message: "업로드 서명을 다시 만들었어요.",
      lessonId: lesson.id,
      lectureId: lesson.lectureId,
      upload: publicUpload(issued, {
        filetype: input.mimeType,
        title: lesson.title,
      }),
    };
  } catch {
    return unknown("업로드 서명을 만들지 못했어요.");
  }
}

export async function refreshLessonWith(
  lessonId: string,
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(lessonId)) return badRequest;
  const lesson = await deps.lesson(gate.actor.id, lessonId);
  if (!lesson) return lessonMissing;
  if (lesson.provider !== deps.provider || !lesson.providerVideoId) {
    return rejected("이 차시의 저장소와 현재 설정이 달라요.");
  }
  try {
    const report = await deps.store.getStatus(lesson.providerVideoId);
    const saved = await deps.updateServerFields(lesson.id, gate.actor.id, {
      status: report.status,
      durationSeconds: report.durationSeconds,
      storageBytes: report.storageBytes,
    });
    if (!saved) return unknown("차시 상태를 저장하지 못했어요.");
    return {
      state: "saved",
      message: "차시 상태를 새로고침했어요.",
      lessonId: lesson.id,
      lectureId: lesson.lectureId,
      status: report.status,
      durationSeconds: report.durationSeconds,
      storageBytes: report.storageBytes,
    };
  } catch {
    return unknown("차시 상태를 불러오지 못했어요.");
  }
}

export async function deleteLessonWith(
  lessonId: string,
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(lessonId)) return badRequest;
  const lesson = await deps.lesson(gate.actor.id, lessonId);
  if (!lesson) return lessonMissing;
  if (lesson.providerVideoId) {
    if (lesson.provider !== deps.provider) {
      return partial([videoLabel(lesson.providerVideoId), "차시 1건"]);
    }
    try {
      await deps.store.deleteVideo(lesson.providerVideoId);
    } catch {
      return unknown("영상을 지우지 못해 차시는 그대로 두었어요.");
    }
  }
  const removed = await deps.deleteLesson(lesson.id, gate.actor.id);
  if (!removed) {
    return partial(["차시 1건"]);
  }
  return {
    state: "saved",
    message: "차시를 삭제했어요.",
    lessonId: lesson.id,
    lectureId: lesson.lectureId,
  };
}

export async function deleteLectureWith(
  lectureId: string,
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(lectureId)) return badRequest;
  const lecture = await deps.lecture(gate.actor.id, lectureId);
  if (!lecture) return notFound;
  const lessons = (await deps.lessons(gate.actor.id, lectureId)).slice();
  lessons.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  const pending = lessons.filter((lesson) => lesson.providerVideoId);
  const tail = () => [
    ...(lecture.thumbnailPath ? [thumbnailLabel(lecture.thumbnailPath)] : []),
    lessonsLabel(lessons.length),
    lectureLabel,
  ];

  for (let index = 0; index < pending.length; index += 1) {
    const lesson = pending[index];
    const videoId = lesson.providerVideoId;
    if (!videoId) continue;
    if (lesson.provider !== deps.provider) {
      return partial([...videoLabels(pending.slice(index)), ...tail()]);
    }
    try {
      await deps.store.deleteVideo(videoId);
    } catch {
      return partial([...videoLabels(pending.slice(index)), ...tail()]);
    }
  }

  if (lecture.thumbnailPath) {
    const removed = await deps.removeThumbnail(
      gate.actor.id,
      lecture.thumbnailPath,
    );
    if (!removed) {
      return partial([
        thumbnailLabel(lecture.thumbnailPath),
        ...tail().slice(1),
      ]);
    }
  }

  const lessonsDeleted = await deps.deleteLessons(lectureId, gate.actor.id);
  if (!lessonsDeleted)
    return partial([lessonsLabel(lessons.length), lectureLabel]);
  const lectureDeleted = await deps.deleteLecture(lectureId, gate.actor.id);
  if (!lectureDeleted) return partial([lectureLabel]);
  return {
    state: "saved",
    message: "강의를 삭제했어요.",
    lectureId,
  };
}

export async function updateLessonWith(
  input: { lessonId: string; title?: string; sortOrder?: number },
  deps: LessonDeps,
): Promise<LessonActionResult> {
  const gate = await requireTeacher(deps);
  if (!gate.actor) return gate.failure ?? loginNeeded;
  if (!uuidPattern.test(input.lessonId)) return badRequest;
  if (input.title == null && input.sortOrder == null) return badRequest;
  const lesson = await deps.lesson(gate.actor.id, input.lessonId);
  if (!lesson) return lessonMissing;
  const patch: { title?: string; sortOrder?: number } = {};
  if (input.title != null) {
    const titleError = lessonTitleError(input.title);
    if (titleError) return rejected(titleError);
    patch.title = input.title;
  }
  if (input.sortOrder != null) {
    const orderError = sortOrderError(input.sortOrder);
    if (orderError) return rejected(orderError);
    patch.sortOrder = input.sortOrder;
  }
  const saved = await deps.updateTitleOrder(lesson.id, gate.actor.id, patch);
  if (!saved) return unknown("차시 제목이나 순서를 저장하지 못했어요.");
  return {
    state: "saved",
    message: "차시를 수정했어요.",
    lessonId: lesson.id,
    lectureId: lesson.lectureId,
  };
}

export type WebhookDb = {
  findEvent(eventId: string): Promise<boolean>;
  insertEvent(event: {
    eventId: string;
    videoGuid: string;
    status: number;
    timestamp: string;
  }): Promise<"ok" | "duplicate" | "error">;
  findLesson(videoId: string): Promise<{
    id: string;
    lastEventAt: string | null;
  } | null>;
  updateLessonIfCurrent(
    lessonId: string,
    patch: { status: LessonVideoStatus; providerStatus: string },
    timestamp: string,
  ): Promise<"updated" | "stale" | "error">;
};

export type StorageRow = {
  usedBytes: number;
  limitBytes: number | null;
  alerted80At: string | null;
};

export async function runStorageCheck(deps: {
  store: Pick<LectureVideoStore, "getStorageUsage">;
  limitFromEnv: number | null;
  now: string;
  read(): Promise<StorageRow>;
  write(row: StorageRow): Promise<void>;
}) {
  const usage = await deps.store.getStorageUsage();
  if (!Number.isSafeInteger(usage.usedBytes) || usage.usedBytes < 0) {
    throw new Error("저장소 사용량을 읽지 못했어요.");
  }
  const current = await deps.read();
  const limitBytes = deps.limitFromEnv ?? current.limitBytes;
  let alerted80At = current.alerted80At;
  const alerted = shouldAlertStorage(usage.usedBytes, limitBytes, alerted80At);
  if (alerted) alerted80At = deps.now;
  await deps.write({
    usedBytes: usage.usedBytes,
    limitBytes,
    alerted80At,
  });
  return { alerted };
}

function textId(value: unknown, max: number) {
  return (
    typeof value === "string" &&
    value.length <= max &&
    /\S/.test(value) &&
    !/[\u0000-\u001F\u007F]/.test(value)
  );
}

export async function receiveBunnyWebhook(input: {
  rawBody: string;
  signature: string | null;
  version: string | null;
  algorithm: string | null;
  secret: string;
  libraryId: string;
  openDb: () => Promise<WebhookDb>;
}): Promise<Response> {
  if (
    !bunnyWebhookSignatureMatches({
      rawBody: input.rawBody,
      signature: input.signature,
      version: input.version,
      algorithm: input.algorithm,
      secret: input.secret,
    })
  ) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody) as unknown;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null) {
    return new Response(null, { status: 400 });
  }
  const body = payload as Record<string, unknown>;
  const libraryValue = body.VideoLibraryId;
  const libraryText =
    typeof libraryValue === "number" && Number.isSafeInteger(libraryValue)
      ? String(libraryValue)
      : typeof libraryValue === "string"
        ? libraryValue
        : "";
  if (!libraryText) return new Response(null, { status: 400 });
  if (input.libraryId && libraryText !== input.libraryId) {
    return new Response(null, { status: 401 });
  }
  if (!textId(body.EventId, 200) || !textId(body.VideoGuid, 200)) {
    return new Response(null, { status: 400 });
  }
  if (typeof body.Status !== "number" || !Number.isInteger(body.Status)) {
    return new Response(null, { status: 400 });
  }
  if (
    typeof body.Timestamp !== "string" ||
    eventTimeMs(body.Timestamp) == null
  ) {
    return new Response(null, { status: 400 });
  }

  const event = {
    eventId: body.EventId as string,
    videoGuid: body.VideoGuid as string,
    status: body.Status,
    timestamp: body.Timestamp,
  };
  const db = await input.openDb();
  if (await db.findEvent(event.eventId)) {
    return new Response(null, { status: 200 });
  }
  const lesson = await db.findLesson(event.videoGuid);
  if (!lesson) {
    const inserted = await db.insertEvent(event);
    if (inserted === "error") return new Response(null, { status: 500 });
    return new Response(null, { status: 200 });
  }
  if (lesson.lastEventAt) {
    const current = eventTimeMs(lesson.lastEventAt);
    const incoming = eventTimeMs(event.timestamp);
    if (current == null || incoming == null) {
      return new Response(null, { status: 500 });
    }
    if (incoming < current) {
      const inserted = await db.insertEvent(event);
      if (inserted === "error") return new Response(null, { status: 500 });
      return new Response(null, { status: 200 });
    }
  }
  const updated = await db.updateLessonIfCurrent(
    lesson.id,
    {
      status: lessonStatusFromBunnyWebhook(event.status),
      providerStatus: String(event.status),
    },
    event.timestamp,
  );
  if (updated === "error") return new Response(null, { status: 500 });
  const inserted = await db.insertEvent(event);
  if (inserted === "error") return new Response(null, { status: 500 });
  return new Response(null, { status: 200 });
}
