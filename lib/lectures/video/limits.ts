// 차시 파일 제한과 저장소 선택. API 키는 두지 않는다.

export const lectureVideoMaxBytes = 5 * 10 ** 9;

export const lectureVideoMimeTypes = ["video/mp4", "video/quicktime"] as const;

export type LectureVideoMimeType = (typeof lectureVideoMimeTypes)[number];

export function lectureVideoProviderName(
  value: string | undefined,
): "mock" | "bunny" {
  const name = value?.trim() || "mock";
  if (name === "mock" || name === "bunny") return name;
  throw new Error(
    "강의 영상 저장소 설정 LECTURE_VIDEO_PROVIDER를 확인해 주세요.",
  );
}

export function storageLimitFromEnv(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(
      "강의 저장 용량 설정 LECTURE_STORAGE_LIMIT_BYTES를 확인해 주세요.",
    );
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(
      "강의 저장 용량 설정 LECTURE_STORAGE_LIMIT_BYTES를 확인해 주세요.",
    );
  }
  return parsed;
}

export function lectureVideoFileError(input: {
  mimeType: unknown;
  sizeBytes: unknown;
}): string | null {
  if (
    typeof input.mimeType !== "string" ||
    !lectureVideoMimeTypes.includes(input.mimeType as LectureVideoMimeType)
  ) {
    return "영상은 mp4 또는 mov만 올릴 수 있어요.";
  }
  if (
    typeof input.sizeBytes !== "number" ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > lectureVideoMaxBytes
  ) {
    return "영상 크기는 1바이트에서 5GB까지예요.";
  }
  return null;
}

export function lessonTitleError(title: unknown): string | null {
  if (typeof title !== "string") return "차시 제목을 적어 주세요.";
  if (!/\S/.test(title) || Array.from(title).length > 100) {
    return "차시 제목은 100자 안에서 내용을 적어 주세요.";
  }
  if (/[\u0000-\u001F\u007F]/.test(title)) {
    return "차시 제목에 쓸 수 없는 문자가 있어요.";
  }
  return null;
}

export function sortOrderError(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100000
  ) {
    return "차시 순서를 확인해 주세요.";
  }
  return null;
}
