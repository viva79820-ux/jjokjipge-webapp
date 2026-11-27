import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const emptyServerOnly = pathToFileURL(
  path.join(root, "node_modules/next/dist/compiled/server-only/empty.js"),
).href;
const lectureId = "22222222-2222-4222-8222-222222222222";
const lessonId = "33333333-3333-4333-8333-333333333333";
const teacherId = "11111111-1111-4111-8111-111111111111";
const maxBytes = 5 * 10 ** 9;

function watched(parentURL) {
  if (!parentURL) return false;
  const file = fileURLToPath(parentURL).replaceAll("\\", "/");
  return (
    file.includes("/lib/lectures/") ||
    file.includes("/components/lectures/") ||
    file.includes("/app/(site)/mypage/lectures/")
  );
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only" && watched(context.parentURL)) {
      return { url: emptyServerOnly, shortCircuit: true };
    }
    if (specifier.startsWith("@/") && watched(context.parentURL)) {
      const rel = specifier.slice(2);
      const withExt = path.extname(rel) ? rel : `${rel}.ts`;
      return {
        url: pathToFileURL(path.join(root, withExt)).href,
        shortCircuit: true,
      };
    }
    if (
      watched(context.parentURL) &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const read = (file) =>
  readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n");

const mp4 = { name: "lesson.mp4", type: "video/mp4", size: 1200 };
const remoteUpload = {
  videoId: "video-1",
  endpoint: "https://video.bunnycdn.com/tusupload",
  signature: "signed",
  expireUnix: 1700000000,
  libraryId: "lib-1",
  metadata: { filetype: "video/mp4", title: "1강" },
};
const mockUpload = {
  ...remoteUpload,
  endpoint: "mock://upload",
  signature: "mock",
  libraryId: "mock",
};

test("차시 화면은 상태 문구, 순서, 용량을 화면에서 먼저 가른다", async () => {
  const view = await import("../components/lectures/lesson-view.ts");
  const flow = await import("../components/lectures/upload-flow.ts");
  assert.equal(view.lessonStatusRefreshMs, 10_000);
  assert.equal(
    view.deleteMediaWarning,
    "영상 파일도 함께 지워지고 되돌릴 수 없어요.",
  );
  assert.equal(view.lessonStatusLabel("uploading", null), "업로드 중");
  assert.equal(view.lessonStatusLabel("processing", null), "변환 중");
  assert.equal(view.lessonStatusLabel("processing", 40), "변환 중 40%");
  assert.equal(view.lessonStatusLabel("processing", 40.4), "변환 중 40%");
  assert.equal(view.lessonStatusLabel("ready", null), "공개 가능");
  assert.equal(view.lessonStatusLabel("failed", null), "실패");
  assert.equal(view.lessonStatusLabel("created", null), "업로드 전");
  assert.equal(view.durationLabel(null), "없음");
  assert.equal(view.durationLabel(90), "1분 30초");
  assert.deepEqual(
    view.summarizeLessons(["uploading", "processing", "failed", "ready"]),
    { total: 4, uploading: 1, processing: 1, failed: 1 },
  );
  assert.equal(view.lessonFileProblem(mp4), null);
  assert.equal(
    view.lessonFileProblem({ ...mp4, size: maxBytes + 1 }),
    "영상 크기는 1바이트에서 5GB까지예요.",
  );
  assert.equal(
    view.lessonFileProblem({ name: "clip.webm", type: "video/webm", size: 10 }),
    "영상은 mp4 또는 mov만 올릴 수 있어요.",
  );
  assert.equal(
    view.lessonMimeType({ name: "clip.mov", type: "" }),
    "video/quicktime",
  );
  const row = view.parseLessonRow({
    id: lessonId,
    lecture_id: lectureId,
    title: "1강",
    sort_order: 1,
    status: "ready",
    duration_seconds: 90,
  });
  assert.equal(row.encodeProgress, null);
  assert.equal(row.durationSeconds, 90);
  assert.throws(() =>
    view.parseLessonRow({ ...row, status: "published", lecture_id: lectureId }),
  );

  const first = { id: "a", sortOrder: 0 };
  const second = { id: "b", sortOrder: 5 };
  assert.equal(view.reorderLessons([first, second], "a", "up"), null);
  const moved = view.reorderLessons([first, second], "b", "up");
  assert.deepEqual(view.sortPatches([first, second], moved), [
    { id: "b", sortOrder: 0 },
    { id: "a", sortOrder: 1 },
  ]);

  const calls = [];
  const tooBig = await flow.prepareLessonUpload({
    lectureId,
    title: "1강",
    file: { ...mp4, size: maxBytes + 1 },
    createLesson: async () => {
      calls.push("create");
      return { state: "saved", message: "no" };
    },
  });
  assert.equal(tooBig.state, "rejected");
  assert.equal(calls.length, 0);
  const blank = await flow.prepareLessonUpload({
    lectureId,
    title: "   ",
    file: mp4,
    createLesson: async () => {
      calls.push("create");
      return { state: "saved", message: "no" };
    },
  });
  assert.equal(blank.state, "rejected");
  assert.equal(calls.length, 0);

  const created = await flow.prepareLessonUpload({
    lectureId,
    title: "1강",
    file: { name: "clip.mov", type: "", size: maxBytes },
    createLesson: async (body) => {
      calls.push(body);
      return {
        state: "saved",
        message: "차시를 만들었어요.",
        lessonId,
        upload: mockUpload,
      };
    },
  });
  assert.equal(created.kind, "mock");
  assert.equal(calls[0].mimeType, "video/quicktime");
  assert.equal(calls[0].sizeBytes, maxBytes);
});

test("모형 업로드는 네트워크 없이 마치고 새로고침하고, 이어 올리기는 재서명 뒤에 찾는다", async () => {
  const flow = await import("../components/lectures/upload-flow.ts");
  const tus = await import("../components/lectures/tus-upload.ts");
  const { bunnyUploadHeader } = await import("../lib/lectures/video/types.ts");
  const headers = tus.tusHeaders(remoteUpload);
  assert.equal(headers[bunnyUploadHeader.signature], "signed");
  assert.equal(headers[bunnyUploadHeader.expire], "1700000000");
  assert.equal(headers[bunnyUploadHeader.libraryId], "lib-1");
  assert.equal(headers[bunnyUploadHeader.videoId], "video-1");
  const file = { name: "lesson.mp4", size: 1200, type: "video/mp4" };
  assert.notEqual(
    await tus.lectureUploadFingerprint("video-a")(file),
    await tus.lectureUploadFingerprint("video-b")(file),
  );

  const network = [];
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    network.push("fetch");
    throw new Error("fetch");
  };
  try {
    let paused = false;
    let waits = 0;
    const seen = [];
    const outcome = await flow.runMockUpload({
      onProgress: (percent) => seen.push(percent),
      isPaused: () => paused,
      isStopped: () => false,
      wait: async () => {
        waits += 1;
        if (waits === 2) paused = true;
        if (waits === 3) paused = false;
      },
    });
    assert.equal(outcome, "done");
    assert.deepEqual(seen, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    assert.equal(network.length, 0);
  } finally {
    globalThis.fetch = original;
  }

  const stoppedCalls = [];
  const stopped = await flow.finishMockUpload({
    lessonId,
    run: async () => "stopped",
    refresh: async () => {
      stoppedCalls.push("refresh");
      return { state: "saved", message: "ok" };
    },
  });
  assert.equal(stopped.state, "stopped");
  assert.equal(stoppedCalls.length, 0);
  const finished = await flow.finishMockUpload({
    lessonId,
    run: async () => "done",
    refresh: async (id) => {
      stoppedCalls.push(id);
      return { state: "saved", message: "영상을 올렸어요.", encodeProgress: 0 };
    },
  });
  assert.equal(finished.state, "saved");
  assert.deepEqual(stoppedCalls, [lessonId]);

  const order = [];
  const remote = await flow.prepareLessonResume({
    lessonId,
    file: mp4,
    resign: async (body) => {
      order.push(["resign", body.mimeType, body.sizeBytes]);
      return {
        state: "saved",
        message: "업로드 서명을 다시 만들었어요.",
        lessonId,
        upload: remoteUpload,
      };
    },
  });
  assert.equal(remote.kind, "remote");
  assert.deepEqual(order, [["resign", "video/mp4", 1200]]);

  class FakeUpload {
    constructor(_file, options) {
      order.push(["upload", options.headers.VideoId]);
      this.options = options;
    }
    async findPreviousUploads() {
      order.push("findPreviousUploads");
      return [
        {
          uploadUrl: "https://video.bunnycdn.com/tusupload/abc",
          urlStorageKey: "key",
          size: 1200,
          metadata: {},
          creationTime: "2026-11-27T00:00:00.000Z",
          parallelUploadUrls: null,
        },
      ];
    }
    resumeFromPreviousUpload(previous) {
      order.push(["resume", previous.uploadUrl]);
    }
    start() {
      order.push("start");
    }
  }
  await tus.openResumableUpload({
    file: new Blob(["1234"]),
    authorization: remoteUpload,
    handlers: {
      onProgress() {},
      onSuccess() {},
      onError() {},
      suppressed: () => false,
    },
    UploadImpl: FakeUpload,
  });
  assert.deepEqual(order.slice(1), [
    ["upload", "video-1"],
    "findPreviousUploads",
    ["resume", "https://video.bunnycdn.com/tusupload/abc"],
    "start",
  ]);
  const freshOrder = [];
  class FreshUpload extends FakeUpload {
    constructor(file, options) {
      super(file, options);
      freshOrder.push("construct");
    }
    async findPreviousUploads() {
      freshOrder.push("findPreviousUploads");
      return [];
    }
    start() {
      freshOrder.push("start");
    }
  }
  tus.startFreshUpload({
    file: new Blob(["1234"]),
    authorization: remoteUpload,
    handlers: {
      onProgress() {},
      onSuccess() {},
      onError() {},
      suppressed: () => false,
    },
    UploadImpl: FreshUpload,
  });
  assert.deepEqual(freshOrder, ["construct", "start"]);
});

test("화면은 차시 액션, 이탈 경고, 10초 새로고침을 연결한다", async () => {
  const source = read("components/lectures/lesson-manager.tsx");
  const list = read("app/(site)/mypage/lectures/page.tsx");
  const detail = read("app/(site)/mypage/lectures/[id]/page.tsx");
  for (const name of [
    "createLesson",
    "resignLessonUpload",
    "refreshLessonVideo",
    "deleteLesson",
    "deleteLecture",
    "updateLessonDetails",
    "beforeunload",
    "lessonStatusRefreshMs",
    "deleteMediaWarning",
    "openResumableUpload",
    "runMockUpload",
    "prepareLessonUpload",
  ]) {
    assert.equal(source.includes(name), true, name);
  }
  const resignAt = source.indexOf("resign: resignLessonUpload");
  const resumeAt = source.indexOf(
    "startRemote(lessonId, chosen, prepared.upload, true)",
  );
  assert.equal(resignAt > 0 && resumeAt > resignAt, true);
  assert.equal(list.includes("summarizeLessons"), true);
  assert.equal(list.includes("listLessonRecords"), true);
  assert.equal(detail.includes("LessonManager"), true);
  assert.equal(
    read("app/(site)/mypage/page.tsx").includes("LessonManager"),
    false,
  );

  const { refreshLessonWith } = await import("../lib/lectures/lesson-ops.ts");
  const result = await refreshLessonWith(lessonId, {
    async actor() {
      return { id: teacherId };
    },
    async teacher() {
      return true;
    },
    async consent() {
      return true;
    },
    async lecture() {
      return null;
    },
    async lesson() {
      return {
        id: lessonId,
        lectureId,
        teacherId,
        title: "1강",
        sortOrder: 0,
        provider: "mock",
        providerVideoId: "video-1",
        status: "processing",
        lastEventAt: null,
      };
    },
    async lessons() {
      return [];
    },
    async insertLesson() {
      return { id: lessonId };
    },
    async updateServerFields() {
      return true;
    },
    async updateTitleOrder() {
      return true;
    },
    async deleteLesson() {
      return true;
    },
    async deleteLessons() {
      return true;
    },
    async deleteLecture() {
      return true;
    },
    async removeThumbnail() {
      return true;
    },
    store: {
      async createVideo() {
        return { videoId: "video-1" };
      },
      async issueUpload() {
        throw new Error("unused");
      },
      async getStatus() {
        return {
          status: "processing",
          encodeProgress: 40,
          durationSeconds: null,
          storageBytes: null,
        };
      },
      async deleteVideo() {},
      async getPlayback() {
        return null;
      },
      async getStorageUsage() {
        return { usedBytes: 0 };
      },
    },
    provider: "mock",
  });
  assert.equal(result.state, "saved");
  assert.equal(result.status, "processing");
  assert.equal(result.encodeProgress, 40);
});

test("영상 저장소가 준비되지 않으면 차시 올리기 버튼만 막는다", () => {
  const manager = read("components/lectures/lesson-manager.tsx");
  const page = read("app/(site)/mypage/lectures/[id]/page.tsx");
  const editor = read("components/lectures/editor.tsx");
  const pending = manager
    .split("!videoStorageReady ?")[1]
    .split(": canUpload ?")[0];
  assert.equal(pending.includes("lectureVideoStoragePendingMessage"), true);
  assert.equal(pending.includes("disabled"), true);
  assert.equal(pending.includes("차시 올리기"), true);
  assert.equal(page.includes("lectureVideoStorageJudgment() === null"), true);
  assert.equal(page.includes("<LectureEditor"), true);
  assert.equal(editor.includes("saveLecture"), true);
  assert.equal(editor.includes("lectureVideoStorageJudgment"), false);
  assert.equal(manager.includes("이어서 올리기"), true);
  assert.equal(manager.includes("disabled={busy || !videoStorageReady}"), true);
});
