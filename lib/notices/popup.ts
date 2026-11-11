import { uuid } from "./rules";

export const popupSessionKey = "jjokjipge:notice-popup:session";
export const popupTodayKey = "jjokjipge:notice-popup:today";
export const popupChangeEvent = "jjokjipge-notice-popup";
// 만료된 오늘 기록은 과거 일반 닫기를 무효화하는 시각을 남긴다.
// 현재 서울 날짜의 오늘 숨김과 일반 닫기는 개수와 상관없이 유지한다.
// 날짜가 지난 오늘 기록이 100건을 넘으면 다음 오늘 숨김을 저장할 때
// 시각이 가장 오래된 만료 기록부터 버린다. 그 시각보다 앞선 일반 닫기는
// 다시 숨김으로 남을 수 있다.
export const popupExpiredTodayLimit = 100;
type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
type SessionItem = { at: number | null };
type TodayItem = { date: string; at: number | null };
export type PopupMemory = {
  session?: Record<string, SessionItem>;
  today?: Record<string, TodayItem>;
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const clock = globalThis as { __noticePopupNow?: string };

export function popupNow() {
  const injected = clock.__noticePopupNow;
  if (typeof injected === "string") {
    const parsed = new Date(injected);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
export function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function summarizeNoticeBody(body: string) {
  const chars = Array.from(body);
  if (chars.length <= 300) return body;
  return `${chars.slice(0, 300).join("")}…`;
}
function finiteAt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function readSessionMap(raw: string | null) {
  const items: Record<string, SessionItem> = {};
  if (!raw) return items;
  if (uuid(raw)) return { [raw]: { at: null } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return items;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return items;
  const file = parsed as { v?: unknown; items?: unknown };
  if (file.v !== 1 || !file.items || typeof file.items !== "object")
    return items;
  if (Array.isArray(file.items)) return items;
  for (const [id, value] of Object.entries(file.items)) {
    if (
      !uuid(id) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      continue;
    const at = (value as { at?: unknown }).at;
    items[id] = { at: at == null ? null : finiteAt(at) };
    if (at != null && items[id].at == null) delete items[id];
  }
  return items;
}
function readTodayMap(raw: string | null) {
  const items: Record<string, TodayItem> = {};
  if (!raw) return items;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return items;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return items;
  const file = parsed as {
    v?: unknown;
    id?: unknown;
    date?: unknown;
    items?: unknown;
  };
  if (
    file.v == null &&
    file.items == null &&
    uuid(file.id) &&
    typeof file.date === "string" &&
    datePattern.test(file.date)
  )
    return { [file.id]: { date: file.date, at: null } };
  if (file.v !== 1 || !file.items || typeof file.items !== "object")
    return items;
  if (Array.isArray(file.items)) return items;
  for (const [id, value] of Object.entries(file.items)) {
    if (
      !uuid(id) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      continue;
    const record = value as { date?: unknown; at?: unknown };
    if (typeof record.date !== "string" || !datePattern.test(record.date))
      continue;
    const at = record.at == null ? null : finiteAt(record.at);
    if (record.at != null && at == null) continue;
    items[id] = { date: record.date, at };
  }
  return items;
}
function readMap<T>(
  store: Store | null,
  key: string,
  read: (raw: string | null) => T,
) {
  try {
    return read(store?.getItem(key) ?? null);
  } catch {
    return read(null);
  }
}
function preferSession(left?: SessionItem, right?: SessionItem) {
  if (!left) return right;
  if (!right) return left;
  if (left.at == null) return right.at == null ? left : right;
  if (right.at == null) return left;
  return right.at >= left.at ? right : left;
}
function preferToday(left?: TodayItem, right?: TodayItem) {
  if (!left) return right;
  if (!right) return left;
  if (left.at == null) return right.at == null ? left : right;
  if (right.at == null) return left;
  return right.at >= left.at ? right : left;
}
function hiddenByRecords(
  sessionItem: SessionItem | undefined,
  todayItem: TodayItem | undefined,
  now: Date,
) {
  if (todayItem?.date === seoulDate(now)) return true;
  if (!sessionItem) return false;
  if (!todayItem) return true;
  // 시각이 없는 기존 일반 닫기는 오늘 숨김보다 앞선 것으로 본다.
  if (sessionItem.at == null) return false;
  // 시각이 없는 기존 오늘 숨김은, 시각이 있는 이후 일반 닫기를 지우지 않는다.
  if (todayItem.at == null) return true;
  return sessionItem.at > todayItem.at;
}
export function noticePopupHidden(
  session: Store | null,
  local: Store | null,
  id: string,
  now = new Date(),
  memory?: PopupMemory,
) {
  if (!uuid(id)) return false;
  const sessionItem = preferSession(
    readMap(session, popupSessionKey, readSessionMap)[id],
    memory?.session?.[id],
  );
  const todayItem = preferToday(
    readMap(local, popupTodayKey, readTodayMap)[id],
    memory?.today?.[id],
  );
  return hiddenByRecords(sessionItem, todayItem, now);
}
export function popupDismissed(
  session: Store | null,
  local: Store | null,
  id: string,
  now = new Date(),
) {
  return noticePopupHidden(session, local, id, now);
}
function writeSession(items: Record<string, SessionItem>) {
  return Object.fromEntries(
    Object.entries(items).map(([id, item]) => [
      id,
      item.at == null ? {} : { at: item.at },
    ]),
  );
}
function writeToday(items: Record<string, TodayItem>) {
  return Object.fromEntries(
    Object.entries(items).map(([id, item]) => [
      id,
      item.at == null ? { date: item.date } : { date: item.date, at: item.at },
    ]),
  );
}
function pruneExpiredToday(items: Record<string, TodayItem>, today: string) {
  const active: [string, TodayItem][] = [];
  const expired: [string, TodayItem][] = [];
  for (const entry of Object.entries(items)) {
    if (entry[1].date >= today) active.push(entry);
    else expired.push(entry);
  }
  expired.sort(
    (left, right) =>
      (left[1].at ?? Number.NEGATIVE_INFINITY) -
      (right[1].at ?? Number.NEGATIVE_INFINITY),
  );
  const kept = expired.slice(
    Math.max(0, expired.length - popupExpiredTodayLimit),
  );
  return Object.fromEntries([...active, ...kept]);
}
export function rememberSession(session: Store, id: string, now = new Date()) {
  if (!uuid(id)) return;
  const items = readSessionMap(session.getItem(popupSessionKey));
  items[id] = { at: now.getTime() };
  session.setItem(
    popupSessionKey,
    JSON.stringify({ v: 1, items: writeSession(items) }),
  );
}
export function rememberToday(
  local: Store,
  session: Store | null,
  id: string,
  now = new Date(),
) {
  // 다른 탭의 일반 닫기는 이 탭에서 지울 수 없다. 시각 비교로 대체한다.
  void session;
  if (!uuid(id)) return;
  const items = readTodayMap(local.getItem(popupTodayKey));
  items[id] = { date: seoulDate(now), at: now.getTime() };
  local.setItem(
    popupTodayKey,
    JSON.stringify({
      v: 1,
      items: writeToday(pruneExpiredToday(items, seoulDate(now))),
    }),
  );
}
