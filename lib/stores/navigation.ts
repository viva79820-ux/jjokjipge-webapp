"use client";

// 이 탭에서 목록으로 돌아올 때까지 매장 ID만 기억한다.
const pending = new Set<string>();

export function queueStoreRefresh(id: string) {
  pending.add(id);
}

export function takeStoreRefresh() {
  const ids = [...pending];
  pending.clear();
  return ids;
}
