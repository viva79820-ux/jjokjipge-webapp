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
const lectureId = "44444444-4444-4444-8444-444444444444";
const otherLectureId = "55555555-5555-4555-8555-555555555555";
const lessonA = "33333333-3333-4333-8333-333333333331";
const lessonB = "33333333-3333-4333-8333-333333333332";
const lessonC = "33333333-3333-4333-8333-333333333333";
const thumbnailPath = `lectures/${teacherId}/44444444-4444-4444-8444-444444444444.jpg`;

const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");

function lecture(overrides = {}) {
  return {
    id: lectureId,
    teacher_id: teacherId,
    title: "테스트 사주 강의",
    description: "무료 공개 소개",
    thumbnail_path: null,
    field: "saju",
    is_published: true,
    view_count: 4,
    created_at: "2026-11-26T01:00:00.000Z",
    ...overrides,
  };
}

function lesson(overrides = {}) {
  return {
    id: lessonA,
    lecture_id: lectureId,
    title: "1강 기초",
    sort_order: 0,
    duration_seconds: 120,
    provider: "mock",
    provider_video_id: "video-1",
    status: "ready",
    ...overrides,
  };
}

function recorder(result = { data: [], error: null }) {
  const calls = [];
  const from = (table) => {
    const state = {
      table,
      columns: "",
      filters: [],
      orders: [],
      single: false,
    };
    calls.push(state);
    const api = {
      select(columns) {
        state.columns = columns;
        return api;
      },
      eq(column, value) {
        state.filters.push(["eq", column, value]);
        return api;
      },
      in(column, value) {
        state.filters.push(["in", column, [...value]]);
        return api;
      },
      order(column, options) {
        state.orders.push([column, options.ascending]);
        return api;
      },
      maybeSingle() {
        state.single = true;
        return Promise.resolve(result);
      },
      then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return api;
  };
  return { from, calls };
}

test("공개 강의 조회는 공개 행과 ready 차시만 요청한다", async () => {
  const {
    readPublishedLectures,
    readReadyLessons,
    readLectureById,
    readTeacherNames,
  } = await import("../lib/lectures/public.ts");
  const listed = recorder();
  await readPublishedLectures(listed.from, "");
  assert.equal(listed.calls[0].table, "lectures");
  assert.match(listed.calls[0].columns, /view_count/);
  assert.deepEqual(listed.calls[0].filters, [["eq", "is_published", true]]);
  assert.deepEqual(listed.calls[0].orders, [
    ["created_at", false],
    ["id", false],
  ]);

  const fielded = recorder();
  await readPublishedLectures(fielded.from, "tarot");
  assert.deepEqual(fielded.calls[0].filters, [
    ["eq", "is_published", true],
    ["eq", "field", "tarot"],
  ]);

  const lessons = recorder();
  await readReadyLessons(lessons.from, [lectureId]);
  assert.equal(lessons.calls[0].table, "lecture_lessons");
  assert.match(lessons.calls[0].columns, /admin_hidden/);
  assert.deepEqual(lessons.calls[0].filters, [
    ["eq", "status", "ready"],
    ["eq", "admin_hidden", false],
    ["in", "lecture_id", [lectureId]],
  ]);
  assert.deepEqual(lessons.calls[0].orders, [
    ["sort_order", true],
    ["id", true],
  ]);

  const one = recorder({ data: null, error: null });
  await readLectureById(one.from, lectureId);
  assert.equal(one.calls[0].single, true);
  assert.deepEqual(one.calls[0].filters, [
    ["eq", "id", lectureId],
    ["eq", "is_published", true],
  ]);

  const names = recorder();
  const emptyNames = await readTeacherNames(names.from, []);
  assert.equal(names.calls.length, 0);
  assert.equal(emptyNames.size, 0);
  const named = recorder({
    data: [
      { id: teacherId, name: " 선생님 A ", email: "hidden@example.invalid" },
    ],
    error: null,
  });
  const map = await readTeacherNames(named.from, [teacherId]);
  assert.equal(named.calls[0].table, "profiles");
  assert.equal(named.calls[0].columns, "id,name");
  assert.equal(map.get(teacherId), "선생님 A");
});

test("공개 목록은 ready 차시가 있는 공개 강의만 남긴다", async () => {
  const { catalogFromRows, listPublicLectures, lectureReadState } =
    await import("../lib/lectures/public.ts");
  assert.equal(
    lectureReadState({ data: null, error: { code: "PGRST205" } }).missing,
    true,
  );
  assert.equal(
    lectureReadState({ data: null, error: { code: "42P01" } }).missing,
    true,
  );
  assert.equal(
    lectureReadState({ data: null, error: { code: "42501" } }).error,
    true,
  );

  const rows = catalogFromRows(
    [
      lecture({ view_count: 4 }),
      lecture({
        id: otherLectureId,
        title: "테스트 비공개 강의",
        is_published: false,
        view_count: 9,
        created_at: "2026-11-26T03:00:00.000Z",
      }),
      lecture({
        id: "66666666-6666-4666-8666-666666666666",
        title: "테스트 타로 강의",
        field: "tarot",
        created_at: "2026-11-26T02:00:00.000Z",
        view_count: 1,
      }),
      lecture({
        id: "77777777-7777-4777-8777-777777777777",
        title: "테스트 차시없음",
        created_at: "2026-11-26T04:00:00.000Z",
        view_count: 8,
      }),
    ],
    [
      lesson({ sort_order: 2, id: lessonC, title: "3강 정리" }),
      lesson({ sort_order: 0, id: lessonA, title: "1강 기초" }),
      lesson({
        id: lessonB,
        title: "숨은 변환중",
        sort_order: 1,
        status: "processing",
      }),
      lesson({
        id: "33333333-3333-4333-8333-333333333336",
        title: "관리자 숨김 차시",
        sort_order: 3,
        status: "ready",
        admin_hidden: true,
      }),
      lesson({
        id: "33333333-3333-4333-8333-333333333334",
        lecture_id: "66666666-6666-4666-8666-666666666666",
        title: "타로 1강",
        status: "ready",
      }),
      lesson({
        id: "33333333-3333-4333-8333-333333333335",
        lecture_id: "77777777-7777-4777-8777-777777777777",
        title: "준비중",
        status: "uploading",
      }),
    ],
    new Map([[teacherId, "선생님 A"]]),
    "saju",
  );
  assert.deepEqual(
    rows.map((row) => [
      row.title,
      row.lessonCount,
      row.viewCount,
      row.teacherName,
    ]),
    [["테스트 사주 강의", 2, 4, "선생님 A"]],
  );

  let lessonCalls = 0;
  const listed = await listPublicLectures("saju", {
    async lectures() {
      return {
        rows: [
          lecture(),
          lecture({ id: otherLectureId, is_published: false, title: "숨김" }),
        ],
        missing: false,
        error: false,
      };
    },
    async lessons() {
      lessonCalls += 1;
      return { rows: [lesson()], missing: false, error: false };
    },
    async names() {
      return new Map([[teacherId, "선생님 A"]]);
    },
  });
  assert.equal(lessonCalls, 1);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].viewCount, 4);
  assert.equal(listed[0].lessonCount, 1);

  const hidden = await listPublicLectures("", {
    async lectures() {
      return { rows: null, missing: true, error: true };
    },
    async lessons() {
      throw new Error("차시를 조회하면 안 됩니다.");
    },
    async names() {
      throw new Error("이름을 조회하면 안 됩니다.");
    },
    async lecture() {
      throw new Error("상세를 조회하면 안 됩니다.");
    },
  });
  assert.deepEqual(hidden, []);
  await assert.rejects(
    () =>
      listPublicLectures("", {
        async lectures() {
          return { rows: null, missing: false, error: true };
        },
        async lessons() {
          return { rows: [], missing: false, error: false };
        },
        async names() {
          return new Map();
        },
        async lecture() {
          return { row: null, missing: false, error: false };
        },
      }),
    /강의를 불러오지 못했습니다/,
  );
});

