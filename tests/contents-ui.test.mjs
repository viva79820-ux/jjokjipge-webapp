import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(read(file), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )((name) => {
    assert.ok(name in adapters, name);
    return adapters[name];
  }, exports);
  return exports;
}

const rules = load("lib/contents/rules.ts");
const support = load("lib/admin/support-rules.ts", {
  "../inquiries/validation": {
    categoryLabels: {
      reservation_payment: "예약·입금",
      cancellation_refund: "취소·환불",
      consultation: "상담 방식",
      shop: "타로샵",
      other: "기타",
    },
  },
});
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const version = "2026-11-18T00:00:00.123456+00:00";
const nextVersion = "2026-11-18T00:00:01.654321+00:00";

function fields(extra = {}) {
  return {
    title: "  테스트 제목  ",
    description: "  첫 줄\n둘째 줄  ",
    channel: "blog",
    external_url: "https://Example.com/post",
    is_published: "false",
    sort_order: "0",
    ...extra,
  };
}

function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id,
    mode: "update",
    version,
    ...fields(),
    ...extra,
  }))
    data.append(key, value);
  return data;
}

test("주소는 표준 파서와 DB 형식으로 정규화하고 세탁하지 않는다", () => {
  const ok = rules.parseExternalUrl("https://Example.com:443/a");
  assert.equal(ok.state, "ok");
  assert.equal(ok.href, "https://example.com/a");
  assert.deepEqual(rules.parseExternalUrl(ok.href), ok);
  assert.equal(
    rules.parseExternalUrl("https://example.com/path?q=1#hash").href,
    "https://example.com/path?q=1#hash",
  );
  assert.equal(
    rules.parseExternalUrl("https://[::1]/a").href,
    "https://[::1]/a",
  );
  assert.equal(
    rules.parseExternalUrl("https://example.com/user@name").href,
    "https://example.com/user@name",
  );
  assert.equal(rules.parseExternalUrl("").state, "empty");
  for (const value of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://user@example.com",
    " https://example.com",
    "https://example.com ",
    "https://example.com/a b",
    "https://example.com/\n",
    "https://ex\u0009ample.com",
    "https://example.com/a\\b",
    "javascript:alert(1)",
    "data:text/html,hi",
    "https:///missing",
    "https://@example.com",
    "HTTPS://example.com",
    `https://example.com/${"a".repeat(2030)}`,
  ])
    assert.equal(rules.parseExternalUrl(value).state, "invalid", value);
  const limit = `https://example.com/${"a".repeat(2028)}`;
  assert.equal(limit.length, 2048);
  assert.equal(rules.parseExternalUrl(limit).state, "ok");
});

