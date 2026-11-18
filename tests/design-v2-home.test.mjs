import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { formatStorePriceAmounts } from "../components/store/present.ts";
import {
  homeBannerCounselors,
  visibleCareers,
} from "../lib/home/counselors.ts";
import { homeNoticeFromList } from "../lib/home/notice.ts";
import { storePriceConfig } from "../lib/store-price-config.ts";

const ts = createRequire(import.meta.url)("typescript");

function loadMenu() {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL("../lib/home/menu.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((id) => {
    if (id === "@/components/store/present") return { formatStorePriceAmounts };
    if (id === "@/lib/store-price-config") return { storePriceConfig };
    throw new Error(id);
  }, exports);
  return exports;
}

const { homeStoreMenuItems, homeStoreMenuKeys, homeStorePriceNotice } =
  loadMenu();

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("사진 있는 추천 상담사만 배너에 남고 빈 경력은 만들지 않는다", () => {
  const people = [
    { id: "photo", isRecommended: true, imageUrl: "https://cdn.example/a.jpg" },
    { id: "blank", isRecommended: true, imageUrl: null },
    {
      id: "other",
      isRecommended: false,
      imageUrl: "https://cdn.example/b.jpg",
    },
  ];
  assert.deepEqual(
    homeBannerCounselors(people).map((item) => item.id),
    ["photo"],
  );
  assert.deepEqual(visibleCareers(["  사주 10년  ", "", "   "]), ["사주 10년"]);
  assert.deepEqual(visibleCareers(["  하나  ", "둘", "셋"]), [
    "하나",
    "둘",
    "셋",
  ]);
  assert.deepEqual(visibleCareers([]), []);
});

test("배너 경력은 두 줄로 제한하고 푸터는 3호점까지 적는다", () => {
  const banner = read("../components/home/banner.tsx");
  const footer = read("../components/home/footer.tsx");
  const detail = read("../app/(site)/consult/[id]/page.tsx");
  assert.equal(banner.includes("line-clamp-2"), true);
  assert.equal(banner.includes(".slice("), false);
  assert.equal(footer.includes("1호점 · 2호점 · 3호점"), true);
  assert.equal(footer.includes("[대표자명]"), true);
  assert.equal(footer.includes("[매장 주소]"), true);
  assert.equal(detail.includes("line-clamp"), false);
});

test("홈 매장 메뉴는 설정 금액과 단위를 그대로 읽는다", () => {
  const items = homeStoreMenuItems();
  assert.deepEqual(
    items.map((item) => item.key),
    [...homeStoreMenuKeys],
  );
  for (const item of items) {
    const source = storePriceConfig.items.find(
      (entry) => entry.key === item.key,
    );
    assert.equal(item.price, formatStorePriceAmounts(source.amounts));
    assert.equal(item.name, source.name);
  }
  const price = Object.fromEntries(items.map((item) => [item.key, item.price]));
  assert.match(price.saju, /일반/);
  assert.match(price.saju, /중고등/);
  assert.match(price["compatibility-two"], /2인/);
  assert.match(price["tarot-one-shuffle"], /일반/);
  assert.match(price["tarot-one-shuffle"], /중고등/);
  assert.match(price["saju-tarot-one-shuffle"], /1셔플/);
  assert.equal(price.naming.includes("40,000"), false);
  assert.equal(homeStorePriceNotice.includes("확인 중인"), true);
  assert.equal(homeStorePriceNotice === storePriceConfig.notice, false);
  assert.equal(
    homeStorePriceNotice.includes(storePriceConfig.excludedUse),
    false,
  );
});

test("비공개 공지와 빈 제목은 홈 한 줄로 넘기지 않는다", () => {
  assert.deepEqual(
    homeNoticeFromList({
      id: "11111111-1111-4111-8111-111111111111",
      title: "  고정 공개 공지  ",
      is_published: true,
    }),
    {
      status: "ready",
      id: "11111111-1111-4111-8111-111111111111",
      title: "고정 공개 공지",
    },
  );
  assert.equal(
    homeNoticeFromList({
      id: "22222222-2222-4222-8222-222222222222",
      title: "비공개공지노출금지",
      is_published: false,
    }).status,
    "empty",
  );
  assert.equal(
    homeNoticeFromList({ id: "x", title: "   ", is_published: true }).status,
    "empty",
  );
  assert.equal(homeNoticeFromList(null).status, "empty");
});

test("홈 화면 소스에 시안 샘플과 개발 지침 문장을 넣지 않는다", () => {
  const files = [
    "../app/(site)/page.tsx",
    "../components/home/banner.tsx",
    "../components/home/categories.tsx",
    "../components/home/store-band.tsx",
    "../components/home/recommend.tsx",
    "../components/home/store-menu.tsx",
    "../components/home/directory.tsx",
    "../components/home/notice-line.tsx",
    "../components/home/footer.tsx",
    "../lib/home/menu.ts",
  ].map(read);
  const source = files.join("\n");
  for (const blocked of [
    "인기 상담",
    "야간반",
    "가연",
    "1번",
    "휴무",
    "전화상담 전용",
    "30,000",
    "30000",
    "이용약관",
    "개인정보처리방침",
    storePriceConfig.notice,
    storePriceConfig.excludedUse,
    storePriceConfig.source,
  ]) {
    assert.equal(source.includes(blocked), false, blocked);
  }
});
