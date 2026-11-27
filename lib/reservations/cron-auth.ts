import { timingSafeEqual } from "node:crypto";

export function authorizationMatches(
  header: string | null,
  secret: string | undefined,
) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  const length = Math.max(actual.length, expected.length);
  const left = Buffer.alloc(length);
  const right = Buffer.alloc(length);
  actual.copy(left);
  expected.copy(right);
  return timingSafeEqual(left, right) && actual.length === expected.length;
}
