import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

function load(file, adapters = {}, compilerOptions = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(read(file), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        ...compilerOptions,
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
    if (world.loseDelete === "before") {
      world.loseDelete = "";
      throw Error("socket");
    }
    for (const row of selected) table.splice(table.indexOf(row), 1);
    if (world.loseDelete === "after") {
      world.loseDelete = "";
      throw Error("socket");
    }
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

const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const conflictText =
  "다른 작업으로 콘텐츠가 변경됐습니다. 최신 내용을 확인해 주세요.";
const unchangedText = "삭제가 반영되지 않았습니다. 콘텐츠는 그대로입니다.";
const confirmedGoneText = "콘텐츠가 없는 것을 확인했습니다.";

function kindCount(state, kind) {
  return state.calls.filter((call) => call.kind === kind).length;
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props)
    return textOf(node.props.children);
  return "";
}

function walk(node, visit, seen = new WeakSet()) {
  if (!node || (typeof node !== "object" && typeof node !== "function")) return;
  if (typeof node === "function") return;
  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, visit, seen));
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);
  if (node.props) visit(node);
  if (!node.props) return;
  for (const value of Object.values(node.props)) walk(value, visit, seen);
}

function statusText(tree) {
  let value = "";
  walk(tree, (node) => {
    if (node.props?.role === "status")
      value = textOf(node.props.children).replace(/\s+/g, " ").trim();
  });
  return value;
}

function buttonNamed(tree, label) {
  let found = null;
  walk(tree, (node) => {
    if (node.props?.disabled || typeof node.props?.onClick !== "function")
      return;
    if (textOf(node.props.children).trim() === label) found = node;
  });
  return found;
}

function fieldValue(tree, name) {
  let value = null;
  walk(tree, (node) => {
    if (node.props?.name !== name || node.props.type === "radio") return;
    value =
      node.props.type === "checkbox" ? node.props.checked : node.props.value;
  });
  return value;
}

function formLocked(tree) {
  let locked = false;
  walk(tree, (node) => {
    if (node.type === "fieldset" && typeof node.props?.disabled === "boolean")
      locked = node.props.disabled;
  });
  return locked;
}

