"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  requestPasswordReset,
  type FieldState,
} from "@/lib/member-auth/actions";
import { messages } from "@/lib/member-auth/errors";
import { readReset, validateReset } from "@/lib/member-auth/validation";
import { useFormResetRef } from "./navigation-reset";
import { fieldClass, linkClass } from "./styles";

export function ForgotPasswordForm() {
  const [formRef, formResetRef] = useFormResetRef();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [state, action, pending] = useActionState<FieldState, FormData>(
    requestPasswordReset,
    {},
  );
  const errors =
    state.errors && Object.values(state.errors).some(Boolean)
      ? state.errors
      : localErrors;

  useEffect(() => {
    const errorName = Object.entries(errors).find(
      ([, message]) => message,
    )?.[0];
    if (errorName) {
      formRef.current
        ?.querySelector<HTMLElement>(`[name="${errorName}"]`)
        ?.focus();
      return;
    }
    if (state.message || state.status) feedbackRef.current?.focus();
  }, [errors, formRef, state.message, state.status]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const parsed = readReset(new FormData(event.currentTarget));
    if ("message" in parsed) {
      event.preventDefault();
      return;
    }
    const nextErrors = validateReset(parsed.values);
    setLocalErrors(nextErrors);
    if (nextErrors.email) {
      event.preventDefault();
      event.currentTarget.querySelector<HTMLElement>('[name="email"]')?.focus();
    }
  }

  return (
    <>
      <form
        ref={formResetRef}
        action={action}
        noValidate
        aria-busy={pending}
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="block font-medium">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={pending}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={fieldClass(Boolean(errors.email))}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="mt-1 text-caption text-error"
            >
              {errors.email}
            </p>
          )}
        </div>
        {state.message && (
          <p
            ref={feedbackRef}
            tabIndex={-1}
            role="alert"
            className="text-sm font-semibold text-error outline-none"
          >
            {state.message}
          </p>
        )}
        {state.status === "accepted" && (
          <p
            ref={feedbackRef}
            tabIndex={-1}
            role="status"
            className="text-sm leading-relaxed outline-none"
          >
            {messages.resetAccepted}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="w-full disabled:opacity-50"
        >
          {pending ? "요청 중..." : "재설정 메일 요청"}
        </Button>
      </form>
      <Link href="/login" className={`${linkClass} mt-4`}>
        로그인으로 돌아가기
      </Link>
    </>
  );
}
