import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const root = new URL("../", import.meta.url);

function load(file) {
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
  )(() => {
    throw Error("unexpected import");
  }, exports);
  return exports;
}

const content = load("lib/classes/content.ts");
const inquiry = load("lib/classes/inquiry.ts");
const paths = load("lib/site-path.ts");
const chrome = readFileSync(
  new URL("components/site-chrome.tsx", root),
  "utf8",
);
const rules = readFileSync(new URL("lib/classes/rules.ts", root), "utf8");
const detail = readFileSync(
  new URL("components/classes/detail-body.tsx", root),
  "utf8",
);

test("class detail hides shared chrome and the list does not", () => {
  assert.equal(
    paths.isClassDetailPath("/class/11111111-1111-4111-8111-111111111111"),
    true,
  );
  assert.equal(
    paths.isClassDetailPath("/class/11111111-1111-4111-8111-111111111111/"),
    true,
  );
  assert.equal(paths.isClassDetailPath("/class/sample?from=list"), true);
  assert.equal(paths.isClassDetailPath("/class"), false);
  assert.equal(paths.isClassDetailPath("/class/"), false);
  assert.equal(paths.isClassDetailPath("/class/sample/extra"), false);
  assert.equal(paths.isClassDetailPath("/admin/classes/sample"), false);
  assert.equal(paths.isClassDetailPath(null), false);
  assert.equal(paths.isAiSajuResultPath("/ai-saju/result"), true);
  assert.equal(paths.isAiSajuResultPath("/ai-saju/result/"), true);
  assert.equal(paths.isAiSajuResultPath("/ai-saju/result?from=list"), true);
  assert.equal(paths.isAiSajuResultPath("/ai-saju"), false);
  assert.equal(paths.isAiSajuResultPath(null), false);
  assert.equal(paths.hidesSharedSiteChrome("/consult/gayeon"), true);
  assert.equal(paths.hidesSharedSiteChrome("/class/sample"), true);
  assert.equal(paths.hidesSharedSiteChrome("/class"), false);
  assert.equal(paths.hidesSharedSiteChrome("/ai-saju/result"), true);
  assert.equal(paths.hidesSharedSiteChrome("/ai-saju"), false);
  assert.match(chrome, /hidesSharedSiteChrome/);
  assert.equal(chrome.includes("isCounselorDetailPath"), false);
  assert.equal(chrome.includes("isAiSajuResultPath"), false);
  assert.equal(chrome.includes("isClassDetailPath"), false);
});

test("structured class text stays in html fields and free text still works", () => {
  const saju = content.parseClassContent(content.sajuClassDescription);
  assert.equal(saju.kind, "structured");
  assert.equal(saju.instructors, "청남샘·가연샘");
  assert.equal(saju.duration, "1년");
  assert.equal(saju.schedule, "주 2회 2시간");
  assert.deepEqual(
    saju.curriculum.map((item) => item.title),
    ["기초", "중급", "고급", "실전상담"],
  );
  assert.deepEqual(saju.learnings, [
    "사주명리 이론부터",
    "실전 해석과 상담 스킬까지",
    "바로 현장에서 활용 가능한 전문가 과정",
  ]);
  assert.equal(content.tuitionLabel(saju), "수강료 문의");
  const tarot = content.parseClassContent(content.tarotClassDescription);
  assert.equal(tarot.duration, "2개월 집중·피드백 3개월");
  assert.deepEqual(
    tarot.options.map((option) => [
      option.name,
      option.instructor,
      option.schedule,
    ]),
    [
      ["유니버셜 웨이트 타로", "가연샘", "주 2회 2시간"],
      ["사주오라클카드", "청남샘", "주 1회 2시간"],
      ["만신타로/19금타로 전문과정", "", "과정 중 선택"],
    ],
  );
  assert.deepEqual(tarot.learnings, [
    "유니버셜 웨이트 타로",
    "사주오라클카드",
    "만신타로/19금타로 전문과정 중 선택",
  ]);
  assert.equal(content.tuitionLabel(tarot), "수강료 문의");
  assert.match(detail, /이런 걸 배워요/);
  assert.match(detail, /content\.learnings/);
  assert.equal(detail.includes("사주명리 이론부터"), false);
  assert.equal(detail.includes("유니버셜 웨이트 타로"), false);
  const free = content.parseClassContent("첫째 줄\n둘째 줄");
  assert.equal(free.kind, "free");
  assert.equal(free.body, "첫째 줄\n둘째 줄");
  assert.equal(content.tuitionLabel(free), "수강료 문의");
  assert.equal(content.deliveryLabel(true), "온라인");
  assert.equal(content.deliveryLabel(false), "오프라인");
});

test("class inquiry uses the approved business number", () => {
  assert.equal(inquiry.classInquiryPhoneDisplay, "0507-1498-0232");
  assert.equal(inquiry.classInquiryPhoneHref, "tel:050714980232");
  assert.equal(inquiry.classInquiryLabel, "수강 문의");
  assert.equal(inquiry.classInquiryPhoneHref.includes("0000"), false);
  assert.equal(rules.includes("siteConfig.phone"), false);
});
