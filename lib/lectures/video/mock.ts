import { randomUUID } from "node:crypto";
import type { LectureVideoStore, LessonVideoStatus } from "./types";

// 네트워크 없이 메모리에서만 상태를 바꾼다.
// advance: created → uploading → processing → ready. fail은 failed로 둔다.

type MockVideo = {
  title: string;
  status: LessonVideoStatus;
  encodeProgress: number | null;
  durationSeconds: number | null;
  storageBytes: number | null;
};

const flow = ["created", "uploading", "processing", "ready"] as const;

export type MockLectureVideoHandle = {
  store: LectureVideoStore;
  advance(videoId: string): LessonVideoStatus;
  fail(videoId: string): LessonVideoStatus;
  setStorageUsage(bytes: number): void;
  status(videoId: string): LessonVideoStatus;
};

export function createMockLectureVideoStore(): MockLectureVideoHandle {
  const videos = new Map<string, MockVideo>();
  let storageOverride: number | null = null;

  function read(videoId: string) {
    const video = videos.get(videoId);
    if (!video) throw new Error("영상을 찾지 못했어요.");
    return video;
  }

  const store: LectureVideoStore = {
    async createVideo({ title }) {
      if (typeof title !== "string" || !/\S/.test(title)) {
        throw new Error("영상 제목이 필요해요.");
      }
      const videoId = randomUUID();
      videos.set(videoId, {
        title,
        status: "created",
        encodeProgress: 0,
        durationSeconds: null,
        storageBytes: null,
      });
      return { videoId };
    },
    async issueUpload({ videoId }) {
      const video = read(videoId);
      return {
        videoId,
        endpoint: "mock://upload",
        signature: "mock",
        expireUnix: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        libraryId: "mock",
        metadata: {
          filetype: "video/mp4",
          title: video.title,
        },
      };
    },
    async getStatus(videoId) {
      const video = read(videoId);
      return {
        status: video.status,
        encodeProgress: video.encodeProgress,
        durationSeconds: video.durationSeconds,
        storageBytes: video.storageBytes,
      };
    },
    async deleteVideo(videoId) {
      videos.delete(videoId);
    },
    async getPlayback(videoId) {
      const video = videos.get(videoId);
      if (!video || video.status !== "ready") return null;
      return { embedUrl: `mock://embed/${videoId}` };
    },
    async getStorageUsage() {
      if (storageOverride != null) return { usedBytes: storageOverride };
      let usedBytes = 0;
      for (const video of videos.values()) {
        usedBytes += video.storageBytes ?? 0;
      }
      return { usedBytes };
    },
  };

  return {
    store,
    advance(videoId) {
      const video = read(videoId);
      if (video.status === "failed") return video.status;
      const index = flow.indexOf(video.status as (typeof flow)[number]);
      const next = flow[Math.min(Math.max(index, 0) + 1, flow.length - 1)];
      video.status = next;
      if (next === "uploading") video.encodeProgress = 0;
      if (next === "processing") {
        video.encodeProgress = 40;
        video.durationSeconds = null;
        video.storageBytes = null;
      }
      if (next === "ready") {
        video.encodeProgress = 100;
        video.durationSeconds = 90;
        video.storageBytes = 2048;
      }
      return video.status;
    },
    fail(videoId) {
      const video = read(videoId);
      video.status = "failed";
      video.encodeProgress = 0;
      video.durationSeconds = null;
      video.storageBytes = null;
      return video.status;
    },
    setStorageUsage(bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new Error("저장소 사용량을 확인해 주세요.");
      }
      storageOverride = bytes;
    },
    status(videoId) {
      return read(videoId).status;
    },
  };
}

const shared = createMockLectureVideoStore();

export const mockLectureVideoStore = shared.store;
