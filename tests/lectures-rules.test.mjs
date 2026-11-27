import assert from "node:assert/strict";
import test from "node:test";
import {
  consentStatement,
  normalizeEmail,
  parseLecture,
  thumbnailPathFor,
} from "../lib/lectures/rules.ts";

const userId = "11111111-1111-4111-8111-111111111111";

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("동의 문장과 썸네일 경로는 선생님 폴더만 허용한다", () => {
  assert.equal(consentStatement, "본인이 권리를 가진 영상만 올린다");
  const path = `lectures/${userId}/22222222-2222-4222-8222-222222222222.webp`;
  assert.equal(thumbnailPathFor(userId, path), true);
  assert.equal(
    thumbnailPathFor("33333333-3333-4333-8333-333333333333", path),
    false,
  );
  assert.equal(
    thumbnailPathFor(
      userId,
      "classes/22222222-2222-4222-8222-222222222222.webp",
    ),
    false,
  );
});

test("강의 입력은 분야와 동의 값을 검사한다", () => {
  const parsed = parseLecture(
    form({
      title: "사주 입문",
      description: "무료 소개",
      field: "saju",
      thumbnail_path: "",
      is_published: "true",
      consent: "yes",
    }),
    userId,
  );
  assert.equal(parsed.draft?.title, "사주 입문");
  assert.equal(parsed.draft?.consent, true);
  const rejected = parseLecture(
    form({
      title: " ",
      description: "소개",
      field: "naming",
      thumbnail_path: "",
      is_published: "true",
    }),
    userId,
  );
  assert.equal(rejected.draft, null);
  assert.ok(rejected.errors.title);
  assert.ok(rejected.errors.field);
  assert.equal(normalizeEmail(" Teacher@Example.com "), "teacher@example.com");
  assert.equal(normalizeEmail("not-an-email"), null);
});
