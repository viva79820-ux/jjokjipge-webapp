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
        jsx: ts.JsxEmit.ReactJSX,
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
    is_online: "true",
    poster_path: "",
    poster_alt: "",
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
    storage: {
      from() {
        return {
          info: async (path) => {
            const file = world.files?.[path];
            if (!file) return { data: null, error: { status: 404 } };
            return { data: file, error: null };
          },
          remove: async (paths) => {
            for (const path of paths) delete world.files?.[path];
            world.removed = [...(world.removed || []), ...paths];
            return { error: null };
          },
        };
      },
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
  const outcome = completeQuery(world, query);
  const hold = world.hold;
  if (hold && !hold.done && hold.kinds.includes(query.kind)) {
    hold.seen += 1;
    return hold.promise.then(() => outcome);
  }
  return outcome;
}

function completeQuery(world, query) {
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
      if (world.lose) {
        world.lose = false;
        throw Error("socket");
      }
      return finish(query, selected, selected.length);
    }
    for (const row of selected)
      Object.assign(row, query.payload, { updated_at: nextVersion });
    if (world.lose) {
      world.lose = false;
      throw Error("socket");
    }
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
        is_online: true,
        poster_path: null,
        poster_alt: null,
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
        is_online: true,
        poster_path: null,
        poster_alt: null,
        is_published: false,
        sort_order: 0,
        created_at: "2026-11-18T00:00:02.000000+00:00",
        updated_at: version,
      },
    ],
    lose: false,
    hold: null,
    silentReject: false,
    readError: null,
    writeError: null,
    rangeError: false,
    failNextClient: false,
    ...extra,
  };
}

function writes(state) {
  return state.calls.filter((query) =>
    ["insert", "update", "delete"].includes(query.kind),
  );
}

function pause(state, kinds) {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  const hold = {
    kinds,
    promise,
    seen: 0,
    done: false,
    release() {
      hold.done = true;
      state.hold = null;
      resolve();
    },
  };
  state.hold = hold;
  return hold;
}

function modules(state, auth) {
  const paths = [];
  let serverClients = 0;
  let publicClients = 0;
  const server = {
    createClient: async () => {
      serverClients += 1;
      if (state.failNextClient) {
        state.failNextClient = false;
        throw Error("socket");
      }
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
    "node:crypto": {
      randomUUID: () => "33333333-3333-4333-8333-333333333333",
    },
    "./cleanup": {
      classifyStorageInfo(result) {
        if (!result.error && result.data) {
          const mime = result.data.contentType || "";
          const ok = ["image/jpeg", "image/png", "image/webp"].includes(mime);
          const size = result.data.size;
          return ok && Number.isInteger(size) && size > 0 && size <= 5242880
            ? "present"
            : "rejected";
        }
        const status = result.error?.status ?? result.error?.statusCode;
        if (status === 400 || status === 404) return "missing";
        if (status === 401 || status === 403) return "forbidden";
        return "unknown";
      },
      cleanupAction: () => async () => false,
      confirmUploadAction: () => async () => "present",
      removeUnreferenced: async (db, path) => {
        const refs = await db
          .from("classes")
          .select("id", { head: true, count: "exact" })
          .eq("poster_path", path);
        if (refs.error || refs.count === null) return false;
        if (refs.count > 0) return true;
        await db.storage.from("public-images").remove([path]);
        return true;
      },
    },
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
  assert.equal(parsed.patch.is_online, true);
  assert.equal(parsed.patch.poster_path, null);
  assert.equal(parsed.patch.poster_alt, null);
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
  assert.deepEqual(
    rules.parseClass(
      form({ video_url: "", is_published: "true", is_online: "false" }),
    ).errors,
    {},
  );
  assert.equal(
    rules.parseClass(
      form({ video_url: "", is_published: "true", is_online: "false" }),
    ).patch.is_online,
    false,
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
    field: "",
  });
  assert.equal(rules.classFilters({ field: "online" }), null);
  assert.equal(rules.classFilters({ delivery: "offline" }), null);
  assert.deepEqual(rules.classFilters({ field: "saju", page: "2" }), {
    page: 2,
    status: "",
    result: "",
    field: "saju",
  });
  assert.equal(
    rules.classListUrl(false, 2, "", "", "tarot"),
    "/class?page=2&field=tarot",
  );
  assert.equal(
    rules.classListUrl(false, 1, "", "", "saju"),
    "/class?field=saju",
  );
  assert.equal(rules.classListUrl(false), "/class");
});

