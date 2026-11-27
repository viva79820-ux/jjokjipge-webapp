import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const emptyServerOnly = pathToFileURL(
  path.join(root, "node_modules/next/dist/compiled/server-only/empty.js"),
).href;

function lectureParent(parentURL) {
  if (!parentURL) return false;
  const file = fileURLToPath(parentURL).replaceAll("\\", "/");
  return file.includes("/lib/lectures/") || file.includes("/app/api/lectures/");
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only" && lectureParent(context.parentURL)) {
      return { url: emptyServerOnly, shortCircuit: true };
    }
    if (specifier.startsWith("@/") && lectureParent(context.parentURL)) {
      const rel = specifier.slice(2);
      const withExt = path.extname(rel) ? rel : `${rel}.ts`;
      return {
        url: pathToFileURL(path.join(root, withExt)).href,
        shortCircuit: true,
      };
    }
    if (
      lectureParent(context.parentURL) &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !path.extname(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const teacherId = "11111111-1111-4111-8111-111111111111";
const lectureId = "22222222-2222-4222-8222-222222222222";
const lessonId = "33333333-3333-4333-8333-333333333333";
const thumbnailPath = `lectures/${teacherId}/44444444-4444-4444-8444-444444444444.jpg`;

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");

function lessonRow(overrides = {}) {
  return {
    id: lessonId,
    lectureId,
    teacherId,
    title: "1강",
    sortOrder: 0,
    provider: "mock",
    providerVideoId: "video-1",
    status: "created",
    lastEventAt: null,
    ...overrides,
  };
}

function harness(overrides = {}) {
  const calls = [];
  const deps = {
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
      calls.push("lecture");
      return { id: lectureId, teacherId, thumbnailPath: null };
    },
    async lesson() {
      calls.push("lesson");
      return lessonRow();
    },
    async lessons() {
      calls.push("lessons");
      return [];
    },
    async insertLesson(row) {
      calls.push(["insert", row]);
      return { id: lessonId };
    },
    async updateServerFields(id, userId, patch) {
      calls.push(["server", id, userId, patch]);
      return true;
    },
    async updateTitleOrder(id, userId, patch) {
      calls.push(["title", id, userId, patch]);
      return true;
    },
    async deleteLesson() {
      calls.push("delete-lesson");
      return true;
    },
    async deleteLessons() {
      calls.push("delete-lessons");
      return true;
    },
    async deleteLecture() {
      calls.push("delete-lecture");
      return true;
    },
    async removeThumbnail() {
      calls.push("thumbnail");
      return true;
    },
    store: {
      async createVideo(input) {
        calls.push(["create", input]);
        return { videoId: "video-1" };
      },
      async issueUpload(input) {
        calls.push(["sign", input]);
        return {
          videoId: input.videoId,
          endpoint: "https://video.bunnycdn.com/tusupload",
          signature: "signed",
          expireUnix: 1700000000,
          libraryId: "lib-1",
          metadata: { filetype: "video/mp4", title: "" },
          apiKey: "should-not-leak",
        };
      },
      async getStatus(videoId) {
        calls.push(["status", videoId]);
        return {
          status: "processing",
          encodeProgress: 40,
          durationSeconds: 12,
          storageBytes: 99,
        };
      },
      async deleteVideo(videoId) {
        calls.push(["delete-video", videoId]);
      },
      async getPlayback() {
        return null;
      },
      async getStorageUsage() {
        return { usedBytes: 0 };
      },
    },
    provider: "mock",
    ...overrides,
  };
  return { calls, deps };
}

test("모형은 네트워크 없이 created에서 ready와 failed로 바뀐다", async () => {
  const { createMockLectureVideoStore } =
    await import("../lib/lectures/video/mock.ts");
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    throw new Error("fetch");
  };
  try {
    const handle = createMockLectureVideoStore();
    const created = await handle.store.createVideo({ title: "1강" });
    assert.equal(handle.status(created.videoId), "created");
    assert.equal(await handle.store.getPlayback(created.videoId), null);
    assert.equal(handle.advance(created.videoId), "uploading");
    assert.equal(handle.advance(created.videoId), "processing");
    assert.equal(handle.advance(created.videoId), "ready");
    assert.equal(handle.advance(created.videoId), "ready");
    const playback = await handle.store.getPlayback(created.videoId);
    const status = await handle.store.getStatus(created.videoId);
    assert.equal(status.status, "ready");
    assert.equal(status.durationSeconds, 90);
    assert.equal(status.storageBytes, 2048);
    assert.match(playback.embedUrl, /^mock:\/\/embed\//);
    const failed = await handle.store.createVideo({ title: "실패" });
    assert.equal(handle.fail(failed.videoId), "failed");
    assert.equal(await handle.store.getPlayback(failed.videoId), null);
    await handle.store.deleteVideo("missing");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("Bunny 요청 형태와 업로드 서명에는 API 키가 없다", async () => {
  const { createBunnyLectureVideoStore, bunnyUploadSignature } =
    await import("../lib/lectures/video/bunny.ts");
  const { lessonStatusFromBunnyGetVideo, lessonStatusFromBunnyWebhook } =
    await import("../lib/lectures/video/types.ts");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") {
      return Response.json({ guid: "video-1" });
    }
    if (init.method === "DELETE") {
      return new Response(null, { status: 404 });
    }
    if (String(url).includes("api.bunny.net")) {
      return Response.json({
        StorageUsage: 80,
        Name: "do-not-log",
        ApiKey: "do-not-log",
      });
    }
    const status = String(url).endsWith("/videos/ready-1") ? 4 : 3;
    return Response.json({
      status,
      encodeProgress: status === 4 ? 100 : 20,
      length: 15,
      storageSize: 50,
      title: "do-not-log",
    });
  };
  const store = createBunnyLectureVideoStore({
    fetch: fetchImpl,
    env: {
      BUNNY_STREAM_LIBRARY_ID: "lib-1",
      BUNNY_STREAM_API_KEY: "stream-key",
      BUNNY_ACCOUNT_API_KEY: "account-key",
    },
    now: () => 1_700_000_000_000,
  });
  const created = await store.createVideo({ title: "1강" });
  assert.equal(created.videoId, "video-1");
  assert.equal(calls[0].url, "https://video.bunnycdn.com/library/lib-1/videos");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.AccessKey, "stream-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { title: "1강" });

  const beforeSign = calls.length;
  const issued = await store.issueUpload({ videoId: "video-1" });
  assert.equal(calls.length, beforeSign);
  const expireUnix = 1700000000 + 24 * 60 * 60;
  assert.equal(
    issued.signature,
    bunnyUploadSignature({
      libraryId: "lib-1",
      apiKey: "stream-key",
      expireUnix,
      videoId: "video-1",
    }),
  );
  assert.equal(
    issued.signature,
    createHash("sha256")
      .update(`lib-1stream-key${expireUnix}video-1`)
      .digest("hex"),
  );
  assert.equal(issued.endpoint, "https://video.bunnycdn.com/tusupload");
  assert.equal(issued.expireUnix, expireUnix);
  assert.equal(issued.libraryId, "lib-1");
  assert.equal(JSON.stringify(issued).includes("stream-key"), false);

  const processing = await store.getStatus("video-1");
  assert.equal(processing.status, "processing");
  assert.equal(lessonStatusFromBunnyGetVideo(4), "ready");
  assert.equal(lessonStatusFromBunnyGetVideo(1), "processing");
  assert.equal(await store.getPlayback("video-1"), null);
  const ready = await store.getStatus("ready-1");
  assert.equal(ready.status, "ready");
  assert.equal(ready.durationSeconds, 15);
  assert.equal(ready.storageBytes, 50);
  assert.deepEqual(await store.getPlayback("ready-1"), {
    embedUrl: "https://player.mediadelivery.net/embed/lib-1/ready-1",
  });
  assert.equal(lessonStatusFromBunnyWebhook(3), "ready");
  assert.equal(lessonStatusFromBunnyWebhook(4), "processing");
  assert.equal(lessonStatusFromBunnyWebhook(5), "failed");
  assert.equal(lessonStatusFromBunnyWebhook(8), "failed");

  await store.deleteVideo("video-1");
  assert.equal(calls.at(-1).init.method, "DELETE");
  assert.equal(
    calls.at(-1).url,
    "https://video.bunnycdn.com/library/lib-1/videos/video-1",
  );
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args);
  try {
    const usage = await store.getStorageUsage();
    assert.equal(usage.usedBytes, 80);
  } finally {
    console.log = original;
  }
  assert.equal(logs.length, 0);
  const usageCall = calls.at(-1);
  assert.equal(usageCall.url, "https://api.bunny.net/videolibrary/lib-1");
  assert.equal(usageCall.init.headers.AccessKey, "account-key");
  assert.equal(JSON.stringify(usageCall.init).includes("do-not-log"), false);
});

test("Bunny 환경변수가 없으면 호출 전에 오류를 던진다", async () => {
  const { createBunnyLectureVideoStore } =
    await import("../lib/lectures/video/bunny.ts");
  let called = false;
  const store = createBunnyLectureVideoStore({
    fetch: async () => {
      called = true;
      return Response.json({});
    },
    env: { BUNNY_STREAM_LIBRARY_ID: "lib-1" },
  });
  await assert.rejects(
    () => store.createVideo({ title: "1강" }),
    (error) => {
      assert.match(error.message, /BUNNY_STREAM_API_KEY/);
      assert.equal(error.message.includes("stream-key"), false);
      return true;
    },
  );
  await assert.rejects(() => store.getStorageUsage(), /BUNNY_ACCOUNT_API_KEY/);
  assert.equal(called, false);
});

test("웹훅 서명 성공·실패·중복·순서를 가른다", async () => {
  const { receiveBunnyWebhook } = await import("../lib/lectures/lesson-ops.ts");
  const secret = "readonly-test";
  const lesson = {
    id: lessonId,
    lastEventAt: null,
    status: "created",
    providerStatus: null,
  };
  const events = new Set();
  let updates = 0;
  const db = {
    async findEvent(eventId) {
      return events.has(eventId);
    },
    async insertEvent(event) {
      if (events.has(event.eventId)) return "duplicate";
      events.add(event.eventId);
      return "ok";
    },
    async findLesson() {
      return lesson;
    },
    async updateLessonIfCurrent(id, patch, timestamp) {
      updates += 1;
      if (
        lesson.lastEventAt &&
        Date.parse(timestamp) < Date.parse(lesson.lastEventAt)
      ) {
        return "stale";
      }
      lesson.status = patch.status;
      lesson.providerStatus = patch.providerStatus;
      lesson.lastEventAt = timestamp;
      assert.equal(id, lessonId);
      return "updated";
    },
  };
  const send = async (body, signature = null) => {
    const rawBody = JSON.stringify(body);
    const signed =
      signature ??
      createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return receiveBunnyWebhook({
      rawBody,
      signature: signed,
      version: "v1",
      algorithm: "hmac-sha256",
      secret,
      libraryId: "133",
      openDb: async () => db,
    });
  };
  let opened = false;
  const rejected = await receiveBunnyWebhook({
    rawBody: "{}",
    signature: "00".repeat(32),
    version: "v1",
    algorithm: "hmac-sha256",
    secret,
    libraryId: "133",
    openDb: async () => {
      opened = true;
      throw new Error("db");
    },
  });
  assert.equal(rejected.status, 401);
  assert.equal(opened, false);

  const playing = await send({
    VideoLibraryId: 133,
    VideoGuid: "video-1",
    Status: 4,
    EventId: "event-play",
    Timestamp: "2026-10-01T12:00:00.0000000Z",
  });
  assert.equal(playing.status, 200);
  assert.equal(lesson.status, "processing");
  assert.notEqual(lesson.status, "ready");

  const ready = await send({
    VideoLibraryId: 133,
    VideoGuid: "video-1",
    Status: 3,
    EventId: "event-ready",
    Timestamp: "2026-10-01T12:30:15.1234567Z",
  });
  assert.equal(ready.status, 200);
  assert.equal(lesson.status, "ready");
  assert.equal(lesson.providerStatus, "3");
  const updatesAfterReady = updates;

  const stale = await send({
    VideoLibraryId: 133,
    VideoGuid: "video-1",
    Status: 5,
    EventId: "event-old",
    Timestamp: "2026-10-01T12:10:00.0000000Z",
  });
  assert.equal(stale.status, 200);
  assert.equal(lesson.status, "ready");
  assert.equal(updates, updatesAfterReady);

  const duplicate = await send({
    VideoLibraryId: 133,
    VideoGuid: "video-1",
    Status: 8,
    EventId: "event-ready",
    Timestamp: "2026-10-01T12:40:00.0000000Z",
  });
  assert.equal(duplicate.status, 200);
  assert.equal(lesson.status, "ready");
  assert.equal(updates, updatesAfterReady);

  const failed = await send({
    VideoLibraryId: 133,
    VideoGuid: "video-1",
    Status: 8,
    EventId: "event-failed",
    Timestamp: "2026-10-01T12:50:00.0000000Z",
  });
  assert.equal(failed.status, 200);
  assert.equal(lesson.status, "failed");
  assert.equal(lesson.providerStatus, "8");
});

test("권한 없는 사용자는 차시를 만들거나 지우지 못한다", async () => {
  const {
    createLessonWith,
    refreshLessonWith,
    deleteLessonWith,
    deleteLectureWith,
  } = await import("../lib/lectures/lesson-ops.ts");
  const input = {
    lectureId,
    title: "1강",
    mimeType: "video/mp4",
    sizeBytes: 10,
  };
  const loggedOut = harness({
    async actor() {
      return null;
    },
  });
  const denied = await createLessonWith(input, loggedOut.deps);
  assert.equal(denied.state, "rejected");
  assert.equal(
    loggedOut.calls.some((call) => Array.isArray(call) && call[0] === "create"),
    false,
  );

  const stranger = harness({
    async teacher() {
      return false;
    },
  });
  const notTeacher = await createLessonWith(input, stranger.deps);
  assert.equal(notTeacher.state, "rejected");
  assert.equal(stranger.calls.includes("lecture"), false);

  const otherLecture = harness({
    async lecture() {
      return null;
    },
  });
  const missing = await deleteLectureWith(lectureId, otherLecture.deps);
  assert.equal(missing.state, "rejected");
  assert.equal(
    otherLecture.calls.some(
      (call) => Array.isArray(call) && call[0] === "delete-video",
    ),
    false,
  );

  const otherLesson = harness({
    async lesson() {
      return null;
    },
  });
  const refresh = await refreshLessonWith(lessonId, otherLesson.deps);
  assert.equal(refresh.state, "rejected");
  assert.equal(
    otherLesson.calls.some(
      (call) => Array.isArray(call) && call[0] === "status",
    ),
    false,
  );
  const removed = await deleteLessonWith(lessonId, otherLesson.deps);
  assert.equal(removed.state, "rejected");
  assert.equal(
    otherLesson.calls.some(
      (call) => Array.isArray(call) && call[0] === "delete-video",
    ),
    false,
  );
});

test("강의 삭제는 영상, 썸네일, 차시, 강의 순이고 중간 실패에서 멈춘다", async () => {
  const { deleteLectureWith, deleteLessonWith } =
    await import("../lib/lectures/lesson-ops.ts");
  const lessons = [
    lessonRow({ id: "l1", providerVideoId: "v1", sortOrder: 0 }),
    lessonRow({ id: "l2", providerVideoId: "v2", sortOrder: 1 }),
    lessonRow({ id: "l3", providerVideoId: "v3", sortOrder: 2 }),
  ];
  const timeline = [];
  const stopped = harness({
    async lecture() {
      return { id: lectureId, teacherId, thumbnailPath };
    },
    async lessons() {
      return lessons;
    },
    store: {
      async deleteVideo(videoId) {
        timeline.push(`video:${videoId}`);
        if (videoId === "v2") throw new Error("fail");
      },
      async createVideo() {
        return { videoId: "x" };
      },
      async issueUpload() {
        throw new Error("unused");
      },
      async getStatus() {
        throw new Error("unused");
      },
      async getPlayback() {
        return null;
      },
      async getStorageUsage() {
        return { usedBytes: 0 };
      },
    },
    async removeThumbnail() {
      timeline.push("thumbnail");
      return true;
    },
    async deleteLessons() {
      timeline.push("lessons");
      return true;
    },
    async deleteLecture() {
      timeline.push("lecture");
      return true;
    },
  });
  const partial = await deleteLectureWith(lectureId, stopped.deps);
  assert.equal(partial.state, "partial");
  assert.deepEqual(timeline, ["video:v1", "video:v2"]);
  assert.deepEqual(partial.remaining, [
    "영상 v2",
    "영상 v3",
    `썸네일 ${thumbnailPath}`,
    "차시 3건",
    "강의",
  ]);

  const afterVideos = [];
  const thumbnailFailed = harness({
    async lecture() {
      return { id: lectureId, teacherId, thumbnailPath };
    },
    async lessons() {
      return lessons;
    },
    store: {
      async deleteVideo(videoId) {
        afterVideos.push(`video:${videoId}`);
      },
      async createVideo() {
        return { videoId: "x" };
      },
      async issueUpload() {
        throw new Error("unused");
      },
      async getStatus() {
        throw new Error("unused");
      },
      async getPlayback() {
        return null;
      },
      async getStorageUsage() {
        return { usedBytes: 0 };
      },
    },
    async removeThumbnail() {
      afterVideos.push("thumbnail");
      return false;
    },
    async deleteLessons() {
      afterVideos.push("lessons");
      return true;
    },
    async deleteLecture() {
      afterVideos.push("lecture");
      return true;
    },
  });
  const thumb = await deleteLectureWith(lectureId, thumbnailFailed.deps);
  assert.equal(thumb.state, "partial");
  assert.deepEqual(afterVideos, [
    "video:v1",
    "video:v2",
    "video:v3",
    "thumbnail",
  ]);
  assert.deepEqual(thumb.remaining, [
    `썸네일 ${thumbnailPath}`,
    "차시 3건",
    "강의",
  ]);

  const rowsFailed = harness({
    async lecture() {
      return { id: lectureId, teacherId, thumbnailPath: null };
    },
    async lessons() {
      return [lessonRow({ providerVideoId: "v1" })];
    },
    async deleteLessons() {
      return false;
    },
  });
  const rows = await deleteLectureWith(lectureId, rowsFailed.deps);
  assert.equal(rows.state, "partial");
  assert.deepEqual(rows.remaining, ["차시 1건", "강의"]);
  assert.equal(rowsFailed.calls.includes("delete-lecture"), false);

  const kept = harness();
  kept.deps.store.deleteVideo = async () => {
    throw new Error("fail");
  };
  const lesson = await deleteLessonWith(lessonId, kept.deps);
  assert.equal(lesson.state, "unknown");
  assert.equal(kept.calls.includes("delete-lesson"), false);
});

test("상태와 용량은 서버 기록으로만 바꾸고 제목은 세션 수정이다", async () => {
  const {
    refreshLessonWith,
    updateLessonWith,
    createLessonWith,
    resignLessonWith,
  } = await import("../lib/lectures/lesson-ops.ts");
  const { lectureVideoMaxBytes, lectureVideoProviderName } =
    await import("../lib/lectures/video/limits.ts");
  assert.equal(lectureVideoMaxBytes, 5 * 10 ** 9);
  assert.equal(lectureVideoProviderName(undefined), "mock");
  assert.equal(lectureVideoProviderName("bunny"), "bunny");

  const refreshed = harness();
  const status = await refreshLessonWith(lessonId, refreshed.deps);
  assert.equal(status.state, "saved");
  assert.equal(status.status, "processing");
  assert.equal(status.storageBytes, 99);
  assert.equal(
    refreshed.calls.some((call) => Array.isArray(call) && call[0] === "server"),
    true,
  );
  assert.equal(
    refreshed.calls.some((call) => Array.isArray(call) && call[0] === "title"),
    false,
  );

  const renamed = harness();
  const title = await updateLessonWith(
    { lessonId, title: "고친 제목", sortOrder: 2 },
    renamed.deps,
  );
  assert.equal(title.state, "saved");
  assert.deepEqual(
    renamed.calls.find((call) => Array.isArray(call) && call[0] === "title")[3],
    { title: "고친 제목", sortOrder: 2 },
  );
  assert.equal(
    renamed.calls.some((call) => Array.isArray(call) && call[0] === "server"),
    false,
  );

  const tooBig = harness();
  const rejected = await createLessonWith(
    {
      lectureId,
      title: "1강",
      mimeType: "video/webm",
      sizeBytes: lectureVideoMaxBytes + 1,
    },
    tooBig.deps,
  );
  assert.equal(rejected.state, "rejected");
  assert.equal(
    tooBig.calls.some((call) => Array.isArray(call) && call[0] === "create"),
    false,
  );

  const created = harness();
  const saved = await createLessonWith(
    {
      lectureId,
      title: "1강",
      mimeType: "video/quicktime",
      sizeBytes: 10,
    },
    created.deps,
  );
  assert.equal(saved.state, "saved");
  assert.equal(saved.upload.metadata.filetype, "video/quicktime");
  assert.equal(saved.upload.signature, "signed");
  assert.equal(JSON.stringify(saved.upload).includes("should-not-leak"), false);
  const inserted = created.calls.find(
    (call) => Array.isArray(call) && call[0] === "insert",
  );
  assert.equal(inserted[1].provider, "mock");
  assert.equal(inserted[1].providerVideoId, "video-1");
  assert.equal(inserted[1].status, "created");

  const resigned = harness();
  const again = await resignLessonWith(
    { lessonId, mimeType: "video/mp4", sizeBytes: 10 },
    resigned.deps,
  );
  assert.equal(again.state, "saved");
  assert.equal(again.upload.videoId, "video-1");
  const readyLesson = harness({
    async lesson() {
      return lessonRow({ status: "ready" });
    },
  });
  const blocked = await resignLessonWith(
    { lessonId, mimeType: "video/mp4", sizeBytes: 10 },
    readyLesson.deps,
  );
  assert.equal(blocked.state, "rejected");

  const source = read("../lib/lectures/lesson-db.ts");
  const serverFn = source
    .split("async updateServerFields")[1]
    .split("async updateTitleOrder")[0];
  const titleFn = source
    .split("async updateTitleOrder")[1]
    .split("async deleteLesson")[0];
  assert.match(serverFn, /createAdminClient\(\)/);
  assert.match(serverFn, /status: patch\.status/);
  assert.match(serverFn, /storage_bytes: patch\.storageBytes/);
  assert.doesNotMatch(serverFn, /createClient\(/);
  assert.match(titleFn, /createClient\(/);
  assert.match(titleFn, /changes\.title = patch\.title/);
  assert.match(titleFn, /changes\.sort_order = patch\.sortOrder/);
  assert.doesNotMatch(titleFn, /createAdminClient/);
});

test("용량 점검 권한과 80퍼센트 기록", async () => {
  const { cronAuthorized, runStorageCheck, shouldAlertStorage } =
    await import("../lib/lectures/lesson-ops.ts");
  const { GET } = await import("../app/api/lectures/storage-check/route.ts");
  const { POST } = await import("../app/api/lectures/bunny-webhook/route.ts");
  assert.equal(cronAuthorized(null, undefined), false);
  assert.equal(
    cronAuthorized("Bearer unit-test-cron-reject", undefined),
    false,
  );
  const missing = await GET(
    new Request("http://localhost/api/lectures/storage-check"),
  );
  const wrong = await GET(
    new Request("http://localhost/api/lectures/storage-check", {
      headers: { authorization: "Bearer unit-test-cron-reject" },
    }),
  );
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  const webhook = await POST(
    new Request("http://localhost/api/lectures/bunny-webhook", {
      method: "POST",
      headers: { "x-bunnystream-signature": "00".repeat(32) },
      body: "{}",
    }),
  );
  assert.equal(webhook.status, 401);

  assert.equal(shouldAlertStorage(80, 100, null), true);
  assert.equal(shouldAlertStorage(79, 100, null), false);
  assert.equal(shouldAlertStorage(80, 100, "2026-11-01T00:00:00.000Z"), false);
  assert.equal(shouldAlertStorage(80, null, null), false);

  const row = { usedBytes: 0, limitBytes: null, alerted80At: null };
  const first = await runStorageCheck({
    store: {
      async getStorageUsage() {
        return { usedBytes: 80 };
      },
    },
    limitFromEnv: 100,
    now: "2026-11-27T00:00:00.000Z",
    async read() {
      return { ...row };
    },
    async write(next) {
      Object.assign(row, next);
    },
  });
  assert.equal(first.alerted, true);
  assert.equal(row.usedBytes, 80);
  assert.equal(row.limitBytes, 100);
  assert.equal(row.alerted80At, "2026-11-27T00:00:00.000Z");
  const second = await runStorageCheck({
    store: {
      async getStorageUsage() {
        return { usedBytes: 90 };
      },
    },
    limitFromEnv: 100,
    now: "2026-11-28T00:00:00.000Z",
    async read() {
      return { ...row };
    },
    async write(next) {
      Object.assign(row, next);
    },
  });
  assert.equal(second.alerted, false);
  assert.equal(row.alerted80At, "2026-11-27T00:00:00.000Z");
  assert.equal(row.usedBytes, 90);

  const vercel = read("../vercel.json");
  assert.match(vercel, /"path": "\/api\/lectures\/storage-check"/);
  assert.match(vercel, /"schedule": "0 18 \* \* \*"/);
});
