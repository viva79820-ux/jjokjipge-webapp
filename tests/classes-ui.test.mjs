import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
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

const classId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const version = "2026-11-18T00:00:00.000001+00:00";
const nextVersion = "2026-11-18T00:00:01.000001+00:00";
const rules = load("lib/classes/rules.ts");
const submit = load("lib/classes/submit.ts", { "./actions": {} });
const reservationRules = load("lib/reservations/rules.ts");
const support = load("lib/admin/support-rules.ts", {
  "../inquiries/validation": { categoryLabels: { other: "기타" } },
});
const adminRules = load("lib/admin/rules.ts", {
  "@/lib/reservations/rules": reservationRules,
});

function form(extra = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    id: classId,
    version,
    mode: "update",
    title: "  테스트 강의  ",
    description: "  첫째 줄\n둘째 줄  ",
    field: "tarot",
    video_url: "https://example.com/watch",
    is_published: "false",
    sort_order: "0",
    ...extra,
  }))
    data.set(key, value);
  return data;
}

function memory(world) {
  return {
    from(table) {
      const query = {
        table,
        columns: "",
        filters: [],
        orders: [],
        range: null,
        kind: "select",
        payload: null,
        single: "",
        count: false,
        head: false,
      };
      world.calls.push(query);
      const api = {
        select(columns, options = {}) {
          query.columns = columns;
          query.count = options.count === "exact";
          query.head = Boolean(options.head);
          return api;
        },
        eq(column, value) {
          query.filters.push(["eq", column, value]);
          return api;
        },
        order(column, options = {}) {
          query.orders.push([column, options.ascending !== false]);
          return api;
        },
        range(from, to) {
          query.range = [from, to];
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
  return filters.every(([, column, value]) => row[column] === value);
}

function sortRows(rows, orders) {
  return [...rows].sort((left, right) => {
    for (const [column, ascending] of orders) {
      if (left[column] === right[column]) continue;
      const compared = left[column] > right[column] ? 1 : -1;
      return ascending ? compared : -compared;
    }
    return 0;
  });
}

function finish(query, rows, total) {
  const count = query.count ? total : null;
  if (query.single === "maybe") {
    if (rows.length > 1)
      return { data: null, error: { code: "PGRST116" }, count: null };
    return { data: rows[0] || null, error: null, count };
  }
  return { data: query.head ? [] : rows, error: null, count };
}

function execute(world, query) {
  if (query.table !== "classes")
    return { data: null, error: { code: "42P01" }, count: null };
  if (world.readError && query.kind === "select")
    return { data: null, error: world.readError, count: null };
  const visible = world.classes.filter(
    (row) => world.role === "admin" || row.is_published,
  );
  if (query.kind === "insert") {
    if (world.role !== "admin")
      return { data: null, error: { code: "42501" }, count: null };
    if (world.writeError)
      return { data: null, error: world.writeError, count: null };
    if (visible.some((row) => row.id === query.payload.id))
      return { data: null, error: { code: "23505" }, count: null };
    const saved = {
      created_at: version,
      updated_at: nextVersion,
      ...query.payload,
    };
    world.classes.push(saved);
    if (world.lose) {
      world.lose = false;
      throw Error("socket");
    }
    return finish(query, [saved], 1);
  }
  let selected = visible.filter((row) => same(row, query.filters));
  if (query.kind === "delete" || query.kind === "update") {
    if (world.role !== "admin")
      return { data: null, error: { code: "42501" }, count: null };
    if (world.writeError)
      return { data: null, error: world.writeError, count: null };
    if (world.silentReject) return finish(query, [], 0);
    if (query.kind === "delete") {
      for (const row of selected) {
        const index = world.classes.indexOf(row);
        if (index >= 0) world.classes.splice(index, 1);
      }
      return finish(query, selected, selected.length);
    }
    for (const row of selected)
      Object.assign(row, query.payload, { updated_at: nextVersion });
  }
  selected = sortRows(selected, query.orders);
  const total = selected.length;
  if (query.range)
    selected = selected.slice(query.range[0], query.range[1] + 1);
  if (world.rangeError && query.range && query.range[0] >= total && total > 0)
    return { data: null, error: { code: "PGRST103" }, count: null };
  return finish(query, selected, total);
}

function world(extra = {}) {
  return {
    role: "admin",
    calls: [],
    classes: [
      {
        id: classId,
        title: "테스트 기존강의",
        description: "기존 설명",
        field: "saju",
        video_url: "https://example.com/existing",
        is_published: true,
        sort_order: 2,
        created_at: version,
        updated_at: version,
      },
      {
        id: otherId,
        title: "테스트 비공개비밀",
        description: "비밀 본문",
        field: "tarot",
        video_url: "https://secret.example/hidden",
        is_published: false,
        sort_order: 0,
        created_at: "2026-11-18T00:00:02.000000+00:00",
        updated_at: version,
      },
    ],
    lose: false,
    silentReject: false,
    readError: null,
    writeError: null,
    rangeError: false,
    ...extra,
  };
}

function modules(state, auth) {
  const paths = [];
  let serverClients = 0;
  let publicClients = 0;
  const server = {
    createClient: async () => {
      serverClients += 1;
      if (auth.blockClient) throw Error("client opened");
      return memory({ ...state, role: "admin" });
    },
  };
  const publicClient = {
    createPublicClient: () => {
      publicClients += 1;
      return memory({ ...state, role: "anon" });
    },
  };
  const actions = load("lib/classes/actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": auth,
    "@/lib/admin/support-rules": support,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  const data = load("lib/classes/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": auth,
    "@/lib/supabase/public": publicClient,
    "@/lib/supabase/server": server,
    "./rules": rules,
  });
  return {
    ...actions,
    ...data,
    paths,
    serverClients: () => serverClients,
    publicClients: () => publicClients,
  };
}

const adminAuth = {
  requireAdmin: async () => ({
    userId: "99999999-9999-4999-8999-999999999999",
    email: "admin@example.invalid",
  }),
};

function authModule(session, role) {
  return load("lib/admin/auth.ts", {
    "server-only": {},
    "next/headers": {
      headers: async () => ({ get: () => "/admin/classes" }),
    },
    "next/navigation": {
      redirect: (url) => {
        throw Object.assign(Error("redirect"), { url });
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getClaims: async () =>
            session
              ? { data: { claims: session }, error: null }
              : { data: null, error: { message: "missing" } },
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: role ? { role } : null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    },
    "./rules": adminRules,
  });
}

test("class text, url, publication and sort order stay strict", () => {
  const parsed = rules.parseClass(form());
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.patch.title, "테스트 강의");
  assert.equal(parsed.patch.description, "첫째 줄\n둘째 줄");
  assert.equal(parsed.patch.field, "tarot");
  assert.equal(parsed.patch.video_url, "https://example.com/watch");
  assert.equal(parsed.patch.is_published, false);
  assert.equal(parsed.patch.sort_order, 0);
  assert.equal(rules.charLength("👍".repeat(100)), 100);
  assert.deepEqual(
    rules.parseClass(form({ title: "👍".repeat(100) })).errors,
    {},
  );
  assert.ok(rules.parseClass(form({ title: "가".repeat(101) })).errors.title);
  assert.ok(rules.parseClass(form({ title: "👍".repeat(101) })).errors.title);
  assert.ok(rules.parseClass(form({ title: "   " })).errors.title);
  assert.ok(rules.parseClass(form({ title: "테스트\n강의" })).errors.title);
  assert.equal(
    rules.parseClass(form({ description: "가".repeat(5000) })).patch.description
      .length,
    5000,
  );
  assert.ok(
    rules.parseClass(form({ description: "가".repeat(5001) })).errors
      .description,
  );
  assert.ok(
    rules.parseClass(form({ description: " \n\t " })).errors.description,
  );
  assert.equal(
    rules.parseClass(form({ description: "가\r\n나" })).patch.description,
    "가\r\n나",
  );
  assert.equal(
    rules.parseVideoUrl("https://example.com").url,
    "https://example.com/",
  );
  assert.equal(
    rules.parseVideoUrl("https://Example.COM/A").url,
    "https://example.com/A",
  );
  assert.equal(
    rules.parseVideoUrl("https://example.com:443/a").url,
    "https://example.com/a",
  );
  assert.equal(rules.parseVideoUrl("").url, null);
  assert.equal(rules.parseVideoUrl("").error, "");
  for (const video of [
    " https://example.com",
    "https://example.com/a b",
    "https://exam\tple.com",
    "https://user:pass@example.com/a",
    "https://@example.com",
    "http://example.com",
    "javascript:alert(1)",
    "https://example.com/a\\b",
    "https:///hidden",
    `https://example.com/${"a".repeat(2048)}`,
  ])
    assert.ok(
      rules.parseClass(form({ video_url: video })).errors.video_url,
      video,
    );
  assert.equal(rules.publicVideoHref("javascript:alert(1)"), null);
  assert.equal(
    rules.publicVideoHref("https://example.com/watch"),
    "https://example.com/watch",
  );
  assert.ok(
    rules.parseClass(form({ video_url: "", is_published: "true" })).errors
      .video_url,
  );
  assert.deepEqual(
    rules.parseClass(form({ video_url: "", is_published: "false" })).errors,
    {},
  );
  for (const order of ["", "1.5", "-1", "01", "2147483648", "1e2", " 1", "+3"])
    assert.ok(
      rules.parseClass(form({ sort_order: order })).errors.sort_order,
      order,
    );
  assert.equal(
    rules.parseClass(form({ sort_order: "2147483647" })).patch.sort_order,
    2147483647,
  );
  for (const published of ["TRUE", "1", "yes", ""])
    assert.ok(
      rules.parseClass(form({ is_published: published })).errors.is_published,
      published,
    );
  assert.ok(rules.parseClass(form({ field: "SAJU" })).errors.field);
  const duplicated = form();
  duplicated.append("title", "다른 제목");
  duplicated.append("is_published", "true");
  assert.ok(rules.parseClass(duplicated).errors.title);
  assert.ok(rules.parseClass(duplicated).errors.is_published);
  const file = form();
  file.set("description", new File(["설명"], "설명.txt"));
  assert.ok(rules.parseClass(file).errors.description);
  assert.equal(rules.summarize("첫째 줄\n둘째 줄"), "첫째 줄 둘째 줄");
  assert.equal(rules.summarize("가".repeat(81)).endsWith("…"), true);
  assert.equal(rules.summarize("가".repeat(81)).length, 81);
  assert.equal(rules.classFilters({ page: "0" }), null);
  assert.equal(rules.classFilters({ status: "public" }), null);
  assert.equal(rules.classFilters({ page: ["2"] }, true), null);
  assert.deepEqual(rules.classFilters({ page: "2", status: "private" }, true), {
    page: 2,
    status: "private",
    result: "",
  });
});

test("lost save response is not treated as success", async () => {
  const lost = await submit.submitClassAttempt(async () => {
    throw Error("socket");
  });
  assert.equal(lost.state, "unknown");
});

test("customer reads stay on the public client and admin writes are conditional", async () => {
  const state = world();
  const api = modules(state, adminAuth);
  const listed = await api.publicClassList(1);
  assert.equal(api.publicClients(), 1);
  assert.equal(api.serverClients(), 0);
  assert.deepEqual(
    listed.data.map((row) => row.title),
    ["테스트 기존강의"],
  );
  assert.ok(
    state.calls.some(
      (query) => query.columns === rules.publicListColumns && query.count,
    ),
  );
  assert.equal(
    state.calls
      .filter((query) => query.count)
      .some((query) => query.columns.includes("video_url")),
    false,
  );
  assert.equal(JSON.stringify(listed).includes("secret.example"), false);
  assert.equal(await api.publicClassDetail(otherId), null);
  assert.equal(JSON.stringify(state.calls).includes("비밀 본문"), false);
  const detail = await api.publicClassDetail(classId);
  assert.equal(detail.video_url, "https://example.com/existing");
  assert.equal(Object.hasOwn(detail, "is_published"), false);

  const loggedOut = modules(world(), authModule(null, null));
  await assert.rejects(
    () => loggedOut.saveClass(form()),
    (error) => String(error.url).startsWith("/admin/login?next="),
  );
  assert.equal(loggedOut.serverClients(), 0);
  const member = modules(
    world(),
    authModule(
      {
        sub: "55555555-5555-4555-8555-555555555555",
        email: "member@example.invalid",
      },
      "user",
    ),
  );
  assert.equal((await member.saveClass(form())).state, "rejected");
  assert.equal(member.serverClients(), 0);

  const createdId = "33333333-3333-4333-8333-333333333333";
  const created = await api.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 초안",
      video_url: "",
      is_published: "false",
      sort_order: "1",
    }),
  );
  assert.equal(created.state, "saved");
  assert.equal(created.row.video_url, null);
  assert.equal(created.row.is_published, false);
  assert.equal(created.row.updated_at, nextVersion);
  assert.equal(state.classes.filter((row) => row.id === createdId).length, 1);
  const replay = await api.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 초안",
      video_url: "",
      is_published: "false",
      sort_order: "1",
    }),
  );
  assert.equal(replay.state, "saved");
  assert.equal(state.classes.filter((row) => row.id === createdId).length, 1);
  const different = await api.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 다른초안",
      video_url: "",
    }),
  );
  assert.equal(different.state, "conflict");
  assert.equal(
    state.classes.find((row) => row.id === createdId).title,
    "테스트 초안",
  );

  const lostState = world();
  lostState.lose = true;
  const lostApi = modules(lostState, adminAuth);
  const lost = await lostApi.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 응답유실",
      video_url: "",
    }),
  );
  assert.equal(lost.state, "unknown");
  assert.equal(
    lostState.classes.filter((row) => row.id === createdId).length,
    1,
  );
  const confirmed = await lostApi.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 응답유실",
      video_url: "",
    }),
  );
  assert.equal(confirmed.state, "saved");
  assert.equal(
    lostState.classes.filter((row) => row.id === createdId).length,
    1,
  );

  const stale = await api.saveClass(
    form({
      title: "테스트 낡은수정",
      version: "2026-11-01T00:00:00.000000+00:00",
    }),
  );
  assert.equal(stale.state, "conflict");
  assert.equal(
    state.classes.find((row) => row.id === classId).title,
    "테스트 기존강의",
  );
  const updated = await api.saveClass(
    form({ title: "테스트 수정강의", is_published: "true" }),
  );
  assert.equal(updated.state, "saved");
  assert.equal(updated.row.title, "테스트 수정강의");
  assert.equal(updated.row.updated_at, nextVersion);
  assert.equal(updated.row.is_published, true);
  const missing = await api.saveClass(
    form({
      id: "44444444-4444-4444-8444-444444444444",
      mode: "delete",
    }),
  );
  assert.equal(missing.missing, true);
  assert.equal(missing.state, "rejected");
  const deniedWrite = modules(
    world({ writeError: { code: "42501" } }),
    adminAuth,
  );
  assert.equal(
    (await deniedWrite.saveClass(form())).message,
    "관리자 권한이 필요합니다.",
  );
  const silent = modules(world({ silentReject: true }), adminAuth);
  const silentResult = await silent.saveClass(form({ title: "테스트 무반응" }));
  assert.equal(silentResult.state, "rejected");
  assert.equal(silentResult.row, undefined);
  assert.equal(
    silent.paths.some((path) => path === "/"),
    false,
  );
  const removed = await api.saveClass(
    form({ mode: "delete", version: updated.row.updated_at }),
  );
  assert.equal(removed.deleted, true);
  assert.equal(
    state.classes.some((row) => row.id === classId),
    false,
  );
  assert.deepEqual(api.paths, [
    "/class",
    `/class/${createdId}`,
    "/admin/classes",
    "/admin/classes/new",
    `/admin/classes/${createdId}`,
    "/class",
    `/class/${createdId}`,
    "/admin/classes",
    "/admin/classes/new",
    `/admin/classes/${createdId}`,
    "/class",
    `/class/${classId}`,
    "/admin/classes",
    "/admin/classes/new",
    `/admin/classes/${classId}`,
    "/class",
    `/class/${classId}`,
    "/admin/classes",
    "/admin/classes/new",
    `/admin/classes/${classId}`,
  ]);
});

