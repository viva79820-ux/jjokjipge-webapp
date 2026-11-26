import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const memberId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const reservationId = "11111111-1111-4111-8111-111111111111";
const counselorId = "44444444-4444-4444-8444-444444444444";

function load(specifier, adapters) {
  const cache = new Map();
  function resolveFile(name, parent) {
    const raw = name.startsWith("@/")
      ? new URL(`../${name.slice(2)}`, import.meta.url)
      : new URL(name, parent);
    const path = fileURLToPath(raw);
    const found = [path, `${path}.ts`, `${path}.tsx`].find((item) =>
      existsSync(item),
    );
    if (!found) throw new Error(`Missing module: ${name}`);
    return found;
  }
  function instantiate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const commonjs = { exports: {} };
    cache.set(filename, commonjs);
    const parent = new URL(`file:///${filename.replaceAll("\\", "/")}`);
    new Function("require", "exports", "module", compiled)(
      (name) => {
        if (name in adapters) return adapters[name];
        if (name.startsWith(".") || name.startsWith("@/"))
          return instantiate(resolveFile(name, parent));
        throw new Error(`Unexpected dependency: ${name}`);
      },
      commonjs.exports,
      commonjs,
    );
    return commonjs.exports;
  }
  return instantiate(resolveFile(specifier, import.meta.url));
}

const rules = load("../lib/reviews/member-rules.ts", {});
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");

function reservation(overrides = {}) {
  return {
    id: reservationId,
    user_id: memberId,
    status: "completed",
    counselor_id: counselorId,
    customer_name: "예약 고객",
    ...overrides,
  };
}

test("작성 자격은 완료된 본인 예약만 허용한다", () => {
  assert.equal(rules.reviewEligibility(reservation(), memberId), "eligible");
  assert.equal(
    rules.reviewEligibility(reservation({ user_id: null }), memberId),
    "missing",
  );
  assert.equal(
    rules.reviewEligibility(reservation({ user_id: otherId }), memberId),
    "missing",
  );
  assert.equal(rules.reviewEligibility(null, memberId), "missing");
  for (const status of ["confirmed", "pending_payment", "cancelled"]) {
    assert.equal(
      rules.reviewEligibility(reservation({ status }), memberId),
      "incomplete",
    );
  }
  assert.equal(
    rules.reviewEligibility(reservation({ customer_name: "   " }), memberId),
    "invalid",
  );
  assert.equal(
    rules.reviewVisibilityLabel({
      is_published: false,
      hidden_by_admin: true,
    }),
    "관리자에 의해 숨겨짐",
  );
  assert.equal(
    rules.reviewVisibilityLabel({
      is_published: true,
      hidden_by_admin: false,
    }),
    "공개",
  );
  assert.equal(
    rules.reviewVisibilityLabel({
      is_published: false,
      hidden_by_admin: false,
    }),
    "비공개",
  );
});

test("후기 입력은 별점, 본문, 공개 동의만 받는다", () => {
  const form = new FormData();
  form.set("rating", "5");
  form.set("body", "  상담이 좋았어요.  ");
  form.set("publish_consent", "true");
  assert.deepEqual(rules.parseReviewDraft(form), {
    ok: true,
    value: { rating: 5, body: "상담이 좋았어요.", publishConsent: true },
  });

  const privateDraft = new FormData();
  privateDraft.set("rating", "1");
  privateDraft.set("body", "비공개");
  assert.equal(
    rules.parseReviewDraft(privateDraft).value.publishConsent,
    false,
  );

  const invalid = new FormData();
  invalid.set("rating", "6");
  invalid.set("body", "   ");
  const parsed = rules.parseReviewDraft(invalid);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.fieldErrors.rating, "별점을 선택해 주세요.");
  assert.equal(parsed.fieldErrors.body, "후기 내용을 입력해 주세요.");
});

function formData(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("reservation_id", reservationId);
  return form;
}

function actionHarness(steps) {
  const calls = [];
  let index = 0;
  const take = () => {
    const step = steps[index];
    index += 1;
    if (!step) throw new Error(`missing step ${index}`);
    return step;
  };
  const query = () => {
    const builder = {
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      insert(payload) {
        calls.push(["insert", payload]);
        return builder;
      },
      update(payload) {
        calls.push(["update", payload]);
        return builder;
      },
      delete() {
        calls.push(["delete"]);
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(take());
      },
      then(resolve, reject) {
        return Promise.resolve(take()).then(resolve, reject);
      },
    };
    return builder;
  };
  const redirects = [];
  const actions = load("../lib/reviews/member-actions.ts", {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "next/navigation": {
      redirect(path) {
        redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/member-auth/session": {
      getMember: async () => ({
        id: memberId,
        email: "member@example.invalid",
        name: "회원",
        phone: null,
      }),
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from(table) {
          calls.push(["from", table]);
          return query();
        },
        rpc(name) {
          calls.push(["rpc", name]);
          return Promise.resolve(take());
        },
      }),
    },
  });
  return { ...actions, calls, redirects };
}

const eligibleRow = {
  data: {
    ...reservation(),
    product_name: "사주 30분",
    counselors: { name: "상담사 A" },
  },
  error: null,
};

