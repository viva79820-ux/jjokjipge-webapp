import "server-only";

import { createBunnyLectureVideoStore } from "./bunny";
import { lectureVideoProviderName } from "./limits";
import { mockLectureVideoStore } from "./mock";

// 업로드와 용량 조회에 쓰는 값이다. 웹훅 읽기 키는 이 판단에 넣지 않는다.
export const lectureBunnyRequiredEnv = [
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_ACCOUNT_API_KEY",
] as const;

export const lectureVideoStorageNotReady = "영상 저장소 준비 안 됨";

type LectureVideoEnv = Record<string, string | undefined>;

function envValue(env: LectureVideoEnv, name: string) {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function libraryIdReady(value: string) {
  return /^[A-Za-z0-9-]+$/.test(value);
}

// 운영에서 Bunny가 연결되지 않으면 준비 안 됨. 개발·미리보기는 모형으로 준비된 상태다.
export function lectureVideoStorageJudgment(
  env: LectureVideoEnv = process.env,
) {
  if (env.VERCEL_ENV !== "production") return null;
  if (envValue(env, "LECTURE_VIDEO_PROVIDER") !== "bunny") {
    return lectureVideoStorageNotReady;
  }
  if (
    !lectureBunnyRequiredEnv.every((name) => envValue(env, name) !== "") ||
    !libraryIdReady(envValue(env, "BUNNY_STREAM_LIBRARY_ID"))
  ) {
    return lectureVideoStorageNotReady;
  }
  return null;
}

export function getLectureVideoStore() {
  if (
    lectureVideoProviderName(process.env.LECTURE_VIDEO_PROVIDER) === "bunny"
  ) {
    return createBunnyLectureVideoStore();
  }
  return mockLectureVideoStore;
}
