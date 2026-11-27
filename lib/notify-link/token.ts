import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const notifyLinkTtlMs = 30 * 24 * 60 * 60 * 1000;
const maxTokenLength = 512;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const notifyLinkKinds = ["inquiry", "reservation"] as const;
export type NotifyLinkKind = (typeof notifyLinkKinds)[number];

const lookupPath = {
  inquiry: "/support/lookup",
  reservation: "/booking/lookup",
} as const;

function notifyLinkSecret() {
  const value = process.env.NOTIFY_LINK_SECRET;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function signaturesMatch(expected: Buffer, encoded: string) {
  const actual = Buffer.from(encoded, "base64url");
  const sameLength = actual.length === expected.length;
  const match = timingSafeEqual(sameLength ? actual : expected, expected);
  return sameLength && match;
}

function readPayload(body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const row = parsed as Record<string, unknown>;
  if (row.v !== 1 || typeof row.kind !== "string") return null;
  if (typeof row.id !== "string" || !uuidPattern.test(row.id)) return null;
  if (typeof row.exp !== "number" || !Number.isSafeInteger(row.exp))
    return null;
  return { kind: row.kind, id: row.id, exp: row.exp };
}

export function createNotifyToken(input: {
  kind: NotifyLinkKind;
  id: string;
  now?: number;
}): string | null {
  const key = notifyLinkSecret();
  if (!key) return null;
  if (input.kind !== "inquiry" && input.kind !== "reservation") return null;
  if (typeof input.id !== "string" || !uuidPattern.test(input.id)) return null;
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(now)) return null;
  const exp = now + notifyLinkTtlMs;
  if (!Number.isSafeInteger(exp)) return null;
  const body = Buffer.from(
    JSON.stringify({ v: 1, kind: input.kind, id: input.id, exp }),
    "utf8",
  ).toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyNotifyToken(
  token: string,
  kind: NotifyLinkKind,
  now = Date.now(),
): { id: string } | null {
  const key = notifyLinkSecret();
  if (!key || (kind !== "inquiry" && kind !== "reservation")) return null;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > maxTokenLength
  )
    return null;
  if (!Number.isSafeInteger(now)) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = createHmac("sha256", key).update(parts[0]).digest();
  if (!signaturesMatch(expected, parts[1])) return null;
  const payload = readPayload(parts[0]);
  if (!payload || payload.kind !== kind || now >= payload.exp) return null;
  return { id: payload.id };
}

export function notifyLookupHref(
  origin: string,
  kind: NotifyLinkKind,
  token: string | null,
) {
  const url = new URL(lookupPath[kind], origin);
  if (token) url.searchParams.set("t", token);
  return url.href;
}
