import "server-only";

import { createBunnyLectureVideoStore } from "./bunny";
import { lectureVideoProviderName } from "./limits";
import { mockLectureVideoStore } from "./mock";

export function getLectureVideoStore() {
  if (
    lectureVideoProviderName(process.env.LECTURE_VIDEO_PROVIDER) === "bunny"
  ) {
    return createBunnyLectureVideoStore();
  }
  return mockLectureVideoStore;
}