async function editorScreen(extra = {}, props = {}) {
  if (!globalThis.document)
    globalThis.document = {
      getElementById() {
        return null;
      },
    };
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (callback) => {
      queueMicrotask(callback);
      return 1;
    };
    globalThis.cancelAnimationFrame = () => {};
  }
  const world = harness(extra);
  const navigated = [];
  const router = {
    push(href) {
      navigated.push(href);
    },
    replace(href) {
      navigated.push(href);
    },
    refresh() {
      navigated.push("refresh");
    },
  };
  const slots = [];
  const refList = [];
  const effects = new Map();
  let hookIndex = 0;
  let tree = null;
  let scheduled = false;
  let planned = [];
  function enqueue() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      commit();
    });
  }
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (slots[index] === undefined)
        slots[index] = {
          value: typeof initial === "function" ? initial() : initial,
        };
      const slot = slots[index];
      return [
        slot.value,
        (next) => {
          const value = typeof next === "function" ? next(slot.value) : next;
          if (Object.is(slot.value, value)) return;
          slot.value = value;
          enqueue();
        },
      ];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (slots[index] === undefined) {
        slots[index] = { current: initial };
        refList.push(slots[index]);
      }
      return slots[index];
    },
    useId() {
      const index = hookIndex++;
      if (slots[index] === undefined) slots[index] = `r${index}`;
      return slots[index];
    },
    useEffect(fn, deps) {
      planned.push({ kind: "effect", index: hookIndex++, fn, deps });
    },
    useLayoutEffect(fn, deps) {
      planned.push({ kind: "layout", index: hookIndex++, fn, deps });
    },
  };
  function sameDeps(left, right) {
    return (
      left &&
      right &&
      left.length === right.length &&
      left.every((item, index) => Object.is(item, right[index]))
    );
  }
  function runPlanned(kind) {
    for (const item of planned) {
      if (item.kind !== kind) continue;
      const previous = effects.get(item.index);
      if (previous && sameDeps(previous.deps, item.deps)) continue;
      previous?.cleanup?.();
      effects.set(item.index, {
        ...item,
        cleanup: item.fn() ?? null,
      });
    }
  }
  const ui = load(
    "components/contents/editor.tsx",
    {
      react,
      "react/jsx-runtime": {
        Fragment: "fragment",
        jsx: (type, props, key) => ({ type, props, key }),
        jsxs: (type, props, key) => ({ type, props, key }),
      },
      "next/link": {
        __esModule: true,
        default: (props) => ({ type: "a", props }),
      },
      "next/navigation": { useRouter: () => router },
      "@/components/ui/button": {
        Button: (props) => ({ type: "button", props }),
      },
      "@/components/ui/modal": {
        Modal: (props) => ({ type: "modal", props }),
      },
      "@/lib/contents/actions": world.actions,
      "@/lib/contents/rules": rules,
      "@/lib/contents/submit": load("lib/contents/submit.ts"),
    },
    { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  );
  function commit() {
    hookIndex = 0;
    planned = [];
    const current = world.state.rows[0];
    tree = ui.ContentEditor({
      initial: current ? { ...current } : null,
      returnTo: "/admin/contents",
      saved: false,
      ...props,
    });
    runPlanned("layout");
    runPlanned("effect");
  }
  async function drain() {
    const marked = navigated.length;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await Promise.resolve();
      const moved = navigated.length > marked;
      if (!scheduled && (statusText(tree) !== "처리 중…" || moved)) return;
    }
    throw Error(
      `편집 화면이 끝나지 않았습니다: ${statusText(tree)} rows=${world.state.rows.length} deletes=${kindCount(world.state, "delete")} paths=${world.paths.length} nav=${navigated.join("|")}`,
    );
  }
  const screen = {
    world,
    navigated,
    refs: refList,
    tree: () => tree,
    status: () => statusText(tree),
    locked: () => formLocked(tree),
    value: (name) => fieldValue(tree, name),
    baseline() {
      return refList.find(
        (item) => item.current?.updated_at && item.current?.id,
      );
    },
    async click(label) {
      const button = buttonNamed(tree, label);
      assert.ok(button, `${label} 버튼을 찾지 못했습니다.`);
      button.props.onClick({ preventDefault() {} });
      await drain();
    },
    async fill(name, value) {
      let target = null;
      walk(tree, (node) => {
        if (
          node.props?.name !== name ||
          typeof node.props?.onChange !== "function"
        )
          return;
        if (node.props.type === "radio") {
          if (node.props.value === value) target = node;
          return;
        }
        target = node;
      });
      const seen = [];
      walk(tree, (node) => {
        const kind =
          typeof node.type === "function" ? node.type.name : node.type;
        if (kind === "input" || kind === "label" || node.props?.name)
          seen.push(
            `${kind}:${node.props?.name || ""}:${node.props?.type || ""}`,
          );
      });
      assert.ok(target, `${name} [${seen.join(", ")}]`);
      if (target.props.type === "checkbox")
        target.props.onChange({ target: { checked: value } });
      else target.props.onChange({ target: { value } });
      await drain();
    },
    async submit() {
      let form = null;
      walk(tree, (node) => {
        if (typeof node.props?.onSubmit === "function") form = node;
      });
      assert.ok(form, "저장 폼이 없습니다.");
      form.props.onSubmit({ preventDefault() {} });
      await drain();
    },
    async hide() {
      for (const item of effects.values()) {
        const cleanup = item.cleanup;
        item.cleanup = null;
        cleanup?.();
      }
      await drain();
    },
    async show() {
      for (const item of effects.values()) item.cleanup = item.fn() ?? null;
      await drain();
    },
  };
  commit();
  await drain();
  return screen;
}

test("삭제 결과 확인은 조회와 캐시 재검증만 한다", async () => {
  const denied = harness({}, false);
  const deniedResult = await denied.actions.confirmContentDeletion(id, version);
  assert.equal(deniedResult.message, "관리자 권한이 필요합니다.");
  assert.equal(denied.clients(), 0);
  assert.equal(denied.state.calls.length, 0);

  const missing = harness({ rows: [] });
  const gone = await missing.actions.confirmContentDeletion(id, version);
  assert.equal(gone.deleted, true);
  assert.equal(gone.message, confirmedGoneText);
  assert.deepEqual(missing.paths, [
    "/contents",
    "/admin/contents",
    `/admin/contents/${id}`,
  ]);
  assert.equal(
    missing.state.calls.every((call) => call.kind === "select"),
    true,
  );

  const same = harness();
  const kept = await same.actions.confirmContentDeletion(id, version);
  assert.equal(kept.unchanged, true);
  assert.equal(kept.message, unchangedText);
  assert.equal(same.paths.length, 0);
  assert.equal(same.state.rows[0].title, "테스트 제목");
  assert.equal(
    same.state.calls.every((call) => call.kind === "select"),
    true,
  );

  const changed = harness();
  changed.state.rows[0].title = "서버에서 바꾼 제목";
  changed.state.rows[0].updated_at = nextVersion;
  const conflict = await changed.actions.confirmContentDeletion(id, version);
  assert.equal(conflict.state, "conflict");
  assert.equal(conflict.message, conflictText);
  assert.equal(conflict.row, undefined);
  assert.equal(changed.paths.length, 0);
  assert.equal(changed.state.rows[0].title, "서버에서 바꾼 제목");
  assert.equal(
    changed.state.calls.every((call) => call.kind === "select"),
    true,
  );

  const broken = harness({ readError: { code: "XX000" } });
  const unreadable = await broken.actions.confirmContentDeletion(id, version);
  assert.equal(unreadable.state, "unknown");
  assert.equal(broken.paths.length, 0);
  assert.equal(
    broken.state.calls.every((call) => call.kind === "select"),
    true,
  );
});