test("offline classes can publish without video and posters stay paired", async () => {
  const poster = "classes/12345678-1234-4234-8234-123456789abc.jpg";
  assert.equal(rules.posterPath(poster), true);
  assert.equal(rules.posterPath(`classes/../${poster}`), false);
  assert.equal(
    rules.posterPath("products/12345678-1234-4234-8234-123456789abc.jpg"),
    false,
  );
  assert.ok(
    rules.parseClass(
      form({
        poster_path: poster,
        poster_alt: "",
      }),
    ).errors.poster_alt,
  );
  assert.deepEqual(
    rules.parseClass(
      form({
        poster_path: poster,
        poster_alt: "사주 수업 포스터",
      }),
    ).errors,
    {},
  );
  const state = world();
  const api = modules(state, adminAuth);
  const offline = await api.saveClass(
    form({
      title: "테스트 오프라인",
      video_url: "",
      is_online: "false",
      is_published: "true",
    }),
  );
  assert.equal(offline.state, "saved");
  assert.equal(offline.row.is_online, false);
  assert.equal(offline.row.video_url, null);
  assert.equal(offline.row.is_published, true);
  const missingPoster = await api.saveClass(
    form({
      title: "테스트 포스터없음",
      version: offline.row.updated_at,
      is_online: "false",
      is_published: "true",
      video_url: "",
      poster_path: poster,
      poster_alt: "없는 포스터",
    }),
  );
  assert.equal(missingPoster.state, "rejected");
  state.files = { [poster]: { size: 1200, contentType: "image/jpeg" } };
  state.classes.find((row) => row.id === otherId).poster_path = poster;
  const shared = await api.saveClass(
    form({
      title: "테스트 포스터공유",
      version: offline.row.updated_at,
      is_online: "false",
      is_published: "true",
      video_url: "",
      poster_path: poster,
      poster_alt: "공유 포스터",
    }),
  );
  assert.equal(shared.state, "rejected");
  state.classes.find((row) => row.id === otherId).poster_path = null;
  const attached = await api.saveClass(
    form({
      title: "테스트 포스터연결",
      version: offline.row.updated_at,
      is_online: "false",
      is_published: "true",
      video_url: "",
      poster_path: poster,
      poster_alt: "사주 수업 포스터",
    }),
  );
  assert.equal(attached.state, "saved");
  assert.equal(attached.row.poster_path, poster);
  assert.equal(attached.row.poster_alt, "사주 수업 포스터");
  const listed = await api.publicClassList(1, "tarot");
  assert.deepEqual(
    listed.data.map((row) => row.title),
    ["테스트 포스터연결"],
  );
  assert.equal(listed.data[0].poster_path, poster);
  assert.equal(listed.data[0].is_online, false);
  const saju = await api.publicClassList(1, "saju");
  assert.equal(
    saju.data.some((row) => row.id === classId),
    false,
  );
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

test("lost delete response reconciles by reading and does not delete again", async () => {
  const state = world();
  state.lose = true;
  const api = modules(state, adminAuth);
  const lost = await api.saveClass(form({ mode: "delete" }));
  state.lose = false;
  assert.equal(lost.state, "unknown");
  assert.equal(
    state.classes.some((row) => row.id === classId),
    false,
  );
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  const before = state.calls.length;
  const checked = await api.confirmClass(
    classId,
    form({ mode: "delete", version }),
  );
  assert.equal(checked.deleted, true);
  assert.equal(checked.message, "클래스를 삭제했습니다.");
  assert.equal(checked.message.includes("저장"), false);
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  assert.equal(
    state.calls.slice(before).every((query) => query.kind === "select"),
    true,
  );
});

test("delete confirmation separates missed, changed, and unread results", async () => {
  const missed = world();
  missed.failNextClient = true;
  const missedApi = modules(missed, adminAuth);
  assert.equal(
    (await missedApi.saveClass(form({ mode: "delete" }))).state,
    "unknown",
  );
  assert.equal(writes(missed).length, 0);
  const unchanged = await missedApi.confirmClass(
    classId,
    form({ mode: "delete", version }),
  );
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.message.includes("삭제는 반영되지 않았습니다"), true);
  assert.equal(unchanged.message.includes("저장은 반영되지 않았습니다"), false);
  assert.equal(writes(missed).length, 0);

  const changed = world();
  const changedApi = modules(changed, adminAuth);
  changed.classes.find((row) => row.id === classId).updated_at = nextVersion;
  const conflicted = await changedApi.confirmClass(
    classId,
    form({ mode: "delete", version }),
  );
  assert.equal(conflicted.state, "conflict");
  assert.equal(writes(changed).length, 0);
  assert.equal(
    changed.classes.find((row) => row.id === classId).title,
    "테스트 기존강의",
  );

  const unread = world();
  unread.lose = true;
  const unreadApi = modules(unread, adminAuth);
  assert.equal(
    (await unreadApi.saveClass(form({ mode: "delete" }))).state,
    "unknown",
  );
  unread.lose = false;
  unread.readError = { code: "XX000" };
  const uncertain = await unreadApi.confirmClass(
    classId,
    form({ mode: "delete", version }),
  );
  assert.equal(uncertain.state, "unknown");
  assert.equal(uncertain.deleted, undefined);
  assert.equal(uncertain.unchanged, undefined);
  assert.equal(
    writes(unread).filter((query) => query.kind === "delete").length,
    1,
  );

  const invalid = world();
  const invalidApi = modules(invalid, adminAuth);
  const duplicated = form({ mode: "delete" });
  duplicated.append("mode", "update");
  for (const request of [
    duplicated,
    form({ mode: "remove" }),
    form({ mode: "delete", version: "어제" }),
    form({ mode: "delete", id: otherId }),
    form({ mode: "create", version: version }),
  ])
    assert.equal(
      (await invalidApi.confirmClass(classId, request)).state,
      "rejected",
    );
  assert.equal(invalid.calls.length, 0);
  assert.equal(invalidApi.serverClients(), 0);
});

test("lost create and update responses still confirm without another write", async () => {
  const createdId = "33333333-3333-4333-8333-333333333333";
  const state = world();
  state.lose = true;
  const api = modules(state, adminAuth);
  const created = await api.saveClass(
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 응답유실",
      video_url: "",
    }),
  );
  state.lose = false;
  assert.equal(created.state, "unknown");
  const beforeCreate = writes(state).length;
  const confirmed = await api.confirmClass(
    createdId,
    form({
      id: createdId,
      mode: "create",
      version: "",
      title: "테스트 응답유실",
      video_url: "",
    }),
  );
  assert.equal(confirmed.state, "saved");
  assert.equal(confirmed.message, "클래스를 저장했습니다.");
  assert.equal(writes(state).length, beforeCreate);

  state.lose = true;
  const updated = await api.saveClass(
    form({ title: "테스트 수정유실", is_published: "true" }),
  );
  state.lose = false;
  assert.equal(updated.state, "unknown");
  const beforeUpdate = writes(state).length;
  const recovered = await api.confirmClass(
    classId,
    form({ title: "테스트 수정유실", is_published: "true", version }),
  );
  assert.equal(recovered.state, "saved");
  assert.equal(recovered.row.title, "테스트 수정유실");
  assert.equal(writes(state).length, beforeUpdate);
});

