import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as rules from "../lib/lectures/rules.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const emptyServerOnly = pathToFileURL(
  path.join(root, "node_modules/next/dist/compiled/server-only/empty.js"),
).href;

function watched(parentURL) {
  if (!parentURL) return false;
  const file = fileURLToPath(parentURL).replaceAll("\\", "/");
  return file.includes("/components/lectures/");
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

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (file) =>
  readFileSync(new URL(file, import.meta.url), "utf8").replaceAll("\r\n", "\n");

function loadModule(file, adapters) {
  const source = read(file);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}

const lectureId = "44444444-4444-4444-8444-444444444444";
const lessonId = "55555555-5555-4555-8555-555555555551";

function redirect(path) {
  const error = new Error(`REDIRECT ${path}`);
  throw error;
}

function harness({
  admin = { userId: "admin", email: "admin@example.invalid" },
  result = { data: { id: lessonId, admin_hidden: true }, error: null },
} = {}) {
  const invalidations = [];
  let clientCalls = 0;
  const state = { patch: null, filters: [] };
  const api = {
    update(patch) {
      state.patch = patch;
      return api;
    },
    eq(column, value) {
      state.filters.push([column, value]);
      return api;
    },
    select() {
      return api;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
  };
  const action = loadModule("../lib/lectures/admin.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => invalidations.push(path) },
    "next/navigation": { redirect },
    "@/lib/admin/auth": { requireAdmin: async () => admin },
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/supabase/server": {
      createClient: async () => {
        clientCalls += 1;
        return { from: () => api };
      },
    },
    "./rules": rules,
  });
  return {
    action,
    invalidations,
    state,
    clientCalls: () => clientCalls,
  };
}

test("관리자 차시 숨기기는 admin_hidden만 true로 바꾸고 공개 화면을 갱신한다", async () => {
  const denied = await harness({ admin: null });
  const form = new FormData();
  form.set("id", lessonId);
  form.set("lecture_id", lectureId);
  await assert.rejects(
    () => denied.action.hideLectureLesson(form),
    /REDIRECT \/admin\/lectures\?result=denied/,
  );
  assert.equal(denied.clientCalls(), 0);

  const invalid = await harness();
  const bad = new FormData();
  bad.set("id", "not-a-uuid");
  bad.set("lecture_id", lectureId);
  await assert.rejects(
    () => invalid.action.hideLectureLesson(bad),
    /REDIRECT \/admin\/lectures\?result=denied/,
  );
  assert.equal(invalid.clientCalls(), 0);

  const hidden = await harness();
  await assert.rejects(
    () => hidden.action.hideLectureLesson(form),
    new RegExp(`REDIRECT /admin/lectures/${lectureId}\\?result=hidden`),
  );
  assert.equal(hidden.clientCalls(), 1);
  assert.deepEqual(hidden.state.patch, { admin_hidden: true });
  assert.deepEqual(hidden.state.filters, [
    ["id", lessonId],
    ["lecture_id", lectureId],
    ["admin_hidden", false],
  ]);
  assert.deepEqual(hidden.invalidations, [
    "/admin/lectures",
    `/admin/lectures/${lectureId}`,
    "/mypage/lectures",
    `/mypage/lectures/${lectureId}`,
    "/class",
    `/class/lectures/${lectureId}`,
  ]);

  const failed = await harness({
    result: { data: null, error: { code: "42501" } },
  });
  await assert.rejects(
    () => failed.action.hideLectureLesson(form),
    new RegExp(`REDIRECT /admin/lectures/${lectureId}\\?result=unavailable`),
  );

  const missing = await harness({ result: { data: null, error: null } });
  await assert.rejects(
    () => missing.action.hideLectureLesson(form),
    new RegExp(`REDIRECT /admin/lectures/${lectureId}\\?result=missing`),
  );
});

test("선생님 화면은 숨긴 차시에 관리자 숨김 배지를 둔다", async () => {
  const view = await import("../components/lectures/lesson-view.ts");
  const row = {
    id: lessonId,
    lecture_id: lectureId,
    title: "1강",
    sort_order: 0,
    status: "ready",
    duration_seconds: 90,
  };
  assert.equal(view.parseLessonRow(row).adminHidden, false);
  assert.equal(
    view.parseLessonRow({ ...row, admin_hidden: true }).adminHidden,
    true,
  );
  assert.throws(() => view.parseLessonRow({ ...row, admin_hidden: "true" }));
  const manager = read("../components/lectures/lesson-manager.tsx");
  assert.match(manager, /lesson\.adminHidden \? <Badge>관리자 숨김<\/Badge>/);
  const button = read("../components/admin/hide-lesson-button.tsx");
  assert.match(button, /차시 숨기기/);
  assert.match(button, /차시를 숨길까요\?/);
  assert.match(button, /다시 공개할 수 없어요\./);
  assert.match(button, /hideLectureLesson/);
  const page = read("../app/admin/(panel)/lectures/[id]/page.tsx");
  assert.match(page, /HideLessonButton/);
  assert.match(page, /lesson\.adminHidden \? <Badge>관리자 숨김<\/Badge>/);
});