test("문자 수·중복 필드·채널·공개·정렬을 거부한다", () => {
  const emoji = "😀".repeat(100);
  assert.equal(rules.textLength(emoji), 100);
  assert.equal(rules.contentPatch(form({ title: emoji })).patch.title, emoji);
  assert.equal(rules.contentPatch(form({ title: `${emoji}가` })).patch, null);
  const description = "가".repeat(1000);
  assert.equal(
    rules.contentPatch(form({ description })).patch.description,
    description,
  );
  assert.equal(
    rules.contentPatch(form({ description: `${description}가` })).patch,
    null,
  );
  assert.equal(
    rules.contentPatch(form({ description: "" })).patch.description,
    null,
  );
  assert.equal(rules.contentPatch(form({ description: "   " })).patch, null);
  assert.equal(rules.contentPatch(form({ description: "안녕\0" })).patch, null);
  assert.equal(rules.contentPatch(form({ title: "안녕\n" })).patch, null);
  assert.equal(rules.contentPatch(form({ title: "   " })).patch, null);
  const parsed = rules.contentPatch(form());
  assert.equal(parsed.patch.title, "테스트 제목");
  assert.equal(parsed.patch.description, "첫 줄\n둘째 줄");
  assert.equal(
    rules.contentPatch(form({ description: "첫 줄\r\n둘째 줄" })).patch
      .description,
    "첫 줄\n둘째 줄",
  );
  assert.equal(parsed.patch.external_url, "https://example.com/post");
  assert.equal(parsed.patch.is_published, false);
  const duplicated = form();
  duplicated.append("title", "다른 제목");
  assert.equal(rules.contentPatch(duplicated).patch, null);
  const file = form();
  file.delete("channel");
  file.append("channel", new Blob(["blog"]));
  assert.equal(rules.contentPatch(file).patch, null);
  for (const channel of ["Blog", "tiktok", ""])
    assert.equal(rules.contentPatch(form({ channel })).patch, null);
  for (const is_published of ["TRUE", "1", "on", ""])
    assert.equal(rules.contentPatch(form({ is_published })).patch, null);
  assert.equal(
    rules.contentPatch(form({ is_published: "true", external_url: "" })).errors
      .external_url,
    "공개하려면 외부 주소가 필요합니다.",
  );
  assert.equal(
    rules.contentPatch(form({ external_url: "" })).patch.external_url,
    null,
  );
  for (const sort_order of ["1.5", "-1", "2147483648", "01", "1e2", "", " 1"])
    assert.equal(
      rules.contentPatch(form({ sort_order })).patch,
      null,
      sort_order,
    );
  assert.equal(
    rules.contentPatch(form({ sort_order: "2147483647" })).patch.sort_order,
    2147483647,
  );
});

test("목록 조건과 정렬 해석이 하나다", () => {
  assert.deepEqual(rules.publicFilters({ channel: "blog", page: "2" }), {
    page: 2,
    channel: "blog",
  });
  assert.equal(rules.publicFilters({ channel: ["blog", "instagram"] }), null);
  assert.equal(rules.publicFilters({ channel: "tiktok" }), null);
  assert.equal(rules.publicFilters({ page: "0" }), null);
  assert.equal(rules.publicFilters({ page: "1", q: "1" }), null);
  assert.deepEqual(
    rules.adminFilters({ notice: "deleted", status: "private" }),
    {
      page: 1,
      status: "private",
      deleted: true,
    },
  );
  assert.equal(rules.adminFilters({ status: ["public", "private"] }), null);
  assert.equal(rules.adminFilters({ notice: "saved" }), null);
  assert.equal(
    rules.returnUrl("https://evil.example/admin/contents"),
    "/admin/contents",
  );
  assert.equal(
    rules.returnUrl("/admin/contents?page=2&status=public&notice=deleted"),
    "/admin/contents?page=2&status=public",
  );
  const rows = [
    { sort_order: 1, created_at: "2026-11-18T00:00:00.000000+00:00", id: "b" },
    { sort_order: 0, created_at: "2026-11-18T00:00:00.000000+00:00", id: "a" },
    { sort_order: 1, created_at: "2026-11-18T00:00:02.000000+00:00", id: "c" },
    { sort_order: 1, created_at: "2026-11-18T00:00:02.000000+00:00", id: "d" },
  ].sort(rules.compareContents);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "d", "c", "b"],
  );
  const hidden = rules.presentPublic({
    id,
    title: "SECRET",
    description: "숨김",
    channel: "youtube",
    external_url: "https://secret.example/hidden",
    is_published: false,
  });
  assert.equal(hidden, null);
  const unsafe = rules.presentPublic({
    id,
    title: "잘못된주소글",
    description: null,
    channel: "blog",
    external_url: "javascript:alert(1)",
    is_published: true,
  });
  assert.equal(unsafe.href, null);
  assert.equal(JSON.stringify(unsafe).includes("javascript:"), false);
});

