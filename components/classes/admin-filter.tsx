"use client";

import { useEffect, useRef, useState } from "react";
import Form from "next/form";
import { Button } from "@/components/ui/button";

export function ClassAdminFilter({
  status,
  page,
  result,
}: {
  status: string;
  page: number;
  result: string;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const lock = useRef(false);
  const signature = `${page}|${status}|${result}`;
  const pending = target !== null && target !== signature;
  useEffect(() => {
    lock.current = false;
    const timeout = window.setTimeout(() => setTarget(null), 0);
    return () => window.clearTimeout(timeout);
  }, [signature]);
  return (
    <Form
      action="/admin/classes"
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        if (lock.current) {
          event.preventDefault();
          return;
        }
        const nextStatus = String(
          new FormData(event.currentTarget).get("status") ?? "",
        );
        const nextSignature = `1|${nextStatus}|`;
        if (nextSignature === signature) return;
        lock.current = true;
        setTarget(nextSignature);
      }}
    >
      <label className="text-label font-semibold">
        공개 상태
        <select
          key={status}
          name="status"
          defaultValue={status}
          disabled={pending}
          className="mt-1 block min-h-11 w-full rounded-input border border-border bg-surface p-3"
        >
          <option value="">전체</option>
          <option value="public">공개</option>
          <option value="private">비공개</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "필터 적용 중…" : "필터 적용"}
        </Button>
        <Button href="/admin/classes" variant="secondary">
          초기화
        </Button>
      </div>
      {pending && (
        <p role="status" className="w-full text-caption text-muted">
          필터를 적용하는 중입니다.
        </p>
      )}
    </Form>
  );
}