test("삭제 반영 후 응답이 끊기면 재확인이 목록 이동과 별도로 캐시를 다시 검증한다", async () => {
  const screen = await editorScreen({ loseDelete: "after" });
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  assert.match(screen.status(), /확인하지 못했습니다/);
  assert.equal(screen.world.state.rows.length, 0);
  assert.equal(screen.world.paths.length, 0);
  const deletes = kindCount(screen.world.state, "delete");
  assert.equal(deletes, 1);
  await screen.hide();
  await screen.show();
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(kindCount(screen.world.state, "update"), 0);
  assert.equal(kindCount(screen.world.state, "insert"), 0);
  assert.equal(screen.navigated.includes("refresh"), false);
  await screen.click("저장 결과 다시 확인");
  await screen.show();
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(kindCount(screen.world.state, "update"), 0);
  assert.equal(kindCount(screen.world.state, "insert"), 0);
  assert.deepEqual(screen.world.paths, [
    "/contents",
    "/admin/contents",
    `/admin/contents/${id}`,
  ]);
  assert.equal(screen.navigated.at(-1), "/admin/contents?notice=deleted");
  assert.equal(screen.status(), confirmedGoneText);
});

test("삭제 미반영 후 버전이 바뀌면 재확인은 충돌이고 입력은 유지된다", async () => {
  const screen = await editorScreen({ loseDelete: "before" });
  await screen.fill("title", "유지할 제목");
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  assert.match(screen.status(), /확인하지 못했습니다/);
  assert.equal(screen.world.state.rows.length, 1);
  screen.world.state.rows[0].title = "서버에서 바꾼 제목";
  screen.world.state.rows[0].updated_at = nextVersion;
  const deletes = kindCount(screen.world.state, "delete");
  await screen.click("저장 결과 다시 확인");
  assert.equal(screen.status(), conflictText);
  assert.equal(screen.value("title"), "유지할 제목");
  assert.equal(screen.baseline().current.title, "테스트 제목");
  assert.equal(screen.baseline().current.updated_at, version);
  assert.equal(screen.world.state.rows[0].title, "서버에서 바꾼 제목");
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(kindCount(screen.world.state, "update"), 0);
  assert.equal(screen.world.paths.length, 0);
  assert.equal(screen.navigated.length, 0);
});

test("삭제 재확인은 편집 중인 기준이 아니라 요청 당시 행을 본다", async () => {
  const screen = await editorScreen({
    loseDelete: "after",
    rows: [row(), row({ id: otherId, title: "다른 콘텐츠" })],
  });
  await screen.fill("title", "재확인 중에 바뀐 입력");
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  assert.match(screen.status(), /확인하지 못했습니다/);
  const baseline = screen.baseline();
  baseline.current = {
    ...baseline.current,
    id: otherId,
    updated_at: nextVersion,
    title: "다른 콘텐츠",
  };
  const deletes = kindCount(screen.world.state, "delete");
  await screen.click("저장 결과 다시 확인");
  await screen.show();
  assert.equal(screen.status(), confirmedGoneText);
  assert.equal(screen.value("title"), "재확인 중에 바뀐 입력");
  assert.equal(
    screen.world.state.rows.some((item) => item.id === otherId),
    true,
  );
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.deepEqual(screen.world.paths, [
    "/contents",
    "/admin/contents",
    `/admin/contents/${id}`,
  ]);
});

