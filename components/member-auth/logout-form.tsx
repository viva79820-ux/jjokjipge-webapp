"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/member-auth/actions";
import { memberHardNavKey } from "./styles";

export function LogoutForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  return (
    <form
      action={async () => {
        setPending(true);
        sessionStorage.setItem(memberHardNavKey, "1");
        const result = await logout();
        sessionStorage.removeItem(memberHardNavKey);
        setMessage(
          result.message ?? "로그아웃하지 못했어요. 다시 시도해 주세요.",
        );
        setPending(false);
        feedbackRef.current?.focus();
      }}
    >
      {message && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role="alert"
          className="mb-3 text-sm font-semibold text-error outline-none"
        >
          {message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="disabled:opacity-50">
        {pending ? "로그아웃 중..." : "로그아웃"}
      </Button>
    </form>
  );
}