test("class screens do not render raw html or refresh the whole app", () => {
  const files = [
    "components/classes/pages.tsx",
    "components/classes/editor.tsx",
    "components/classes/video-link.tsx",
    "lib/classes/actions.ts",
    "lib/classes/data.ts",
    "app/(site)/class/page.tsx",
    "app/(site)/class/[id]/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(new URL(file, root), "utf8");
    assert.equal(source.includes("dangerouslySetInnerHTML"), false, file);
    assert.equal(source.includes("<iframe"), false, file);
    assert.equal(source.includes("SUPABASE_SECRET_KEY"), false, file);
    assert.equal(source.includes("router.refresh"), false, file);
    assert.equal(source.includes('revalidatePath("/", "layout")'), false, file);
  }
  const customer = readFileSync(new URL("lib/classes/data.ts", root), "utf8");
  assert.equal(customer.includes("createPublicClient"), true);
  const editor = readFileSync(
    new URL("components/classes/editor.tsx", root),
    "utf8",
  );
  assert.equal(editor.includes("whitespace-pre-wrap"), true);
  const menu = readFileSync(
    new URL("components/admin/menu-tabs.tsx", root),
    "utf8",
  );
  assert.equal(menu.includes('["클래스", "/admin/classes"]'), true);
  assert.equal(menu.includes('["콘텐츠", "/admin/contents"]'), true);
});
