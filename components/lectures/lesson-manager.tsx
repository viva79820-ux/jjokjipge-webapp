"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "tus-js-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SectionTitle } from "@/components/ui/section-title";
import {
  createLesson,
  deleteLecture,
  deleteLesson,
  refreshLessonVideo,
  resignLessonUpload,
  updateLessonDetails,
} from "@/lib/lectures/lesson-actions";
import {
  lectureVideoStoragePendingMessage,
  lessonTitleError,
} from "@/lib/lectures/video/limits";
import {
  canResumeLesson,
  deleteMediaWarning,
  durationLabel,
  isLessonStatus,
  lessonListKey,
  lessonStatusLabel,
  lessonStatusRefreshMs,
  mergeLessons,
  reorderLessons,
  sortPatches,
  type LessonStatus,
  type LessonView,
} from "./lesson-view";
import { openResumableUpload, startFreshUpload } from "./tus-upload";
import {
  finishMockUpload,
  prepareLessonResume,
  prepareLessonUpload,
  runMockUpload,
  type UploadAuthorization,
} from "./upload-flow";

const inputClass =
  "mt-1 w-full min-h-11 min-w-0 rounded-input border border-border bg-surface p-3 text-body outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type Session = { lessonId: string; percent: number; paused: boolean };

type PendingDelete =
  { kind: "lesson"; id: string; title: string } | { kind: "lecture" };