async function openEditor(state, props = {}) {
  const { installClassDom, textOf } = await import("./classes-dom.mjs");
  const document = installClassDom();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = React;
  const api = modules(state, adminAuth);
  const seen = [];
  const confirm = api.confirmClass.bind(api);
  api.confirmClass = async (id, data) => {
    seen.push(Object.fromEntries(data.entries()));
    return confirm(id, data);
  };
  const routes = [];
  const editor = load("components/classes/editor.tsx", {
    react: React,
    "react/jsx-runtime": await import("react/jsx-runtime"),
    "next/link": {
      default: ({ children, href, onClick }) =>
        React.createElement("a", { href, onClick }, children),
    },
    "next/navigation": {
      useRouter: () => ({
        replace: (url) => routes.push(url),
        push: (url) => routes.push(url),
      }),
    },
    "@/lib/admin/reservation-rules": { formatTime: (value) => value },
    "@/components/ui/button": {
      Button: ({ children, onClick, disabled, type = "button", href }) =>
        href
          ? React.createElement("a", { href }, children)
          : React.createElement(
              "button",
              { type, disabled: Boolean(disabled), onClick },
              children,
            ),
    },
    "@/components/ui/modal": {
      Modal: ({ title, children, footer }) =>
        React.createElement(
          "div",
          { role: "dialog" },
          React.createElement("h2", null, title),
          children,
          footer,
        ),
    },
    "@/lib/classes/actions": api,
    "@/lib/classes/submit": submit,
    "@/lib/classes/rules": rules,
    "@/lib/classes/content": load("lib/classes/content.ts"),
    "@/lib/classes/upload": {
      inspectImage: async () => ({ ext: "jpg", mime: "image/jpeg" }),
      uploadImage: async (_client, _file, path) => path,
    },
    "@/lib/supabase/client": {
      createClient: () => ({
        storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      }),
    },
  });
  const initial =
    props.initial === undefined
      ? state.classes.find((row) => row.id === classId)
      : props.initial;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let hidden = false;
  const draw = () =>
    React.createElement(
      React.Activity,
      { mode: hidden ? "hidden" : "visible" },
      React.createElement(editor.ClassEditor, {
        initial,
        page: 1,
        status: "",
        initialMessage: "",
      }),
    );
  await act(async () => {
    root.render(draw());
  });
  const button = (label) => {
    let found = null;
    const tags = [];
    const visit = (node) => {
      if (node.tagName)
        tags.push(`${node.tagName}:${textOf(node).trim().slice(0, 24)}`);
      if (found) return;
      if (node.tagName === "BUTTON" && textOf(node).trim() === label)
        found = node;
      for (const child of node.childNodes || []) visit(child);
    };
    const buttons = [];
    const collect = (node) => {
      if (node.tagName === "BUTTON")
        buttons.push(
          `${(node.childNodes || []).map((child) => child.nodeValue).join("/")}`,
        );
      for (const child of node.childNodes || []) collect(child);
    };
    collect(container);
    visit(container);
    assert.ok(found, `${label} :: ${buttons.join(" || ")}`);
    return found;
  };
  const click = async (label) => {
    await act(async () => {
      const node = button(label);
      node.dispatchEvent({ type: "click" });
      if (node.type === "submit") {
        let form = node.parentNode;
        while (form && form.tagName !== "FORM") form = form.parentNode;
        form?.dispatchEvent({ type: "submit" });
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  const text = () => textOf(container);
  const setHidden = async (value) => {
    hidden = value;
    await act(async () => {
      root.render(draw());
    });
  };
  const edit = async (node, value) => {
    await act(async () => {
      if (typeof value === "boolean") node.checked = value;
      else {
        if (node.tagName === "INPUT" && !node.type) node.type = "text";
        node.value = value;
      }
      node.dispatchEvent({ type: "input" });
      node.dispatchEvent({ type: "change" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const input = (name) => {
    let found = null;
    const visit = (node) => {
      if (found) return;
      if (node.name === name || node.getAttribute?.("name") === name)
        found = node;
      for (const child of node.childNodes || []) visit(child);
    };
    visit(container);
    assert.ok(found, name);
    return found;
  };
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const settle = async (task) => {
    await act(async () => {
      task?.();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  };
  return {
    click,
    text,
    routes,
    root,
    button,
    input,
    edit,
    setHidden,
    seen,
    settle,
  };
}

test("editor treats a lost delete as deleted without writing again", async () => {
  const state = world();
  const view = await openEditor(state);
  await view.click("삭제 전 확인");
  state.lose = true;
  const before = writes(state).length;
  await view.click("확인 후 처리");
  state.lose = false;
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  assert.equal(writes(state).length, before + 1);
  assert.equal(
    state.classes.some((row) => row.id === classId),
    false,
  );
  assert.equal(view.text().includes("저장은 반영되지 않았습니다."), false);
  assert.equal(view.text().includes("클래스를 저장했습니다."), false);
  assert.equal(view.text().includes("삭제 결과를 확인하지 못했습니다."), true);
  assert.equal(view.routes.length, 0);
  const seen = state.calls.length;
  const duringHide = writes(state).length;
  await view.setHidden(true);
  assert.equal(view.text().includes("클래스 삭제 확인"), false);
  assert.equal(writes(state).length, duringHide);
  await view.setHidden(false);
  assert.equal(view.text().includes("삭제 결과 다시 확인"), true);
  assert.equal(writes(state).length, duringHide);
  await view.click("삭제 결과 다시 확인");
  assert.equal(view.text().includes("이 클래스는 삭제되었습니다."), true);
  assert.equal(view.text().includes("클래스를 저장했습니다."), false);
  assert.equal(view.text().includes("저장은 반영되지 않았습니다."), false);
  assert.equal(view.routes.at(-1), "/admin/classes?result=deleted");
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  assert.equal(
    state.calls.slice(seen).every((query) => query.kind === "select"),
    true,
  );
  view.root.unmount();
});

test("editor keeps a missed or changed delete uncertain without another write", async () => {
  const missed = world();
  missed.failNextClient = true;
  const missedView = await openEditor(missed);
  await missedView.click("삭제 전 확인");
  await missedView.click("확인 후 처리");
  assert.equal(writes(missed).length, 0);
  assert.equal(
    missed.classes.some((row) => row.id === classId),
    true,
  );
  await missedView.click("삭제 결과 다시 확인");
  assert.equal(missedView.seen.at(-1).mode, "delete");
  assert.equal(missedView.seen.at(-1).title, "테스트 기존강의");
  assert.equal(missedView.text().includes("삭제는 반영되지 않았습니다"), true);
  assert.equal(missedView.text().includes("저장은 반영되지 않았습니다"), false);
  assert.equal(missedView.text().includes("클래스를 저장했습니다"), false);
  assert.equal(writes(missed).length, 0);
  missedView.root.unmount();

  const unread = world();
  unread.lose = true;
  const unreadView = await openEditor(unread);
  await unreadView.click("삭제 전 확인");
  await unreadView.click("확인 후 처리");
  unread.lose = false;
  unread.readError = { code: "XX000" };
  const beforeRead = writes(unread).length;
  await unreadView.click("삭제 결과 다시 확인");
  assert.equal(
    unreadView.text().includes("삭제 결과를 확인하지 못했습니다."),
    true,
  );
  assert.equal(unreadView.text().includes("삭제는 반영되지 않았습니다"), false);
  assert.equal(
    unreadView.text().includes("이 클래스는 삭제되었습니다."),
    false,
  );
  assert.equal(writes(unread).length, beforeRead);
  assert.equal(unreadView.text().includes("삭제 결과 다시 확인"), true);
  unreadView.root.unmount();

  const changed = world();
  changed.failNextClient = true;
  const changedView = await openEditor(changed);
  await changedView.click("삭제 전 확인");
  await changedView.click("확인 후 처리");
  changed.classes.find((row) => row.id === classId).updated_at = nextVersion;
  changed.classes.find((row) => row.id === classId).title = "테스트 서버제목";
  await changedView.click("삭제 결과 다시 확인");
  assert.equal(
    changedView.text().includes("다른 작업으로 클래스가 변경됐습니다."),
    true,
  );
  assert.equal(writes(changed).length, 0);
  assert.equal(
    changed.classes.find((row) => row.id === classId).title,
    "테스트 서버제목",
  );
  changedView.root.unmount();
});

test("editor keeps save recovery and repeated edits on one screen", async () => {
  const state = world();
  const view = await openEditor(state);
  await view.click("저장 전 확인");
  await view.click("확인 후 처리");
  assert.equal(view.text().includes("클래스를 저장했습니다."), true);
  assert.equal(
    writes(state).filter((query) => query.kind === "update").length,
    1,
  );
  await view.click("저장 전 확인");
  await view.click("확인 후 처리");
  assert.equal(view.text().includes("클래스를 저장했습니다."), true);
  assert.equal(
    writes(state).filter((query) => query.kind === "update").length,
    2,
  );
  assert.equal(view.routes.length, 0);
  view.root.unmount();
});

test("hidden editor keeps a late delete result and moves only after it returns", async () => {
  const state = world();
  const view = await openEditor(state);
  await view.click("삭제 전 확인");
  state.lose = true;
  await view.click("확인 후 처리");
  state.lose = false;
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  assert.equal(view.routes.length, 0);
  const held = pause(state, ["select"]);
  const before = writes(state).length;
  await view.click("삭제 결과 다시 확인");
  assert.equal(held.seen, 1);
  await view.setHidden(true);
  assert.deepEqual(view.routes, []);
  assert.equal(writes(state).length, before);
  await view.settle(() => held.release());
  assert.deepEqual(view.routes, []);
  assert.equal(writes(state).length, before);
  assert.equal(
    writes(state).filter((query) => query.kind === "delete").length,
    1,
  );
  await view.setHidden(false);
  assert.deepEqual(view.routes, ["/admin/classes?result=deleted"]);
  assert.equal(view.text().includes("이 클래스는 삭제되었습니다."), true);
  assert.equal(writes(state).length, before);
  await view.setHidden(true);
  await view.setHidden(false);
  assert.deepEqual(view.routes, ["/admin/classes?result=deleted"]);
  assert.equal(writes(state).length, before);
  view.root.unmount();
});

test("hidden editor keeps a late create result and moves only after it returns", async () => {
  const state = world();
  const view = await openEditor(state, { initial: null });
  await view.edit(view.input("title"), "테스트 늦은신규");
  await view.edit(view.input("description"), "늦은 응답 설명");
  await view.edit(view.input("field"), "saju");
  await view.click("저장 전 확인");
  const held = pause(state, ["insert"]);
  const before = writes(state).length;
  await view.click("확인 후 처리");
  assert.equal(held.seen, 1);
  assert.equal(
    writes(state).filter((query) => query.kind === "insert").length,
    before + 1,
  );
  const saved = state.classes.find((row) => row.title === "테스트 늦은신규");
  assert.ok(saved);
  await view.setHidden(true);
  assert.deepEqual(view.routes, []);
  assert.equal(writes(state).length, before + 1);
  await view.settle(() => held.release());
  assert.deepEqual(view.routes, []);
  assert.equal(writes(state).length, before + 1);
  await view.setHidden(false);
  assert.deepEqual(view.routes, [`/admin/classes/${saved.id}?result=saved`]);
  assert.equal(writes(state).length, before + 1);
  await view.setHidden(true);
  await view.setHidden(false);
  assert.deepEqual(view.routes, [`/admin/classes/${saved.id}?result=saved`]);
  assert.equal(
    writes(state).filter((query) => query.kind === "insert").length,
    before + 1,
  );
  view.root.unmount();
});