function memory(world) {
  return {
    from(table) {
      const query = {
        table,
        filters: [],
        kind: "select",
        payload: null,
        single: "",
      };
      world.calls.push(query);
      const api = {
        select() {
          return api;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return api;
        },
        order() {
          return api;
        },
        range() {
          return api;
        },
        insert(payload) {
          query.kind = "insert";
          query.payload = payload;
          return api;
        },
        update(payload) {
          query.kind = "update";
          query.payload = payload;
          return api;
        },
        delete() {
          query.kind = "delete";
          return api;
        },
        maybeSingle() {
          query.single = "maybe";
          return api;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => execute(world, query))
            .then(resolve, reject);
        },
      };
      return api;
    },
  };
}

function same(row, filters) {
  return filters.every(([column, value]) => row[column] === value);
}

function execute(world, query) {
  const table = world.rows;
  if (query.kind === "select" && world.readError)
    return { data: null, error: world.readError, count: null };
  if (query.kind === "select" && world.hideOnce) {
    world.hideOnce = false;
    return { data: null, error: null, count: null };
  }
  if (query.kind === "insert") {
    if (table.some((row) => row.id === query.payload.id))
      return { data: null, error: { code: "23505" }, count: null };
    const saved = {
      ...query.payload,
      created_at: version,
      updated_at: nextVersion,
    };
    table.push(saved);
    if (world.loseInsert) {
      world.loseInsert = false;
      throw Error("socket");
    }
    return { data: saved, error: null, count: null };
  }
  let selected = table.filter((row) => same(row, query.filters));
  if (query.kind === "update" || query.kind === "delete") {
    if (world.mutationError)
      return { data: null, error: world.mutationError, count: null };
    if (world.blockWrite) {
      world.blockWrite = false;
      selected = [];
    }
  }
  if (query.kind === "update") {
    for (const row of selected)
      Object.assign(row, query.payload, { updated_at: nextVersion });
  }
  if (query.kind === "delete") {
    for (const row of selected) table.splice(table.indexOf(row), 1);
  }
  if (query.single === "maybe")
    return { data: selected[0] || null, error: null, count: selected.length };
  return { data: selected, error: null, count: selected.length };
}

function row(extra = {}) {
  return {
    id,
    title: "테스트 제목",
    description: "첫 줄\n둘째 줄",
    channel: "blog",
    external_url: "https://example.com/post",
    is_published: false,
    sort_order: 0,
    created_at: version,
    updated_at: version,
    ...extra,
  };
}

function harness(extra = {}, admin = true) {
  const state = { calls: [], rows: [row()], readError: null, ...extra };
  const paths = [];
  let clients = 0;
  const actions = load("lib/contents/actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": {
      requireAdmin: async () =>
        admin ? { userId: "admin", email: "a@b.c" } : null,
    },
    "@/lib/admin/support-rules": support,
    "@/lib/supabase/server": {
      createClient: async () => {
        clients += 1;
        return memory(state);
      },
    },
    "./rules": rules,
  });
  return { state, paths, actions, clients: () => clients };
}

