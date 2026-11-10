"use client";
// Only non-sensitive notice IDs, in this tab's memory until list navigation.
const pending = new Set<string>();
export function queueNoticeRefresh(id: string) {
  pending.add(id);
}
export function takeNoticeRefresh() {
  const ids = [...pending];
  pending.clear();
  return ids;
}
