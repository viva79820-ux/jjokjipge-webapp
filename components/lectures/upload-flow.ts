import { lessonTitleError } from "@/lib/lectures/video/limits";
import { lessonFileProblem, lessonMimeType } from "./lesson-view";

export type UploadAuthorization = {
  videoId: string;
  endpoint: string;
  signature: string;
  expireUnix: number;
  libraryId: string;
  metadata: { filetype: string; title: string };
};

export type FlowResult = {
  state: "saved" | "rejected" | "unknown" | "partial" | "stopped";
  message: string;
  lessonId?: string;
  upload?: UploadAuthorization;
  status?: string;
  encodeProgress?: number | null;
  durationSeconds?: number | null;
  remaining?: string[];
};

export type LessonFile = { name: string; type: string; size: number };

export function isMockUpload(endpoint: string) {
  return endpoint.startsWith("mock:");
}

export async function prepareLessonUpload(input: {
  lectureId: string;
  title: string;
  file: LessonFile;
  createLesson: (body: {
    lectureId: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<FlowResult>;
}): Promise<FlowResult & { kind?: "mock" | "remote" }> {
  const titleError = lessonTitleError(input.title);
  if (titleError) return { state: "rejected", message: titleError };
  const fileError = lessonFileProblem(input.file);
  if (fileError) return { state: "rejected", message: fileError };
  const mimeType = lessonMimeType(input.file);
  if (!mimeType) {
    return {
      state: "rejected",
      message: "영상은 mp4 또는 mov만 올릴 수 있어요.",
    };
  }
  const created = await input.createLesson({
    lectureId: input.lectureId,
    title: input.title,
    mimeType,
    sizeBytes: input.file.size,
  });
  if (created.state !== "saved" || !created.upload || !created.lessonId) {
    return created;
  }
  return {
    ...created,
    kind: isMockUpload(created.upload.endpoint) ? "mock" : "remote",
  };
}

export async function prepareLessonResume(input: {
  lessonId: string;
  file: LessonFile;
  resign: (body: {
    lessonId: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<FlowResult>;
}): Promise<FlowResult & { kind?: "mock" | "remote" }> {
  const fileError = lessonFileProblem(input.file);
  if (fileError) return { state: "rejected", message: fileError };
  const mimeType = lessonMimeType(input.file);
  if (!mimeType) {
    return {
      state: "rejected",
      message: "영상은 mp4 또는 mov만 올릴 수 있어요.",
    };
  }
  const signed = await input.resign({
    lessonId: input.lessonId,
    mimeType,
    sizeBytes: input.file.size,
  });
  if (signed.state !== "saved" || !signed.upload) return signed;
  return {
    ...signed,
    kind: isMockUpload(signed.upload.endpoint) ? "mock" : "remote",
  };
}

// 모형은 네트워크 요청 없이 진행률만 올리고, 끝나면 호출한 쪽이 새로고침한다.
export async function runMockUpload(input: {
  onProgress: (percent: number) => void;
  isPaused: () => boolean;
  isStopped: () => boolean;
  wait?: (ms: number) => Promise<void>;
  stepMs?: number;
}): Promise<"done" | "stopped"> {
  const wait =
    input.wait ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stepMs = input.stepMs ?? 200;
  let percent = 0;
  while (percent < 100) {
    if (input.isStopped()) return "stopped";
    await wait(stepMs);
    if (input.isStopped()) return "stopped";
    if (input.isPaused()) continue;
    percent = Math.min(100, percent + 10);
    input.onProgress(percent);
  }
  return "done";
}

export async function finishMockUpload(input: {
  lessonId: string;
  run: () => Promise<"done" | "stopped">;
  refresh: (lessonId: string) => Promise<FlowResult>;
}) {
  const outcome = await input.run();
  if (outcome === "stopped") {
    return { state: "stopped" as const, message: "" };
  }
  return input.refresh(input.lessonId);
}
