export const progressSaveIntervalMs = 5000;
export const resumeTailSeconds = 10;
export const maxProgressSeconds = 60 * 60 * 24 * 10;

export type LessonPlayback = { kind: "mock" } | { kind: "embed"; url: string };

export type GuestStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const lessonIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function guestProgressKey(lessonId: string) {
  return `lecture-progress:${lessonId}`;
}

export function normalizeProgressSeconds(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : null;
  if (numeric == null || !Number.isFinite(numeric)) return null;
  const seconds = Math.floor(numeric);
  if (!Number.isSafeInteger(seconds)) return null;
  if (seconds < 0 || seconds > maxProgressSeconds) return null;
  return seconds;
}

// 남은 시간이 10초 이하면 처음부터, 길이를 모르면 저장 위치로 이어 본다.
export function resumePosition(
  savedSeconds: number | null,
  durationSeconds: number | null,
): number {
  const saved = normalizeProgressSeconds(savedSeconds);
  if (saved == null || saved <= 0) return 0;
  if (
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds - saved <= resumeTailSeconds
  ) {
    return 0;
  }
  return saved;
}

export function readGuestProgress(
  storage: GuestStorage | null,
  lessonId: string,
): number | null {
  try {
    if (!storage || !lessonIdPattern.test(lessonId)) return null;
    return normalizeProgressSeconds(
      storage.getItem(guestProgressKey(lessonId)),
    );
  } catch {
    return null;
  }
}

export function writeGuestProgress(
  storage: GuestStorage | null,
  lessonId: string,
  seconds: number,
): boolean {
  try {
    if (!storage || !lessonIdPattern.test(lessonId)) return false;
    const position = normalizeProgressSeconds(seconds);
    if (position == null) return false;
    storage.setItem(guestProgressKey(lessonId), String(position));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): GuestStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