test("같은 버전이 남아 있으면 삭제를 다시 시도할 수 있다", async () => {
  const drifted = await editorScreen({ loseDelete: "before" });
  await drifted.fill("title", "유지할 제목");
  await drifted.click("삭제 전 확인");
  await drifted.click("확인 후 처리");
  drifted.baseline().current = {
    ...drifted.baseline().current,
    updated_at: nextVersion,
  };
  const driftedDeletes = kindCount(drifted.world.state, "delete");
  await drifted.click("저장 결과 다시 확인");
  assert.equal(drifted.status(), unchangedText);
  assert.equal(drifted.value("title"), "유지할 제목");
  assert.equal(drifted.world.state.rows[0].updated_at, version);
  assert.equal(kindCount(drifted.world.state, "delete"), driftedDeletes);
  assert.equal(drifted.world.paths.length, 0);
  assert.equal(drifted.locked(), false);

  const screen = await editorScreen({ loseDelete: "before" });
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  const deletes = kindCount(screen.world.state, "delete");
  await screen.click("저장 결과 다시 확인");
  assert.equal(screen.status(), unchangedText);
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  await screen.show();
  assert.equal(screen.status(), "콘텐츠를 삭제했습니다.");
  assert.equal(kindCount(screen.world.state, "delete"), deletes + 1);
  assert.equal(screen.world.state.rows.length, 0);
});

test("삭제 재확인 조회가 실패하면 완료나 미반영으로 단정하지 않는다", async () => {
  const screen = await editorScreen({ loseDelete: "before" });
  await screen.click("삭제 전 확인");
  await screen.click("확인 후 처리");
  screen.world.state.readError = { code: "XX000" };
  const deletes = kindCount(screen.world.state, "delete");
  await screen.click("저장 결과 다시 확인");
  assert.match(screen.status(), /확인하지 못했습니다/);
  assert.equal(screen.status().includes("반영되지 않았습니다"), false);
  assert.equal(screen.status().includes(confirmedGoneText), false);
  assert.equal(screen.locked(), true);
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(screen.world.paths.length, 0);
  screen.world.state.readError = null;
  await screen.click("저장 결과 다시 확인");
  assert.equal(screen.status(), unchangedText);
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(screen.world.paths.length, 0);
});

test("숨긴 확인창은 닫히고 복원만으로 콘텐츠를 쓰지 않는다", async () => {
  const screen = await editorScreen();
  await screen.click("삭제 전 확인");
  assert.ok(buttonNamed(screen.tree(), "확인 후 처리"));
  const deletes = kindCount(screen.world.state, "delete");
  await screen.hide();
  assert.equal(buttonNamed(screen.tree(), "확인 후 처리"), null);
  await screen.show();
  assert.equal(buttonNamed(screen.tree(), "확인 후 처리"), null);
  assert.equal(kindCount(screen.world.state, "delete"), deletes);
  assert.equal(kindCount(screen.world.state, "update"), 0);
  assert.equal(kindCount(screen.world.state, "insert"), 0);
  assert.equal(screen.navigated.length, 0);
});

test("신규 저장 응답 유실과 연속 저장은 한 편집 화면에서 유지된다", async () => {
  const created = await editorScreen({ rows: [], loseInsert: true });
  await created.fill("title", "응답 유실 제목");
  await created.fill("channel", "blog");
  await created.submit();
  await created.click("확인 후 처리");
  assert.match(created.status(), /확인하지 못했습니다/);
  assert.equal(kindCount(created.world.state, "insert"), 1);
  await created.click("저장 결과 다시 확인");
  await created.show();
  assert.equal(created.status(), "저장 결과를 확인했습니다.");
  assert.equal(kindCount(created.world.state, "insert"), 1);
  assert.equal(created.navigated.length, 1);

  const screen = await editorScreen();
  await screen.fill("is_published", true);
  await screen.submit();
  await screen.click("확인 후 처리");
  assert.equal(screen.world.state.rows[0].is_published, true);
  await screen.fill("is_published", false);
  await screen.submit();
  await screen.click("확인 후 처리");
  assert.equal(screen.world.state.rows[0].is_published, false);
  await screen.fill("is_published", true);
  await screen.submit();
  await screen.click("확인 후 처리");
  assert.equal(screen.world.state.rows[0].is_published, true);
  assert.equal(kindCount(screen.world.state, "update"), 3);
  assert.equal(kindCount(screen.world.state, "delete"), 0);
  assert.equal(screen.navigated.includes("refresh"), false);
});