export function LessonManager({
  lectureId,
  canUpload,
  videoStorageReady,
  lessons: initialLessons,
}: {
  lectureId: string;
  canUpload: boolean;
  videoStorageReady: boolean;
  lessons: LessonView[];
}) {
  const router = useRouter();
  const prefix = useId();
  const lock = useRef(false);
  const generation = useRef(0);
  const controlRef = useRef({ paused: false, stopped: false });
  const suppressError = useRef(false);
  const tusRef = useRef<Upload | null>(null);
  const resumeTarget = useRef<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const incomingKey = lessonListKey(initialLessons);
  const incomingRef = useRef(initialLessons);
  const sessionRef = useRef<Session | null>(null);
  const [lessons, setLessons] = useState(initialLessons);
  const [session, setSession] = useState<Session | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [remaining, setRemaining] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"status" | "alert">("status");

  useEffect(() => {
    incomingRef.current = initialLessons;
    sessionRef.current = session;
  }, [initialLessons, session]);

  useEffect(() => {
    setLessons((current) =>
      mergeLessons(current, incomingRef.current, sessionRef.current?.lessonId),
    );
  }, [incomingKey]);

  useEffect(() => {
    return () => {
      controlRef.current.stopped = true;
      void tusRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const leave = window.confirm(
        "영상을 올리고 있어요. 페이지를 떠나면 업로드가 멈춰요.",
      );
      if (!leave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("click", onClick, true);
    };
  }, [session]);

  const processingKey = lessons
    .filter((lesson) => lesson.status === "processing")
    .map((lesson) => lesson.id)
    .join("|");

  useEffect(() => {
    const ids = processingKey ? processingKey.split("|") : [];
    if (!ids.length) return;
    let stopped = false;
    const timer = setInterval(() => {
      void Promise.all(
        ids.map(async (id) => {
          const result = await refreshLessonVideo(id);
          if (stopped || result.state !== "saved" || !result.status) return;
          if (!isLessonStatus(result.status)) return;
          const status: LessonStatus = result.status;
          setLessons((rows) =>
            rows.map((row) =>
              row.id === id
                ? {
                    ...row,
                    status,
                    durationSeconds:
                      result.durationSeconds !== undefined
                        ? (result.durationSeconds ?? null)
                        : row.durationSeconds,
                    encodeProgress:
                      typeof result.encodeProgress === "number"
                        ? result.encodeProgress
                        : row.encodeProgress,
                  }
                : row,
            ),
          );
        }),
      );
    }, lessonStatusRefreshMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [processingKey]);

  function note(text: string, tone: "status" | "alert" = "status") {
    setMessage(text);
    setMessageTone(tone);
  }

  function rememberLesson(lessonId: string, lessonTitle: string) {
    setLessons((rows) => {
      if (rows.some((row) => row.id === lessonId)) return rows;
      const sortOrder =
        rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
      return [
        ...rows,
        {
          id: lessonId,
          title: lessonTitle,
          sortOrder,
          status: "created",
          durationSeconds: null,
          encodeProgress: null,
        },
      ];
    });
  }

  function applyRefresh(
    lessonId: string,
    result: {
      state: string;
      message: string;
      status?: string;
      durationSeconds?: number | null;
      encodeProgress?: number | null;
    },
  ) {
    if (
      result.state === "saved" &&
      result.status &&
      isLessonStatus(result.status)
    ) {
      const status: LessonStatus = result.status;
      setLessons((rows) =>
        rows.map((row) =>
          row.id === lessonId
            ? {
                ...row,
                status,
                durationSeconds:
                  result.durationSeconds !== undefined
                    ? (result.durationSeconds ?? null)
                    : row.durationSeconds,
                encodeProgress:
                  typeof result.encodeProgress === "number"
                    ? result.encodeProgress
                    : row.encodeProgress,
              }
            : row,
        ),
      );
    }
    note(result.message, result.state === "saved" ? "status" : "alert");
    router.refresh();
  }

  function stopTransfer() {
    generation.current += 1;
    controlRef.current.stopped = true;
    controlRef.current.paused = false;
    suppressError.current = true;
    const current = tusRef.current;
    tusRef.current = null;
    if (current) void current.abort();
    suppressError.current = false;
    sessionRef.current = null;
    setSession(null);
  }

  async function runMockSession(lessonId: string) {
    const token = ++generation.current;
    controlRef.current = { paused: false, stopped: false };
    const next = { lessonId, percent: 0, paused: false };
    sessionRef.current = next;
    setSession(next);
    const result = await finishMockUpload({
      lessonId,
      run: () =>
        runMockUpload({
          isPaused: () => controlRef.current.paused,
          isStopped: () =>
            controlRef.current.stopped || generation.current !== token,
          onProgress: (percent) => {
            if (generation.current !== token) return;
            setSession((current) =>
              current && current.lessonId === lessonId
                ? { ...current, percent }
                : current,
            );
          },
        }),
      refresh: refreshLessonVideo,
    });
    if (generation.current !== token || result.state === "stopped") return;
    sessionRef.current = null;
    setSession(null);
    applyRefresh(lessonId, result);
  }

  function handlersFor(lessonId: string, token: number) {
    return {
      onProgress: (percent: number) => {
        if (generation.current !== token) return;
        setSession((current) =>
          current && current.lessonId === lessonId
            ? { ...current, percent }
            : current,
        );
      },
      onSuccess: () => {
        if (generation.current !== token) return;
        tusRef.current = null;
        sessionRef.current = null;
        setSession(null);
        void refreshLessonVideo(lessonId).then((result) => {
          if (generation.current !== token) return;
          applyRefresh(lessonId, result);
        });
      },
      onError: () => {
        if (generation.current !== token) return;
        tusRef.current = null;
        sessionRef.current = null;
        setSession(null);
        note(
          "영상을 올리지 못했어요. 이어서 올리기를 다시 시도해 주세요.",
          "alert",
        );
      },
      suppressed: () => suppressError.current || generation.current !== token,
    };
  }

  function startRemote(
    lessonId: string,
    chosen: File,
    authorization: UploadAuthorization,
    resume: boolean,
  ) {
    const token = ++generation.current;
    controlRef.current = { paused: false, stopped: false };
    const next = { lessonId, percent: 0, paused: false };
    sessionRef.current = next;
    setSession(next);
    const handlers = handlersFor(lessonId, token);
    const open = resume ? openResumableUpload : startFreshUpload;
    void Promise.resolve(
      open({
        file: chosen,
        authorization,
        handlers,
        UploadImpl: Upload,
      }),
    )
      .then((upload) => {
        if (generation.current !== token) {
          void upload.abort();
          return;
        }
        tusRef.current = upload;
      })
      .catch(() => {
        if (generation.current !== token) return;
        sessionRef.current = null;
        setSession(null);
        note(
          "영상을 올리지 못했어요. 이어서 올리기를 다시 시도해 주세요.",
          "alert",
        );
      });
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!videoStorageReady || lock.current || sessionRef.current) return;
    lock.current = true;
    setBusy(true);
    note("");
    try {
      if (!file) {
        note("영상 파일을 선택해 주세요.", "alert");
        return;
      }
      const chosen = file;
      const prepared = await prepareLessonUpload({
        lectureId,
        title,
        file: { name: chosen.name, type: chosen.type, size: chosen.size },
        createLesson,
      });
      if (
        prepared.state !== "saved" ||
        !prepared.upload ||
        !prepared.lessonId ||
        !prepared.kind
      ) {
        note(prepared.message, "alert");
        return;
      }
      rememberLesson(prepared.lessonId, title);
      setTitle("");
      setFile(null);
      if (prepared.kind === "mock") {
        void runMockSession(prepared.lessonId);
        return;
      }
      startRemote(prepared.lessonId, chosen, prepared.upload, false);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function resume(lessonId: string, chosen: File) {
    if (!videoStorageReady || lock.current || sessionRef.current) return;
    lock.current = true;
    setBusy(true);
    note("");
    try {
      const prepared = await prepareLessonResume({
        lessonId,
        file: { name: chosen.name, type: chosen.type, size: chosen.size },
        resign: resignLessonUpload,
      });
      if (prepared.state !== "saved" || !prepared.upload || !prepared.kind) {
        note(prepared.message, "alert");
        return;
      }
      if (prepared.kind === "mock") {
        void runMockSession(lessonId);
        return;
      }
      startRemote(lessonId, chosen, prepared.upload, true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function move(lessonId: string, direction: "up" | "down") {
    if (lock.current) return;
    const next = reorderLessons(lessons, lessonId, direction);
    if (!next) return;
    const patches = sortPatches(lessons, next);
    if (!patches.length) return;
    lock.current = true;
    setBusy(true);
    note("");
    setLessons((rows) =>
      mergeLessons(
        rows,
        rows.map((row) => {
          const patch = next.find((item) => item.id === row.id);
          return patch ? { ...row, sortOrder: patch.sortOrder } : row;
        }),
      ),
    );
    try {
      for (const patch of patches) {
        const result = await updateLessonDetails({
          lessonId: patch.id,
          sortOrder: patch.sortOrder,
        });
        if (result.state !== "saved") {
          note(result.message, "alert");
          router.refresh();
          return;
        }
      }
      router.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !editingId) return;
    const titleError = lessonTitleError(titleDraft);
    if (titleError) {
      note(titleError, "alert");
      return;
    }
    lock.current = true;
    setBusy(true);
    note("");
    try {
      const result = await updateLessonDetails({
        lessonId: editingId,
        title: titleDraft,
      });
      if (result.state !== "saved") {
        note(result.message, "alert");
        return;
      }
      setLessons((rows) =>
        rows.map((row) =>
          row.id === editingId ? { ...row, title: titleDraft } : row,
        ),
      );
      setEditingId(null);
      note(result.message);
      router.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || lock.current) return;
    lock.current = true;
    setBusy(true);
    note("");
    setRemaining([]);
    try {
      if (
        pendingDelete.kind === "lesson" &&
        session?.lessonId === pendingDelete.id
      ) {
        stopTransfer();
      }
      if (pendingDelete.kind === "lecture" && session) stopTransfer();
      const result =
        pendingDelete.kind === "lesson"
          ? await deleteLesson(pendingDelete.id)
          : await deleteLecture(lectureId);
      if (result.state === "saved") {
        if (pendingDelete.kind === "lecture") {
          router.push("/mypage/lectures");
          return;
        }
        setLessons((rows) => rows.filter((row) => row.id !== pendingDelete.id));
        setPendingDelete(null);
        note(result.message);
        router.refresh();
        return;
      }
      if (result.state === "partial") {
        setRemaining(result.remaining);
        note(result.message, "alert");
        setPendingDelete(null);
        router.refresh();
        return;
      }
      note(result.message, "alert");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function pause() {
    controlRef.current.paused = true;
    setSession((current) => (current ? { ...current, paused: true } : current));
    suppressError.current = true;
    void tusRef.current?.abort(false).finally(() => {
      suppressError.current = false;
    });
  }

  function resumeTransfer() {
    controlRef.current.paused = false;
    setSession((current) =>
      current ? { ...current, paused: false } : current,
    );
    tusRef.current?.start();
  }

  const ordered = [...lessons].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1),
  );

  return (
    <section className="mt-7 min-w-0 border-t border-border pt-7">
      <SectionTitle title="차시" />
      {message ? (
        <p
          role={messageTone}
          className={`text-body ${messageTone === "alert" ? "text-error" : "text-foreground"}`}
        >
          {message}
        </p>
      ) : null}
      {remaining.length ? (
        <div
          role="alert"
          className="mt-3 rounded-card border border-border bg-surface p-3"
        >
          <p className="text-body">
            삭제를 멈추었어요. 남은 항목을 확인해 주세요.
          </p>
          <ul className="mt-2 space-y-1">
            {remaining.map((item, index) => (
              <li
                key={`${index}-${item}`}
                className="text-caption wrap-anywhere"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!videoStorageReady ? (
        <div className="mt-3">
          <p className="text-body text-muted">
            {lectureVideoStoragePendingMessage}
          </p>
          <Button type="button" disabled className="mt-3 w-full">
            차시 올리기
          </Button>
        </div>
      ) : canUpload ? (
        <form onSubmit={onUpload} className="mt-3 min-w-0 space-y-4">
          <div>
            <label htmlFor={`${prefix}-title`} className="text-label font-bold">
              차시 제목
            </label>
            <input
              id={`${prefix}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
              maxLength={100}
              disabled={busy || !!session}
            />
          </div>
          <div>
            <p className="text-label font-bold">영상 파일</p>
            <div className="mt-1 flex min-w-0 items-center gap-3">
              <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
                파일 선택
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov"
                  className="sr-only"
                  disabled={busy || !!session}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                  }}
                />
              </label>
              <span className="min-w-0 text-caption wrap-anywhere text-muted">
                {file ? file.name : "mp4, mov · 최대 5GB"}
              </span>
            </div>
          </div>
          <Button type="submit" disabled={busy || !!session} className="w-full">
            {session ? "영상을 올리고 있어요" : "차시 올리기"}
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-body text-muted">
          강의를 만들려면 업로드 동의가 필요해요. 위의 동의에 체크하고 강의를
          저장해 주세요.
        </p>
      )}
      {ordered.length ? (
        <ul className="mt-5 space-y-3">
          {ordered.map((lesson, index) => {
            const active = session?.lessonId === lesson.id;
            const status = active ? "uploading" : lesson.status;
            return (
              <li
                key={lesson.id}
                className="min-w-0 rounded-card border border-border bg-surface p-3"
                data-lesson-status={status}
              >
                {editingId === lesson.id ? (
                  <form onSubmit={saveTitle} className="min-w-0">
                    <label
                      htmlFor={`${prefix}-rename-${lesson.id}`}
                      className="text-label font-bold"
                    >
                      차시 제목
                    </label>
                    <input
                      id={`${prefix}-rename-${lesson.id}`}
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      className={inputClass}
                      maxLength={100}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="submit" disabled={busy}>
                        제목 저장
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 text-subtitle font-bold wrap-anywhere">
                      {lesson.title}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !!session}
                      onClick={() => {
                        setEditingId(lesson.id);
                        setTitleDraft(lesson.title);
                      }}
                    >
                      제목 수정
                    </Button>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge>
                    {lessonStatusLabel(
                      status,
                      active ? null : lesson.encodeProgress,
                    )}
                  </Badge>
                  <span className="text-caption text-muted">
                    순서 {index + 1}
                  </span>
                  <span className="text-caption text-muted">
                    길이 {durationLabel(lesson.durationSeconds)}
                  </span>
                </div>
                {active && session ? (
                  <div className="mt-3">
                    <div
                      role="progressbar"
                      aria-label="업로드 진행률"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={session.percent}
                      className="h-2 overflow-hidden rounded-full bg-surface-muted"
                    >
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${session.percent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-caption text-muted">
                      {session.percent}%
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={session.paused}
                        onClick={pause}
                      >
                        일시정지
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!session.paused}
                        onClick={resumeTransfer}
                      >
                        다시 시작
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!session && canResumeLesson(lesson.status) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !videoStorageReady}
                      onClick={() => {
                        resumeTarget.current = lesson.id;
                        resumeInputRef.current?.click();
                      }}
                    >
                      이어서 올리기
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || index === 0}
                    onClick={() => void move(lesson.id, "up")}
                  >
                    위로
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || index === ordered.length - 1}
                    onClick={() => void move(lesson.id, "down")}
                  >
                    아래로
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setPendingDelete({
                        kind: "lesson",
                        id: lesson.id,
                        title: lesson.title,
                      })
                    }
                  >
                    삭제
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 text-body text-muted">등록된 차시가 없어요.</p>
      )}
      <input
        ref={resumeInputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          const lessonId = resumeTarget.current;
          event.target.value = "";
          if (!chosen || !lessonId) return;
          void resume(lessonId, chosen);
        }}
      />
      <div className="mt-5">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setPendingDelete({ kind: "lecture" })}
        >
          강의 삭제
        </Button>
      </div>
      {pendingDelete ? (
        <Modal
          title={
            pendingDelete.kind === "lecture"
              ? "강의를 삭제할까요?"
              : "차시를 삭제할까요?"
          }
          busy={busy}
          onClose={() => {
            if (!busy) setPendingDelete(null);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setPendingDelete(null)}
              >
                취소
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? "삭제하고 있어요" : "삭제"}
              </Button>
            </>
          }
        >
          <p className="text-body">
            {pendingDelete.kind === "lesson"
              ? `‘${pendingDelete.title}’ 차시를 삭제해요. `
              : "강의와 차시를 삭제해요. "}
            {deleteMediaWarning}
          </p>
        </Modal>
      ) : null}
    </section>
  );
}
