"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { withdrawAccount, type AccountState } from "@/lib/member-auth/account";
import { alertClass } from "./styles";

export function WithdrawForm() {
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [state, action, pending] = useActionState<AccountState, FormData>(
    withdrawAccount,
    {},
  );

  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
  }, [state.message]);

  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="confirm" value="withdraw" />
      {state.message && (
        <p ref={feedbackRef} tabIndex={-1} role="alert" className={alertClass}>
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "탈퇴 처리 중..." : "탈퇴하기"}
      </Button>
      <Button href="/mypage" variant="secondary" className="w-full">
        마이페이지로 돌아가기
      </Button>
    </form>
  );
}
