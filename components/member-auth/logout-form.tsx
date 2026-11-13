"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/member-auth/actions";
import { messages } from "@/lib/member-auth/errors";
import {
  forgetHardNavigation,
  rememberHardNavigation,
} from "./navigation-reset";

function isRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function LogoutForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) feedbackRef.current?.focus();
  }, [message]);

  return (
    <form
      action={async () => {
        setPending(true);
        setMessage(null);
        const marked = rememberHardNavigation();
        try {
          const result = await logout();
          forgetHardNavigation();
          setMessage(result.message ?? messages.logout);
          setPending(false);
        } catch (error) {
          if (isRedirectError(error)) {
            // 저장소를 못 쓰면 로그인 화면을 통째로 다시 읽어 이전 회원 정보를 남기지 않는다.
            if (!marked) window.location.replace("/login");
            else throw error;
            return;
          }
          forgetHardNavigation();
          setMessage(messages.logout);
          setPending(false);
        }
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
