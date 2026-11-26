import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");

function load(file, adapters = {}) {
  const exports = {};
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
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

const rules = load("../lib/reviews/rules.ts");
const naver = load("../lib/reviews/naver-links.ts");
const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-11-25T00:00:00.000000+00:00";

test("후기 목록 조건·주소·작성자 표시를 안전하게 만든다", () => {
  assert.deepEqual(rules.parseReviewQuery({}), { page: 1, status: "" });
  assert.deepEqual(rules.parseReviewQuery({ page: "2" }), {
    page: 2,
    status: "",
  });
  assert.deepEqual(rules.parseReviewQuery({ status: "private" }, true), {
    page: 1,
    status: "private",
  });
  for (const query of [
    { page: "0" },
    { page: ["1", "2"] },
    { status: "private" },
    { extra: "1" },
  ])
    assert.equal(rules.parseReviewQuery(query), null);
  assert.equal(
    rules.reviewListUrl(true, 3, "private"),
    "/admin/reviews?page=3&status=private",
  );
  assert.equal(rules.maskReviewAuthor("홍길동"), "홍*동");
  assert.equal(rules.maskReviewAuthor("천사"), "천*");
  assert.equal(rules.maskReviewAuthor("별"), "별*");
  assert.equal(rules.isUuid(id), true);
  assert.equal(rules.isUuid("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"), false);
});

test("상담사 또는 상품 대상을 구분하고 한국 날짜를 표시한다", () => {
  const base = {
    id,
    counselor_id: id,
    product_id: null,
    author_name: "작성자",
    rating: 5,
    body: "본문",
    is_published: true,
    created_at: "2026-11-24T15:30:00.000Z",
    updated_at: version,
    counselor: { name: "상담사 A" },
    product: null,
  };
  assert.deepEqual(rules.reviewTarget(base), {
    kind: "상담",
    name: "상담사 A",
  });
  assert.deepEqual(
    rules.reviewTarget({
      ...base,
      counselor_id: null,
      product_id: id,
      counselor: null,
      product: { name: "테스트 상품" },
    }),
    { kind: "상품", name: "테스트 상품" },
  );
  assert.equal(rules.formatReviewDate(base.created_at), "2026년 11월 25일");
  assert.equal(rules.formatReviewDate("invalid"), "");
});

test("운영 매장 두 곳의 네이버 방문자 리뷰 주소만 사용한다", () => {
  assert.deepEqual(
    naver.naverReviewLinks.map(({ storeName, placeId, href }) => ({
      storeName,
      placeId,
      href,
    })),
    [
      {
        storeName: "쪽집게천사 사주타로1,2호점",
        placeId: "38642438",
        href: "https://m.place.naver.com/place/38642438/review/visitor",
      },
      {
        storeName: "쪽집게 사주타로 천사3호점",
        placeId: "1420568589",
        href: "https://m.place.naver.com/place/1420568589/review/visitor",
      },
    ],
  );
});

function actionHarness({ admin = true, data = { id }, error = null } = {}) {
  const paths = [];
  let dbUses = 0;
  const query = {
    payload: null,
    filters: [],
    update(payload) {
      this.payload = payload;
      return this;
    },
    eq(...args) {
      this.filters.push(args);
      return this;
    },
    select() {
      return this;
    },
    async maybeSingle() {
      return { data, error };
    },
  };
  const actions = load("../lib/reviews/actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "@/lib/admin/auth": {
      requireAdmin: async () => (admin ? { userId: id } : null),
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        dbUses += 1;
        return { from: (table) => (assert.equal(table, "reviews"), query) };
      },
    },
    "./rules": rules,
  });
  return {
    ...actions,
    query,
    paths,
    get dbUses() {
      return dbUses;
    },
  };
}

function visibilityForm(extra = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id,
    version,
    is_published: "true",
    ...extra,
  }))
    form.set(key, value);
  return form;
}

test("관리자 공개 전환 액션은 권한·입력·버전과 변경 열을 제한한다", async () => {
  const denied = actionHarness({ admin: false });
  assert.equal(
    (await denied.changeReviewVisibility({}, visibilityForm())).state,
    "rejected",
  );
  assert.equal(denied.dbUses, 0);

  const invalid = actionHarness();
  assert.equal(
    (
      await invalid.changeReviewVisibility(
        {},
        visibilityForm({ id: "invalid" }),
      )
    ).state,
    "rejected",
  );
  assert.equal(invalid.dbUses, 0);

  const saved = actionHarness();
  const result = await saved.changeReviewVisibility({}, visibilityForm());
  assert.equal(result.state, "saved");
  assert.deepEqual(saved.query.payload, { is_published: true });
  assert.deepEqual(saved.query.filters, [
    ["id", id],
    ["updated_at", version],
  ]);
  assert.deepEqual(saved.paths, ["/reviews", "/admin/reviews"]);

  const conflict = actionHarness({ data: null });
  assert.equal(
    (await conflict.changeReviewVisibility({}, visibilityForm())).state,
    "conflict",
  );
});

test("공개 목록은 공개 후기만 최신순으로 DB에서 나눈다", async () => {
  const calls = [];
  const query = {
    steps: [],
  };
  for (const method of ["select", "eq", "order", "range"]) {
    query[method] = (...args) => {
      query.steps.push([method, ...args]);
      return query;
    };
  }
  query.then = (resolve) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
  const publicClient = {
    from(table) {
      calls.push(table);
      return query;
    },
  };
  const data = load("../lib/reviews/data.ts", {
    "server-only": {},
    "@/lib/admin/auth": { requireAdmin: async () => ({}) },
    "@/lib/supabase/public": { createPublicClient: () => publicClient },
    "@/lib/supabase/server": { createClient: async () => publicClient },
    "./rules": rules,
  });
  await data.reviewList(2);
  assert.deepEqual(calls, ["reviews"]);
  assert.ok(
    query.steps.some(
      (step) =>
        step[0] === "eq" && step[1] === "is_published" && step[2] === true,
    ),
  );
  assert.deepEqual(
    query.steps.filter((step) => step[0] === "order").map((step) => step[1]),
    ["created_at", "id"],
  );
  assert.deepEqual(
    query.steps.find((step) => step[0] === "range"),
    ["range", 20, 39],
  );
});

test("홈·관리자에서 후기 화면으로 진입하고 외부 링크를 새 창으로 연다", () => {
  const home = readFileSync(
    new URL("../components/home/directory.tsx", import.meta.url),
    "utf8",
  );
  const menu = readFileSync(
    new URL("../components/admin/menu-tabs.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../components/reviews/public-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /href="\/reviews"/);
  assert.match(home, /상담 후기 보기/);
  assert.match(menu, /\["후기", "\/admin\/reviews"\]/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /fetch\(|크롤/);
});
