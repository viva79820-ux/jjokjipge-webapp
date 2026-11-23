"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { confirmEmail, type FieldState } from "@/lib/member-auth/actions";
import type { ConfirmOtpType } from "@/lib/member-auth/confirm";
import { alertClass, linkClass } from "./styles";

export function ConfirmForm({
  tokenHash,
  otpType,
  nextPath,
}: {
  tokenHash: string;
  otpType: ConfirmOtpType;
  nextPath: string;
}) {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [state, action, pending] = useActionState<FieldState, FormData>(
    confirmEmail,
    {},
  );

  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
  }, [state.message]);

  return (
    <>
      <form action={action} aria-busy={pending} className="mt-4 space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={otpType} />
        <input type="hidden" name="next" value={nextPath} />
        {state.message && (
          <p
            ref={feedbackRef}
            tabIndex={-1}
            role="alert"
            className={alertClass}
          >
            {state.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="w-full disabled:opacity-50"
        >
          {pending ? "확인 중..." : "확인"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col">
        <Link href="/login" className={linkClass}>
          로그인
        </Link>
        <Link href="/signup" className={linkClass}>
          회원가입
        </Link>
        <Link href="/forgot-password" className={linkClass}>
          비밀번호 재설정
        </Link>
      </div>
    </>
  );
}