test("강의 상세는 비공개를 빼고 ready 차시를 순서대로 둔다", async () => {
  const { publicLectureDetail, detailFromRows } =
    await import("../lib/lectures/public.ts");
  const detail = detailFromRows(
    lecture(),
    [
      lesson({ id: lessonC, sort_order: 2, title: "3강 정리" }),
      lesson({ id: lessonA, sort_order: 0, title: "1강 기초" }),
      lesson({
        id: lessonB,
        sort_order: 1,
        title: "2강 실전",
        status: "processing",
      }),
    ],
    new Map([[teacherId, "선생님 A"]]),
  );
  assert.deepEqual(
    detail.lessons.map((row) => row.title),
    ["1강 기초", "3강 정리"],
  );
  assert.equal(
    detailFromRows(lecture({ is_published: false }), [lesson()], new Map()),
    null,
  );
  assert.equal(detailFromRows(lecture(), [], new Map()), null);

  const playbackCalls = [];
  const loaded = await publicLectureDetail(lectureId, {
    source: {
      async lecture() {
        return {
          row: lecture({ view_count: 7 }),
          missing: false,
          error: false,
        };
      },
      async lessons() {
        return {
          rows: [
            lesson({ id: lessonB, sort_order: 1, title: "2강 실전" }),
            lesson({ id: lessonA, sort_order: 0, title: "1강 기초" }),
            lesson({
              id: lessonC,
              sort_order: 3,
              title: "숨은 변환중",
              status: "processing",
            }),
            lesson({
              id: "33333333-3333-4333-8333-333333333336",
              sort_order: 4,
              title: "관리자 숨김 차시",
              status: "ready",
              admin_hidden: true,
            }),
          ],
          missing: false,
          error: false,
        };
      },
      async names() {
        return new Map([[teacherId, "선생님 A"]]);
      },
      async lectures() {
        return { rows: [], missing: false, error: false };
      },
    },
    async playback(input) {
      playbackCalls.push(input);
      return { kind: "mock" };
    },
  });
  assert.equal(loaded.viewCount, 7);
  assert.equal(loaded.teacherName, "선생님 A");
  assert.deepEqual(
    loaded.lessons.map((row) => row.title),
    ["1강 기초", "2강 실전"],
  );
  assert.deepEqual(
    loaded.lessons.map((row) => row.playback),
    [{ kind: "mock" }, { kind: "mock" }],
  );
  assert.deepEqual(
    playbackCalls.map((input) => input.status),
    ["ready", "ready"],
  );
  assert.equal(
    await publicLectureDetail("not-a-uuid", {
      source: {
        async lecture() {
          throw new Error("조회하면 안 됩니다.");
        },
        async lessons() {
          throw new Error("조회하면 안 됩니다.");
        },
        async names() {
          throw new Error("조회하면 안 됩니다.");
        },
        async lectures() {
          return { rows: [], missing: false, error: false };
        },
      },
    }),
    null,
  );
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fixture.invalid";
  try {
    const withImage = detailFromRows(
      lecture({ thumbnail_path: thumbnailPath }),
      [lesson()],
      null,
    );
    assert.equal(
      withImage.thumbnailUrl,
      `http://fixture.invalid/storage/v1/object/public/public-images/${thumbnailPath}`,
    );
    assert.equal(withImage.teacherName, "선생님");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  }
});