test("자격 없는 예약과 타인·비회원 예약은 저장하지 않는다", async () => {
  const incomplete = actionHarness([
    { data: { ...eligibleRow.data, status: "confirmed" }, error: null },
  ]);
  const denied = await incomplete.createMyReview(
    { status: "idle", message: "" },
    formData({ rating: "5", body: "후기" }),
  );
  assert.equal(denied.message, "상담이 완료된 예약에만 후기를 쓸 수 있어요.");
  assert.equal(
    incomplete.calls.some((call) => call[0] === "insert"),
    false,
  );

  const hidden = actionHarness([{ data: null, error: null }]);
  const missing = await hidden.createMyReview(
    { status: "idle", message: "" },
    formData({ rating: "5", body: "후기" }),
  );
  assert.equal(missing.message, "본인 예약이 아니거나 후기를 쓸 수 없어요.");
  assert.equal(
    hidden.calls.some((call) => call[0] === "insert"),
    false,
  );
});

test("같은 예약의 중복 후기와 데이터베이스 거부를 막는다", async () => {
  const duplicate = actionHarness([
    eligibleRow,
    {
      data: [
        {
          id: counselorId,
          reservation_id: reservationId,
          counselor_id: counselorId,
          counselor_name: "상담사 A",
          rating: 5,
          body: "기존 후기",
          is_published: true,
          publish_consent: true,
          hidden_by_admin: false,
          created_at: "2026-11-25T00:00:00.000Z",
          updated_at: "2026-11-25T00:00:00.000Z",
        },
      ],
      error: null,
    },
  ]);
  const duplicated = await duplicate.createMyReview(
    { status: "idle", message: "" },
    formData({ rating: "4", body: "또 작성" }),
  );
  assert.equal(duplicated.message, "이미 이 예약의 후기를 작성했어요.");
  assert.equal(
    duplicate.calls.some((call) => call[0] === "insert"),
    false,
  );

  const conflict = actionHarness([
    eligibleRow,
    { data: [], error: null },
    { error: { code: "23505" } },
  ]);
  const raced = await conflict.createMyReview(
    { status: "idle", message: "" },
    formData({ rating: "4", body: "동시 작성", publish_consent: "true" }),
  );
  assert.equal(raced.message, "이미 이 예약의 후기를 작성했어요.");
  assert.deepEqual(conflict.calls.find((call) => call[0] === "insert")[1], {
    counselor_id: counselorId,
    author_id: memberId,
    author_name: "예약 고객",
    rating: 4,
    body: "동시 작성",
    reservation_id: reservationId,
    publish_consent: true,
  });
});

test("화면은 완료 예약에서 후기를 쓰고 공개 이름은 가린다", () => {
  const history = read("../components/member-auth/reservation-history.tsx");
  const mypage = read("../app/(site)/mypage/page.tsx");
  const reviews = read("../components/member-auth/my-reviews.tsx");
  const card = read("../components/reviews/card.tsx");
  const actions = read("../lib/reviews/member-actions.ts");
  assert.match(history, /후기 쓰기/);
  assert.match(history, /canWriteReview/);
  assert.match(
    read("../lib/reviews/member-rules.ts"),
    /status === "completed"/,
  );
  assert.match(mypage, /내 후기|MyReviews/);
  assert.match(reviews, /관리자에 의해 숨겨짐|reviewVisibilityLabel/);
  assert.match(reviews, /작성일/);
  assert.match(reviews, /공개 여부/);
  assert.match(card, /maskReviewAuthor/);
  assert.doesNotMatch(actions, /SUPABASE_SECRET_KEY|createAdminClient/);
});

test("후기 쓰기 진입은 목록과 빈 마이페이지에서 찾을 수 있다", () => {
  assert.equal(rules.reviewWriteHref(true), "/mypage/reviews/new");
  assert.equal(
    rules.reviewWriteHref(false),
    "/login?next=%2Fmypage%2Freviews%2Fnew",
  );
  assert.equal(
    rules.canWriteReview({ id: "a", status: "completed" }, new Set()),
    true,
  );
  assert.equal(
    rules.canWriteReview({ id: "a", status: "completed" }, new Set(["a"])),
    false,
  );
  assert.equal(
    rules.canWriteReview({ id: "a", status: "pending_payment" }, new Set()),
    false,
  );
  assert.equal(
    rules.noWritableReviewMessage,
    "완료된 상담·주문이 있으면 후기를 남길 수 있어요.",
  );
  const publicPage = read("../components/reviews/public-page.tsx");
  const myReviews = read("../components/member-auth/my-reviews.tsx");
  const entry = read("../app/(site)/mypage/reviews/new/page.tsx");
  const login = read("../app/(site)/login/page.tsx");
  const loginForm = read("../components/member-auth/login-form.tsx");
  assert.match(publicPage, /운세통 후기/);
  assert.match(publicPage, /후기 쓰기/);
  assert.match(publicPage, /reviewWriteHref/);
  assert.match(myReviews, /작성한 후기가 없어요/);
  assert.match(myReviews, /후기 쓰기/);
  assert.match(myReviews, /noWritableReviewMessage/);
  assert.match(entry, /reviewWriteHref\(false\)/);
  assert.match(entry, /canWriteReview/);
  assert.match(login, /safeNext/);
  assert.match(loginForm, /name="next"/);
});
