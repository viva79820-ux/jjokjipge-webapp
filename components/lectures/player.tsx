"use client";

import { useEffect, useRef, useState } from "react";
import { saveLectureProgress } from "@/lib/lectures/progress-action";
import {
  browserStorage,
  progressSaveIntervalMs,
  readGuestProgress,
  resumePosition,
  writeGuestProgress,
  type LessonPlayback,
} from "@/lib/lectures/resume";

// Bunny Stream player.js
// https://bunny.net/docs/stream/playback-api
const playerScriptUrl =
  "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";

type BunnyPlayer = {
  on(event: "ready", callback: () => void): void;
  on(
    event: "timeupdate",
    callback: (data: { seconds?: number; duration?: number }) => void,
  ): void;
  on(event: "pause", callback: () => void): void;
  off(event: string): void;
  getDuration(callback: (seconds: number) => void): void;
  setCurrentTime(seconds: number): void;
};

declare global {
  interface Window {
    playerjs?: {
      Player: new (iframe: HTMLIFrameElement) => BunnyPlayer;
    };
  }
}

export type LecturePlayerLesson = {
  id: string;
  title: string;
  durationSeconds: number | null;
  playback: LessonPlayback | null;
};

let playerScript: Promise<void> | null = null;

function loadBunnyPlayerScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.playerjs?.Player) return Promise.resolve();
  if (!playerScript) {
    playerScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = playerScriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        playerScript = null;
        reject(new Error("player.js"));
      };
      document.head.append(script);
    });
  }
  return playerScript;
}

function savedSeconds(
  signedIn: boolean,
  lessonId: string,
  positions: Record<string, number>,
) {
  if (signedIn) return positions[lessonId] ?? null;
  return readGuestProgress(browserStorage(), lessonId);
}

export function LecturePlayer({
  lessons,
  signedIn,
  positions,
}: {
  lessons: LecturePlayerLesson[];
  signedIn: boolean;
  positions: Record<string, number>;
}) {
  const [currentId, setCurrentId] = useState(lessons[0]?.id ?? "");
  const current =
    lessons.find((lesson) => lesson.id === currentId) ?? lessons[0];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const positionsRef = useRef(positions);

  useEffect(() => {
    positionsRef.current = positions;
    if (!current || current.playback?.kind !== "embed") return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const lessonId = current.id;
    const durationSeconds = current.durationSeconds;
    let stopped = false;
    let timer = 0;
    let player: BunnyPlayer | null = null;
    let latest: number | null = null;
    let lastSaved: number | null = null;

    const persist = (seconds: number | null) => {
      if (seconds == null) return;
      const position = Math.floor(seconds);
      if (
        !Number.isInteger(position) ||
        position < 0 ||
        position === lastSaved
      ) {
        return;
      }
      lastSaved = position;
      if (signedIn) {
        void saveLectureProgress(lessonId, position).catch(() => undefined);
        return;
      }
      writeGuestProgress(browserStorage(), lessonId, position);
    };
    const onLeave = () => persist(latest);
    const onHide = () => {
      if (document.visibilityState === "hidden") persist(latest);
    };
    const connect = () => {
      if (stopped || !window.playerjs?.Player || !iframeRef.current) return;
      player = new window.playerjs.Player(iframeRef.current);
      player.on("ready", () => {
        const seek = (duration: number | null) => {
          if (stopped) return;
          const start = resumePosition(
            savedSeconds(signedIn, lessonId, positionsRef.current),
            duration,
          );
          if (start > 0) player?.setCurrentTime(start);
        };
        try {
          player?.getDuration((duration) => {
            seek(
              typeof duration === "number" && duration > 0
                ? duration
                : durationSeconds,
            );
          });
        } catch {
          seek(durationSeconds);
        }
      });
      player.on("timeupdate", (data) => {
        if (typeof data?.seconds === "number") latest = data.seconds;
      });
      player.on("pause", () => persist(latest));
      timer = window.setInterval(() => persist(latest), progressSaveIntervalMs);
      window.addEventListener("pagehide", onLeave);
      document.addEventListener("visibilitychange", onHide);
    };

    loadBunnyPlayerScript()
      .then(connect)
      .catch(() => undefined);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      persist(latest);
      stopped = true;
      player?.off("ready");
      player?.off("timeupdate");
      player?.off("pause");
    };
  }, [current, positions, signedIn]);

  if (!current) return null;
  const playback = current.playback;

  return (
    <div className="space-y-3">
      <p className="text-subtitle font-bold wrap-anywhere">{current.title}</p>
      {playback?.kind === "embed" ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-card border border-border bg-brand-soft">
          <iframe
            ref={iframeRef}
            key={current.id}
            src={playback.url}
            title={current.title}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : playback?.kind === "mock" ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-card border border-border bg-brand-soft px-4">
          <p className="text-center text-body font-bold text-brand-deep">
            영상 미리보기(모형)
          </p>
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-card border border-border bg-brand-soft px-4">
          <p className="text-center text-body text-muted">
            이 차시는 아직 재생할 수 없어요.
          </p>
        </div>
      )}
      <div className="space-y-3">
        <h2 className="text-title font-bold">차시</h2>
        <ul className="space-y-2">
          {lessons.map((lesson) => {
            const selected = lesson.id === current.id;
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => setCurrentId(lesson.id)}
                  className={`flex min-h-11 w-full cursor-pointer items-center rounded-card border px-3 text-left text-body wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    selected
                      ? "border-brand bg-brand-soft font-bold text-brand-deep"
                      : "border-border bg-surface font-semibold text-foreground"
                  }`}
                >
                  {lesson.title}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