test("권한·충돌·없음·응답 유실에서 조건부 저장을 지킨다", async () => {
  const denied = harness({}, false);
  const deniedResult = await denied.actions.saveContent(form());
  assert.equal(deniedResult.message, "관리자 권한이 필요합니다.");
  assert.equal(denied.clients(), 0);

  const stale = harness();
  stale.state.rows[0].updated_at = nextVersion;
  const conflict = await stale.actions.saveContent(
    form({ title: "바꾼 제목", mode: "update" }),
  );
  assert.equal(conflict.state, "conflict");
  assert.equal(stale.state.rows[0].title, "테스트 제목");
  assert.equal(
    stale.state.calls.some((call) => call.kind === "update"),
    false,
  );

  const saved = harness();
  const updated = await saved.actions.saveContent(form({ title: "바꾼 제목" }));
  assert.equal(updated.state, "saved");
  assert.equal(updated.row.updated_at, nextVersion);
  assert.equal(saved.state.rows[0].title, "바꾼 제목");
  const update = saved.state.calls.find((call) => call.kind === "update");
  assert.deepEqual(update.filters, [
    ["id", id],
    ["updated_at", version],
  ]);
  assert.equal(Object.hasOwn(update.payload, "updated_at"), false);
  assert.deepEqual(saved.paths, [
    "/contents",
    "/admin/contents",
    `/admin/contents/${id}`,
  ]);

  const blocked = harness({ blockWrite: true });
  const forbidden = await blocked.actions.saveContent(
    form({ title: "바꾼 제목" }),
  );
  assert.equal(forbidden.state, "rejected");
  assert.match(forbidden.message, /권한/);
  assert.equal(blocked.state.rows[0].title, "테스트 제목");

  const missing = harness({ rows: [] });
  const absent = await missing.actions.saveContent(form());
  assert.equal(absent.missing, true);
  assert.equal(
    missing.state.calls.some((call) => call.kind === "update"),
    false,
  );

  const removed = harness();
  const deleted = await removed.actions.saveContent(form({ mode: "delete" }));
  assert.equal(deleted.deleted, true);
  assert.equal(removed.state.rows.length, 0);
  const deletion = removed.state.calls.find((call) => call.kind === "delete");
  assert.deepEqual(
    deletion.filters.map((item) => item[0]),
    ["id", "updated_at"],
  );

  const kept = harness();
  kept.state.rows[0].updated_at = nextVersion;
  const keep = await kept.actions.saveContent(form({ mode: "delete" }));
  assert.equal(keep.state, "conflict");
  assert.equal(kept.state.rows.length, 1);

  const lost = harness({ rows: [], loseInsert: true });
  const unknown = await lost.actions.saveContent(
    form({ mode: "create", version: "" }),
  );
  assert.equal(unknown.state, "unknown");
  assert.equal(lost.state.rows.length, 1);
  assert.equal(
    lost.state.calls.filter((call) => call.kind === "insert").length,
    1,
  );

  const replay = harness({
    rows: [row({ title: "테스트 제목", description: "첫 줄\n둘째 줄" })],
    hideOnce: true,
  });
  const again = await replay.actions.saveContent(
    form({ mode: "create", version: "" }),
  );
  assert.equal(again.state, "saved");
  assert.equal(replay.state.rows.length, 1);
  assert.equal(
    replay.state.calls.filter((call) => call.kind === "insert").length,
    1,
  );

  const unread = harness({ rows: [], readError: { code: "XX000" } });
  const unconfirmed = await unread.actions.saveContent(
    form({ mode: "create", version: "" }),
  );
  assert.equal(unconfirmed.state, "unknown");
  assert.equal(
    unread.state.calls.some((call) => call.kind === "insert"),
    false,
  );

  const refused = harness({ mutationError: { code: "42501" } });
  const permission = await refused.actions.saveContent(
    form({ title: "바꾼 제목" }),
  );
  assert.equal(permission.state, "rejected");
  assert.match(permission.message, /권한/);
  assert.equal(refused.paths.length, 0);
});

test("고객 조회 코드는 공개 클라이언트와 공개 조건만 사용한다", () => {
  const data = read("lib/contents/data.ts");
  const actions = read("lib/contents/actions.ts");
  const pages = read("components/contents/pages.tsx");
  const editor = read("components/contents/editor.tsx");
  const publicFn = data.slice(
    data.indexOf("export async function publicContentList"),
    data.indexOf("export async function adminContentList"),
  );
  assert.equal(publicFn.includes("createPublicClient("), true);
  assert.equal(publicFn.includes("createClient("), false);
  assert.match(publicFn, /is_published", true/);
  for (const source of [data, actions, pages, editor])
    assert.equal(source.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(actions.includes('revalidatePath("/contents")'), true);
  assert.equal(editor.includes("router.refresh"), false);
  assert.equal(pages.includes("<iframe"), false);
  assert.equal(
    read("components/contents/channel.tsx").includes("<iframe"),
    false,
  );
  assert.equal(
    read("components/admin/menu-tabs.tsx").includes("콘텐츠"),
    false,
  );
});
