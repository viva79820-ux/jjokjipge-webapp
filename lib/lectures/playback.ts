import "server-only";

import type { LessonPlayback } from "./resume";
import { getLectureVideoStore } from "./video/index";
import { lectureVideoProviderName } from "./video/limits";

type PlaybackStore = {
  getPlayback(videoId: string): Promise<{ embedUrl: string } | null>;
};

const embedPrefix = "https://player.mediadelivery.net/embed/";

export async function resolveLessonPlayback(
  input: {
    status: string;
    provider: string;
    providerVideoId: string | null;
  },
  store: PlaybackStore = getLectureVideoStore(),
  providerName: "mock" | "bunny" = lectureVideoProviderName(
    process.env.LECTURE_VIDEO_PROVIDER,
  ),
): Promise<LessonPlayback | null> {
  if (input.status !== "ready" || !input.providerVideoId) return null;
  let playback: { embedUrl: string } | null = null;
  try {
    playback = await store.getPlayback(input.providerVideoId);
  } catch {
    playback = null;
  }
  if (providerName === "mock" || input.provider === "mock") {
    return { kind: "mock" };
  }
  if (playback?.embedUrl.startsWith(embedPrefix)) {
    return { kind: "embed", url: playback.embedUrl };
  }
  return null;
}
