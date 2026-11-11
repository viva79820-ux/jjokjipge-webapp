export const popupSessionKey = "jjokjipge:notice-popup:session";
export const popupTodayKey = "jjokjipge:notice-popup:today";
type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
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
function todayRecord(local: Store | null, id: string, now: Date) {
  const raw = local?.getItem(popupTodayKey);
  if (!raw) return false;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  const record = parsed as { id?: unknown; date?: unknown };
  return record.id === id && record.date === seoulDate(now);
}
export function popupDismissed(
  session: Store | null,
  local: Store | null,
  id: string,
  now = new Date(),
) {
  let today = false;
  let closed = false;
  try {
    today = todayRecord(local, id, now);
  } catch {
    today = false;
  }
  try {
    closed = session?.getItem(popupSessionKey) === id;
  } catch {
    closed = false;
  }
  return today || closed;
}
export function rememberSession(session: Store, id: string) {
  session.setItem(popupSessionKey, id);
}
export function rememberToday(
  local: Store,
  session: Store | null,
  id: string,
  now = new Date(),
) {
  local.setItem(popupTodayKey, JSON.stringify({ id, date: seoulDate(now) }));
  try {
    if (session?.getItem(popupSessionKey) === id)
      session.removeItem(popupSessionKey);
  } catch {
    /* 오늘 기록은 유지하고 세션 삭제 실패만 무시한다. */
  }
}