test("모형 재생은 자리표시, Bunny는 ready 임베드만 돌려준다", async () => {
  const { resolveLessonPlayback } = await import("../lib/lectures/playback.ts");
  const calls = [];
  const store = {
    async getPlayback(videoId) {
      calls.push(videoId);
      return { embedUrl: `mock://embed/${videoId}` };
    },
  };
  assert.equal(
    await resolveLessonPlayback(
      { status: "processing", provider: "bunny", providerVideoId: "video-1" },
      store,
      "bunny",
    ),
    null,
  );
  assert.equal(
    await resolveLessonPlayback(
      {
        status: "ready",
        provider: "bunny",
        providerVideoId: "video-hidden",
        adminHidden: true,
      },
      store,
      "bunny",
    ),
    null,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(
    await resolveLessonPlayback(
      { status: "ready", provider: "bunny", providerVideoId: "video-1" },
      store,
      "mock",
    ),
    { kind: "mock" },
  );
  assert.deepEqual(calls, ["video-1"]);
  assert.equal(
    await resolveLessonPlayback(
      { status: "ready", provider: "bunny", providerVideoId: "video-1" },
      store,
      "bunny",
    ),
    null,
  );
  const embed = "https://player.mediadelivery.net/embed/library/video-2";
  assert.deepEqual(
    await resolveLessonPlayback(
      { status: "ready", provider: "bunny", providerVideoId: "video-2" },
      {
        async getPlayback() {
          return { embedUrl: embed };
        },
      },
      "bunny",
    ),
    { kind: "embed", url: embed },
  );
  assert.deepEqual(
    await resolveLessonPlayback(
      { status: "ready", provider: "mock", providerVideoId: "video-3" },
      {
        async getPlayback() {
          throw new Error("키가 없습니다.");
        },
      },
      "bunny",
    ),
    { kind: "mock" },
  );
  assert.equal(
    await resolveLessonPlayback(
      { status: "ready", provider: "bunny", providerVideoId: "video-4" },
      {
        async getPlayback() {
          throw new Error("키가 없습니다.");
        },
      },
      "bunny",
    ),
    null,
  );
});

test("이어서 보기 위치와 localStorage 실패", async () => {
  const {
    browserStorage,
    guestProgressKey,
    progressSaveIntervalMs,
    readGuestProgress,
    resumePosition,
    resumeTailSeconds,
    writeGuestProgress,
  } = await import("../lib/lectures/resume.ts");
  const { currentLessonProgress } = await import("../lib/lectures/public.ts");
  assert.equal(progressSaveIntervalMs, 5000);
  assert.equal(resumeTailSeconds, 10);
  assert.equal(resumePosition(null, 100), 0);
  assert.equal(resumePosition(0, 100), 0);
  assert.equal(resumePosition(-3, 100), 0);
  assert.equal(resumePosition(50, 60), 0);
  assert.equal(resumePosition(49, 60), 49);
  assert.equal(resumePosition(90, 100), 0);
  assert.equal(resumePosition(89, 100), 89);
  assert.equal(resumePosition(50, null), 50);
  assert.equal(resumePosition(10.9, null), 10);
  assert.equal(browserStorage(), null);

  const lessonId = lessonA;
  assert.equal(guestProgressKey(lessonId), `lecture-progress:${lessonId}`);
  const denied = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readGuestProgress(denied, lessonId), null);
  assert.equal(writeGuestProgress(denied, lessonId, 12), false);
  assert.equal(readGuestProgress(null, lessonId), null);
  assert.equal(writeGuestProgress(null, lessonId, 12), false);
  let writes = 0;
  const memory = new Map();
  const storage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      writes += 1;
      memory.set(key, value);
    },
  };
  assert.equal(writeGuestProgress(storage, "nope", 4), false);
  assert.equal(writes, 0);
  assert.equal(writeGuestProgress(storage, lessonId, 12.8), true);
  assert.equal(memory.get(guestProgressKey(lessonId)), "12");
  assert.equal(readGuestProgress(storage, lessonId), 12);

  let rowCalls = 0;
  const guest = await currentLessonProgress([lessonId], {
    async user() {
      return null;
    },
    async rows() {
      rowCalls += 1;
      return [];
    },
  });
  assert.equal(guest.signedIn, false);
  assert.equal(rowCalls, 0);
  const member = await currentLessonProgress([lessonId, "bad"], {
    async user() {
      return { id: teacherId };
    },
    async rows(userId, ids) {
      assert.equal(userId, teacherId);
      assert.deepEqual(ids, [lessonId]);
      return [
        { lesson_id: lessonId, position_seconds: 15 },
        { lesson_id: lessonB, position_seconds: -1 },
      ];
    },
  });
  assert.equal(member.signedIn, true);
  assert.deepEqual(member.positions, { [lessonId]: 15 });
});

test("재생 화면 속성과 조회수 갱신 코드가 없다", () => {
  const player = read("../components/lectures/player.tsx");
  const pub = read("../lib/lectures/public.ts");
  const progress = read("../lib/lectures/progress-action.ts");
  assert.match(
    player,
    /allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"/,
  );
  assert.match(player, /allowFullScreen/);
  assert.match(player, /영상 미리보기\(모형\)/);
  assert.match(player, /https:\/\/bunny\.net\/docs\/stream\/playback-api/);
  assert.doesNotMatch(pub, /\.update\(|\.upsert\(/);
  assert.match(progress, /lecture_progress/);
  assert.doesNotMatch(progress, /view_count/);
});
