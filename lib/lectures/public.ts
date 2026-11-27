import "server-only";

import { publicThumbnailUrl, uuid, type LectureField } from "./rules";
import { resolveLessonPlayback } from "./playback";
import { normalizeProgressSeconds, type LessonPlayback } from "./resume";

const lectureColumns =
  "id,teacher_id,title,description,thumbnail_path,field,is_published,view_count,created_at";
const lessonColumns =
  "id,lecture_id,title,sort_order,duration_seconds,provider,provider_video_id,status";

const missingTableCodes = new Set(["42P01", "PGRST205"]);

export type PublicLectureSummary = {
  id: string;
  title: string;
  field: LectureField;
  teacherName: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  viewCount: number;
};

export type PublicLesson = {
  id: string;
  title: string;
  sortOrder: number;
  durationSeconds: number | null;
  playback: LessonPlayback | null;
};

export type PublicLectureDetail = {
  id: string;
  title: string;
  description: string;
  field: LectureField;
  teacherName: string;
  viewCount: number;
  thumbnailUrl: string | null;
  lessons: PublicLesson[];
};

type QueryError = { code?: string; message?: string } | null;

export type QueryResult = {
  data: unknown;
  error: QueryError;
};

export type LectureQuery = {
  select(columns: string): LectureQuery;
  eq(column: string, value: string | boolean): LectureQuery;
  in(column: string, values: readonly string[]): LectureQuery;
  order(column: string, options: { ascending: boolean }): LectureQuery;
  maybeSingle(): Promise<QueryResult>;
  then<T = QueryResult>(
    onfulfilled?: ((value: QueryResult) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ): Promise<T>;
};

export type RowRead = {
  rows: unknown[];
  missing: boolean;
  error: boolean;
};

export type PublicSource = {
  lectures(field: "" | LectureField): Promise<RowRead>;
  lessons(lectureIds: readonly string[]): Promise<RowRead>;
  lecture(id: string): Promise<{
    row: unknown | null;
    missing: boolean;
    error: boolean;
  }>;
  names(ids: readonly string[]): Promise<Map<string, string> | null>;
};

type LectureRow = {
  id: string;
  teacherId: string;
  title: string;
  description: string;
  thumbnailPath: string | null;
  field: LectureField;
  viewCount: number;
  createdAt: string;
};

type LessonRow = {
  id: string;
  lectureId: string;
  title: string;
  sortOrder: number;
  durationSeconds: number | null;
  provider: string;
  providerVideoId: string | null;
  status: string;
};

type PlaybackInput = {
  status: string;
  provider: string;
  providerVideoId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function publicField(value: string): "" | LectureField {
  if (value === "" || value === "saju" || value === "tarot") return value;
  throw new Error("강의 목록 조건이 올바르지 않습니다.");
}

export function teacherLabel(name: unknown) {
  return typeof name === "string" && name.trim() ? name.trim() : "선생님";
}

function missingTable(error: QueryError) {
  return !!error?.code && missingTableCodes.has(error.code);
}

export function lectureReadState(result: QueryResult): RowRead {
  if (missingTable(result.error))
    return { rows: [], missing: true, error: true };
  if (result.error || !Array.isArray(result.data)) {
    return { rows: [], missing: false, error: true };
  }
  return { rows: result.data, missing: false, error: false };
}

export function lectureSingleState(result: QueryResult) {
  if (missingTable(result.error)) {
    return { row: null, missing: true, error: false };
  }
  if (result.error?.code === "PGRST116") {
    return { row: null, missing: false, error: false };
  }
  if (result.error) return { row: null, missing: false, error: true };
  if (result.data == null) return { row: null, missing: false, error: false };
  return { row: result.data, missing: false, error: false };
}

function asLecture(value: unknown): LectureRow | null {
  if (!isRecord(value) || value.is_published !== true) return null;
  if (!uuid(value.id) || !uuid(value.teacher_id)) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (typeof value.description !== "string") return null;
  if (value.field !== "saju" && value.field !== "tarot") return null;
  if (
    typeof value.view_count !== "number" ||
    !Number.isInteger(value.view_count) ||
    value.view_count < 0
  ) {
    return null;
  }
  const thumbnailPath =
    typeof value.thumbnail_path === "string" ? value.thumbnail_path : null;
  if (value.thumbnail_path != null && thumbnailPath == null) return null;
  return {
    id: value.id,
    teacherId: value.teacher_id,
    title: value.title,
    description: value.description,
    thumbnailPath,
    field: value.field,
    viewCount: value.view_count,
    createdAt: typeof value.created_at === "string" ? value.created_at : "",
  };
}

function asLesson(value: unknown): LessonRow | null {
  if (!isRecord(value) || value.status !== "ready") return null;
  if (!uuid(value.id) || !uuid(value.lecture_id)) return null;
  if (typeof value.title !== "string" || !value.title.trim()) return null;
  if (
    typeof value.sort_order !== "number" ||
    !Number.isInteger(value.sort_order) ||
    value.sort_order < 0
  ) {
    return null;
  }
  if (value.provider !== "mock" && value.provider !== "bunny") return null;
  const duration = value.duration_seconds;
  if (
    duration != null &&
    (typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < 0)
  ) {
    return null;
  }
  const videoId = value.provider_video_id;
  if (videoId != null && typeof videoId !== "string") return null;
  return {
    id: value.id,
    lectureId: value.lecture_id,
    title: value.title,
    sortOrder: value.sort_order,
    durationSeconds: duration == null ? null : duration,
    provider: value.provider,
    providerVideoId: videoId == null ? null : videoId,
    status: "ready",
  };
}

function readyLessons(lessons: readonly LessonRow[], lectureId: string) {
  return lessons
    .filter((lesson) => lesson.lectureId === lectureId)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.id.localeCompare(right.id);
    });
}

