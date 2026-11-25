import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const ts = createRequire(import.meta.url)("typescript");

function load(file) {
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
  )(() => {
    throw new Error("unexpected import");
  }, exports);
  return exports;
}

const { hidesSharedSiteChrome, isAiSajuResultPath, isCounselorDetailPath } =
  load("../lib/site-path.ts");

test("결과 화면만 공통 헤더와 하단 탭을 숨기고 상담사 상세도 유지한다", () => {
  assert.equal(isAiSajuResultPath("/ai-saju/result"), true);
  assert.equal(isAiSajuResultPath("/ai-saju/result/"), true);
  assert.equal(isAiSajuResultPath("/ai-saju/result?from=demo"), true);
  assert.equal(isAiSajuResultPath("/ai-saju"), false);
  assert.equal(isAiSajuResultPath("/ai-saju/result/extra"), false);
  assert.equal(isAiSajuResultPath(null), false);
  assert.equal(hidesSharedSiteChrome("/ai-saju/result"), true);
  assert.equal(hidesSharedSiteChrome("/ai-saju"), false);
  assert.equal(hidesSharedSiteChrome("/consult/gayeon"), true);
  assert.equal(hidesSharedSiteChrome("/consult"), false);
  assert.equal(isCounselorDetailPath("/consult/gayeon"), true);

  const chrome = read("components/site-chrome.tsx");
  assert.equal(chrome.split("hidesSharedSiteChrome").length - 1, 3);
  assert.equal(chrome.includes("isCounselorDetailPath"), false);
});

test("입력은 화면에만 있고 예시 결과와 상담 연결은 고정 경로다", () => {
  const page = read("app/(site)/ai-saju/page.tsx");
  const form = read("components/ai-saju/input-form.tsx");
  const resultPage = read("app/(site)/ai-saju/result/page.tsx");
  const result = read("components/ai-saju/result-screen.tsx");

  for (const label of ["타고난 성향", "올해 운세", "연애·인연", "재물·직업"]) {
    assert.match(form, new RegExp(label));
  }
  for (const label of ["이름 (선택)", "성별", "양력", "음력", "태어난 시간"]) {
    assert.equal(form.includes(label), true, label);
  }
  assert.match(form, /음력 윤달이에요/);
  assert.match(form, /태어난 시간을 몰라요/);
  assert.match(
    form,
    /AI 사주는 준비 중이에요\. 실제 정보를 입력하지 않고 예시 결과를 볼 수\s*있어요\./,
  );
  assert.equal(form.includes("풀어 드려요"), false);
  assert.equal(form.includes("자세히"), false);
  assert.match(form, /동의 안내는 서비스 연결 후 제공돼요/);
  assert.match(form, /type="button"[\s\S]*disabled[\s\S]*준비 중/);
  assert.match(form, /href="\/ai-saju\/result"/);
  assert.equal(form.includes("<form"), false);
  assert.equal(form.includes("fetch("), false);
  assert.equal(form.includes("supabase"), false);
  assert.equal(form.includes("localStorage"), false);
  assert.equal(form.includes("action="), false);
  assert.equal(form.includes('name="'), false);
  assert.equal(page.includes("searchParams"), false);

  assert.match(result, /예시 결과 · 실제 내용은 AI 사주 서비스가 채움/);
  for (const label of ["시주", "일주", "월주", "연주"]) {
    assert.match(result, new RegExp(label));
  }
  assert.match(result, /오행 분포/);
  for (const name of ["목", "화", "토", "금", "수"]) {
    assert.match(result, new RegExp(`name: "${name}"`));
  }
  for (const title of ["타고난 성향", "올해 운세", "연애·인연", "재물·직업"]) {
    assert.match(result, new RegExp(`title: "${title}"`));
  }
  assert.match(result, /href="\/ai-saju"/);
  assert.match(result, /aria-label="뒤로"/);
  assert.match(result, /다른 사람 보기/);
  assert.match(result, /선생님께 상담/);
  assert.match(result, /전화상담 예약하기/);
  assert.equal(result.split('href="/consult"').length - 1, 2);
  assert.match(result, /CounselorDetailFrame/);
  assert.match(result, /data-booking-bar/);
  assert.match(result, /data-ai-saju-header/);
  assert.equal(result.includes("gayeon"), false);
  assert.equal(result.includes("fetch("), false);
  assert.equal(result.includes("supabase"), false);
  assert.equal(result.includes("searchParams"), false);
  assert.equal(result.includes("localStorage"), false);
  assert.equal(resultPage.includes("searchParams"), false);
  assert.equal(form.includes("CounselorDetailFrame"), false);
});

test("360px에서 입력 칸과 결과 하단 버튼이 화면 안에 들어간다", () => {
  const form = read("components/ai-saju/input-form.tsx");
  const result = read("components/ai-saju/result-screen.tsx");
  assert.equal(form.includes("whitespace-nowrap"), false);
  assert.equal(result.includes("whitespace-nowrap"), false);

  const content = 360 - 32;
  const cardInner = content - 36;
  const dateTrack = cardInner - 16;
  const year = (dateTrack * 1.3) / 3.3;
  const day = dateTrack / 3.3;
  assert.ok(year >= 5 * 15, `year ${year}`);
  assert.ok(day >= 2 * 15, `day ${day}`);

  const topicText = (content - 24) / 4 - 10;
  assert.ok(topicText > 13, `topic ${topicText}`);

  const barInner = content - 8;
  const secondary = barInner / 2.4;
  const primary = (barInner * 1.4) / 2.4;
  assert.ok(7 * 14 + 24 <= secondary, `secondary ${secondary}`);
  assert.ok(6 * 14 + 18 + 6 + 24 <= primary, `primary ${primary}`);

  const pillar = (cardInner - 24) / 4;
  assert.ok(pillar >= 26, `pillar ${pillar}`);
});
