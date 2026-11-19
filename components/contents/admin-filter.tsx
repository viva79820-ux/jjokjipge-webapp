"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminListUrl, type PublishStatus } from "@/lib/contents/rules";

let pendingTarget: string | null = null;
let locked = false;
const listeners = new Set<() => void>();

function publish() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function pendingNow() {
  return pendingTarget !== null;
}

function pendingOnServer() {
  return false;
}

function useFilterPending() {
  return useSyncExternalStore(subscribe, pendingNow, pendingOnServer);
}

export function ContentFilterPending() {
  const pending = useFilterPending();
  if (!pending) return null;
  return (
    <p role="status" className="text-label font-semibold">
      필터를 적용하는 중…
    </p>
  );
}

export function ContentListSettled({ token }: { token: string }) {
  useLayoutEffect(() => {
    if (!pendingTarget && !locked) return;
    pendingTarget = null;
    locked = false;
    publish();
  }, [token]);
  return null;
}

export function AdminContentFilter({
  status,
  page,
  deleted,
}: {
  status: PublishStatus;
  page: number;
  deleted: boolean;
}) {
  const router = useRouter();
  const selectRef = useRef<HTMLSelectElement>(null);
  const pending = useFilterPending();
  useLayoutEffect(() => {
    if (selectRef.current) selectRef.current.value = status;
  }, [deleted, page, status]);
  return (
    <form
      action="/admin/contents"
      aria-busy={pending}
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (locked || pendingTarget) return;
        const data = new FormData(event.currentTarget);
        const value = data.get("status");
        const next: PublishStatus =
          value === "public" || value === "private" ? value : "";
        const href = adminListUrl(1, next);
        if (href === adminListUrl(page, status) && !deleted) return;
        locked = true;
        pendingTarget = href;
        publish();
        router.push(href);
      }}
    >
      <label className="text-label font-semibold">
        공개 상태
        <select
          ref={selectRef}
          name="status"
          key={`${status}:${page}:${deleted}`}
          defaultValue={status}
          disabled={pending}
          className="mt-1 ml-2 min-h-11 rounded-input border border-border bg-surface p-2"
        >
          <option value="">전체</option>
          <option value="public">공개</option>
          <option value="private">비공개</option>
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "필터를 적용하는 중…" : "필터 적용"}
      </Button>
      <Button href={adminListUrl()} variant="secondary">
        초기화
      </Button>
    </form>
  );
}