function summaryOf(
  lecture: LectureRow,
  lessons: readonly LessonRow[],
  names: Map<string, string> | null,
): PublicLectureSummary | null {
  const ready = readyLessons(lessons, lecture.id);
  if (!ready.length) return null;
  return {
    id: lecture.id,
    title: lecture.title,
    field: lecture.field,
    teacherName: teacherLabel(names?.get(lecture.teacherId)),
    thumbnailUrl: publicThumbnailUrl(lecture.thumbnailPath, lecture.teacherId),
    lessonCount: ready.length,
    viewCount: lecture.viewCount,
  };
}

export function catalogFromRows(
  lectures: unknown,
  lessons: unknown,
  names: Map<string, string> | null,
  field: "" | LectureField,
): PublicLectureSummary[] {
  const lectureRows = (Array.isArray(lectures) ? lectures : [])
    .map(asLecture)
    .filter((row): row is LectureRow => row !== null)
    .filter((row) => field === "" || row.field === field)
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt < right.createdAt ? 1 : -1;
      }
      return right.id.localeCompare(left.id);
    });
  const lessonRows = (Array.isArray(lessons) ? lessons : [])
    .map(asLesson)
    .filter((row): row is LessonRow => row !== null);
  return lectureRows.flatMap((lecture) => {
    const summary = summaryOf(lecture, lessonRows, names);
    return summary ? [summary] : [];
  });
}

export function detailFromRows(
  lecture: unknown,
  lessons: unknown,
  names: Map<string, string> | null,
):
  | (Omit<PublicLectureDetail, "lessons"> & {
      lessons: Array<
        Omit<PublicLesson, "playback"> & { playbackInput: PlaybackInput }
      >;
    })
  | null {
  const row = asLecture(lecture);
  if (!row) return null;
  const ready = readyLessons(
    (Array.isArray(lessons) ? lessons : [])
      .map(asLesson)
      .filter((lesson): lesson is LessonRow => lesson !== null),
    row.id,
  );
  if (!ready.length) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    field: row.field,
    teacherName: teacherLabel(names?.get(row.teacherId)),
    viewCount: row.viewCount,
    thumbnailUrl: publicThumbnailUrl(row.thumbnailPath, row.teacherId),
    lessons: ready.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      sortOrder: lesson.sortOrder,
      durationSeconds: lesson.durationSeconds,
      playbackInput: {
        status: lesson.status,
        provider: lesson.provider,
        providerVideoId: lesson.providerVideoId,
      },
    })),
  };
}

export async function readPublishedLectures(
  from: (table: string) => LectureQuery,
  field: "" | LectureField,
) {
  let query = from("lectures").select(lectureColumns).eq("is_published", true);
  if (field) query = query.eq("field", field);
  return query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
}

export async function readReadyLessons(
  from: (table: string) => LectureQuery,
  lectureIds: readonly string[],
) {
  return from("lecture_lessons")
    .select(lessonColumns)
    .eq("status", "ready")
    .in("lecture_id", lectureIds)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
}

export async function readLectureById(
  from: (table: string) => LectureQuery,
  id: string,
) {
  return from("lectures")
    .select(lectureColumns)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
}

export async function readTeacherNames(
  from: (table: string) => LectureQuery,
  ids: readonly string[],
) {
  if (!ids.length) return new Map<string, string>();
  const result = await from("profiles").select("id,name").in("id", ids);
  const state = lectureReadState(result);
  if (state.error) return null;
  const names = new Map<string, string>();
  for (const row of state.rows) {
    if (!isRecord(row) || !uuid(row.id)) continue;
    const label = teacherLabel(row.name);
    if (label !== "선생님") names.set(row.id, label);
  }
  return names;
}

function queryFrom(db: { from: (table: string) => unknown }) {
  return (table: string) => db.from(table) as LectureQuery;
}

async function supabaseSource(): Promise<PublicSource> {
  const { createPublicClient } = await import("@/lib/supabase/public");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createPublicClient();
  const admin = createAdminClient();
  return {
    async lectures(field) {
      return lectureReadState(
        await readPublishedLectures(queryFrom(db), field),
      );
    },
    async lessons(lectureIds) {
      return lectureReadState(
        await readReadyLessons(queryFrom(db), lectureIds),
      );
    },
    async lecture(id) {
      return lectureSingleState(await readLectureById(queryFrom(db), id));
    },
    names(ids) {
      return readTeacherNames(queryFrom(admin), ids);
    },
  };
}

