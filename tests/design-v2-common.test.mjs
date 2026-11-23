import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootDir = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function filesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else if (/\.(ts|tsx|css)$/.test(name)) found.push(path);
  }
  return found;
}

test("화면·메타데이터·관리자 제목의 서비스 이름은 쪽집게천사 운세통이다", () => {
  const config = read("lib/site-config.ts");
  assert.match(config, /name: "쪽집게천사 운세통"/);
  const roots = ["app", "components", "lib"].map((dir) => join(rootDir, dir));
  const hits = [];
  for (const dir of roots) {
    for (const file of filesUnder(dir)) {
      if (readFileSync(file, "utf8").includes("운명나라")) hits.push(file);
    }
  }
  assert.deepEqual(hits, []);
  assert.match(read("app/layout.tsx"), /title: siteConfig\.name/);
  assert.match(
    read("app/admin/layout.tsx"),
    /title: `\$\{siteConfig\.name\} 관리자`/,
  );
  assert.match(
    read("app/admin/(panel)/layout.tsx"),
    /\{siteConfig\.name\} 관리자/,
  );
});

test("공통 헤더는 천사 로고와 20px 한 줄 이름이다", () => {
  const header = read("components/site-header.tsx");
  const css = read("app/globals.css");
  assert.match(header, /logo-angel-mark\.png/);
  assert.match(header, /h-8\.5/);
  assert.match(header, /h-15/);
  assert.match(header, /text-logo/);
  assert.match(header, /font-extrabold/);
  assert.match(header, /text-brand/);
  assert.match(header, /text-foreground/);
  assert.match(header, /siteConfig\.name\.split\(" "\)/);
  assert.equal(header.includes("text-fine"), false);
  assert.equal(header.includes("운명나라"), false);
  assert.match(css, /--text-logo:\s*20px/);
  assert.match(css, /--text-logo--line-height:\s*24px/);
});

test("상단 탭은 지정 순서로 가로 스크롤하고 AI 사주는 준비 중으로 간다", () => {
  const tabs = read("components/top-tabs.tsx");
  const found = [...tabs.matchAll(/\["([^"]+)", "([^"]+)"\]/g)].map((match) => [
    match[1],
    match[2],
  ]);
  assert.deepEqual(found, [
    ["전화상담", "/consult"],
    ["AI 사주", "/ai-saju"],
    ["클래스", "/class"],
    ["매장상담", "/stores"],
    ["타로샵", "/shop"],
    ["콘텐츠", "/contents"],
  ]);
  assert.match(tabs, /overflow-x-auto/);
  assert.match(tabs, /min-w-0/);
  assert.match(tabs, /shrink-0/);
  assert.match(tabs, /whitespace-nowrap/);
  assert.match(tabs, /px-4/);
  assert.equal(tabs.includes("flex-1"), false);
  const page = read("app/(site)/ai-saju/page.tsx");
  assert.match(page, /AI 사주는 준비 중입니다/);
  assert.match(page, /title: `AI 사주 \| \$\{siteConfig\.name\}`/);
  assert.equal(page.includes("<form"), false);
  assert.equal(page.includes("<input"), false);
  assert.equal(page.includes("<textarea"), false);
});

test("하단 탭 동작과 PC 560px 틀은 유지된다", () => {
  const bottom = read("components/bottom-tabs.tsx");
  for (const label of ["홈", "카테고리", "전화하기", "예약조회", "로그인"]) {
    assert.match(bottom, new RegExp(label));
  }
  assert.match(bottom, /tel:\$\{siteConfig\.phone\}/);
  assert.match(bottom, /appFixedBarClass/);
  const frame = read("lib/app-frame.ts");
  assert.match(frame, /max-w-app pc:max-w-pc/);
  const css = read("app/globals.css");
  assert.match(css, /--container-pc:\s*560px/);
  assert.match(css, /--container-app:\s*1024px/);
});

test("360px에서 헤더가 들어가고 여섯 탭은 스크롤되며 PC 560px 안에 있다", () => {
  const logoWidth = 34 * (592 / 450);
  const nameWidth = 8 * 20 * 1.08 + 10;
  const headerWidth = 32 + logoWidth + 8 + nameWidth + 8 + 44;
  assert.ok(headerWidth <= 360, `header ${headerWidth}`);

  const hangul = (count) => count * 15 * 1.08 + 32;
  const tabWidths = [
    hangul(4),
    24 + 4 + hangul(2),
    hangul(3),
    hangul(4),
    hangul(3),
    hangul(3),
  ];
  const tabsWidth = tabWidths.reduce((sum, width) => sum + width, 0);
  assert.equal(tabWidths.length, 6);
  assert.ok(tabWidths.every((width) => width >= 44));
  assert.ok(tabsWidth > 360, `tabs ${tabsWidth}`);
  assert.ok(tabsWidth <= 560, `tabs ${tabsWidth}`);
});