function teacherIdsOf(rows: unknown[]) {
  return [
    ...new Set(
      rows.flatMap((row) => {
        const lecture = asLecture(row);
        return lecture ? [lecture.teacherId] : [];
      }),
    ),
  ];
}

export async function listPublicLectures(field: string, source?: PublicSource) {
  const selected = publicField(field);
  const reader = source ?? (await supabaseSource());
  const lectures = await reader.lectures(selected);
  if (lectures.missing) return [] as PublicLectureSummary[];
  if (lectures.error) throw new Error("강의를 불러오지 못했습니다.");
  const ids = lectures.rows.flatMap((row) => {
    const lecture = asLecture(row);
    return lecture ? [lecture.id] : [];
  });
  if (!ids.length) return [] as PublicLectureSummary[];
  const lessons = await reader.lessons(ids);
  if (lessons.missing) return [] as PublicLectureSummary[];
  if (lessons.error) throw new Error("강의를 불러오지 못했습니다.");
  const names = await reader.names(teacherIdsOf(lectures.rows));
  return catalogFromRows(lectures.rows, lessons.rows, names, selected);
}

export function positionsFromRows(rows: unknown) {
  const positions: Record<string, number> = {};
  if (!Array.isArray(rows)) return positions;
  for (const row of rows) {
    if (!isRecord(row) || !uuid(row.lesson_id)) continue;
    const position = normalizeProgressSeconds(row.position_seconds);
    if (position == null) continue;
    positions[row.lesson_id] = position;
  }
  return positions;
}

async function progressDeps() {
  const { getConfirmedUser } = await import("@/lib/member-auth/session");
  const { createClient } = await import("@/lib/supabase/server");
  return {
    async user() {
      const confirmed = await getConfirmedUser();
      if (confirmed.status !== "ok") return null;
      return { id: confirmed.id };
    },
    async rows(userId: string, ids: readonly string[]) {
      const db = await createClient();
      const result = await db
        .from("lecture_progress")
        .select("lesson_id,position_seconds")
        .eq("user_id", userId)
        .in("lesson_id", [...ids]);
      if (result.error || !Array.isArray(result.data)) return null;
      return result.data;
    },
  };
}

export async function currentLessonProgress(
  lessonIds: readonly string[],
  deps?: {
    user(): Promise<{ id: string } | null>;
    rows(
      userId: string,
      lessonIds: readonly string[],
    ): Promise<unknown[] | null>;
  },
) {
  const ids = lessonIds.filter((id) => uuid(id));
  const reader = deps ?? (await progressDeps());
  const user = await reader.user();
  if (!user || !uuid(user.id)) {
    return { signedIn: false, positions: {} as Record<string, number> };
  }
  if (!ids.length) {
    return { signedIn: true, positions: {} as Record<string, number> };
  }
  const rows = await reader.rows(user.id, ids);
  if (!rows) return { signedIn: true, positions: {} as Record<string, number> };
  return { signedIn: true, positions: positionsFromRows(rows) };
}

async function withPlayback(
  detail: NonNullable<ReturnType<typeof detailFromRows>>,
  playback: (input: PlaybackInput) => Promise<LessonPlayback | null>,
): Promise<PublicLectureDetail> {
  const lessons: PublicLesson[] = [];
  for (const lesson of detail.lessons) {
    let resolved: LessonPlayback | null = null;
    try {
      resolved = await playback(lesson.playbackInput);
    } catch {
      resolved = null;
    }
    lessons.push({
      id: lesson.id,
      title: lesson.title,
      sortOrder: lesson.sortOrder,
      durationSeconds: lesson.durationSeconds,
      playback: resolved,
    });
  }
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    field: detail.field,
    teacherName: detail.teacherName,
    viewCount: detail.viewCount,
    thumbnailUrl: detail.thumbnailUrl,
    lessons,
  };
}

export async function publicLectureDetail(
  id: string,
  options?: {
    source?: PublicSource;
    playback?:
      boolean | ((input: PlaybackInput) => Promise<LessonPlayback | null>);
  },
) {
  if (!uuid(id)) return null;
  const reader = options?.source ?? (await supabaseSource());
  const lecture = await reader.lecture(id);
  if (lecture.missing) return null;
  if (lecture.error) throw new Error("강의를 불러오지 못했습니다.");
  if (lecture.row == null) return null;
  const parsed = asLecture(lecture.row);
  if (!parsed) return null;
  const lessons = await reader.lessons([parsed.id]);
  if (lessons.missing) return null;
  if (lessons.error) throw new Error("강의를 불러오지 못했습니다.");
  const names = await reader.names([parsed.teacherId]);
  const detail = detailFromRows(lecture.row, lessons.rows, names);
  if (!detail) return null;
  const playback = options?.playback;
  if (playback === false) {
    return withPlayback(detail, async () => null);
  }
  if (typeof playback === "function") return withPlayback(detail, playback);
  return withPlayback(detail, (input) => resolveLessonPlayback(input));
}
