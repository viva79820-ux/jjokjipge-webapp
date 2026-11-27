"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { login } from "@/lib/member-auth/actions";
import type { FieldState } from "@/lib/member-auth/actions";
import { validateLogin } from "@/lib/member-auth/validation";
import { EmailField } from "./email-field";
import { HardNavigation, useFormResetRef } from "./navigation-reset";
import { PasswordField } from "./password-field";
import { alertClass } from "./styles";
import { useActionState } from "react";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const textLink = `inline-flex min-h-11 cursor-pointer items-center text-label font-semibold hover:text-brand-deep ${focus}`;

const submitClass = `inline-flex h-13 w-full cursor-pointer items-center justify-center rounded-full bg-brand px-4 text-base font-bold text-on-brand disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

export function LoginForm({ next }: { next: string }) {
  const [formRef, formResetRef] = useFormResetRef();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [state, action, pending] = useActionState<FieldState, FormData>(
    login,
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
    if (state.message) feedbackRef.current?.focus();
  }, [errors, formRef, state.message]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    const email = data.get("email");
    const password = data.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      event.preventDefault();
      return;
    }
    const nextErrors = validateLogin({ email, password });
    setLocalErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      event.preventDefault();
      event.currentTarget
        .querySelector<HTMLElement>(`[name="${first}"]`)
        ?.focus();
    }
  }

  return (
    <>
      <HardNavigation />
      <form
        ref={formResetRef}
        action={action}
        noValidate
        aria-busy={pending}
        onSubmit={onSubmit}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="next" value={next} />
        <div>
          <EmailField
            id="email"
            autoComplete="username"
            invalid={Boolean(errors.email)}
            describedBy={errors.email ? "email-error" : undefined}
            disabled={pending}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="mt-1.5 text-caption text-error"
            >
              {errors.email}
            </p>
          )}
        </div>
        <div>
          <PasswordField
            id="password"
            name="password"
            label="비밀번호"
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
            describedBy={errors.password ? "password-error" : undefined}
            disabled={pending}
            screen
          />
          {errors.password && (
            <p
              id="password-error"
              role="alert"
              className="mt-1.5 text-caption text-error"
            >
              {errors.password}
            </p>
          )}
        </div>
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
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? "로그인 중..." : "로그인"}
        </button>
        <div className="flex items-center justify-center gap-4">
          <Link href="/forgot-password" className={`${textLink} text-muted`}>
            비밀번호 재설정
          </Link>
          <span aria-hidden="true" className="text-label text-border">
            |
          </span>
          <Link href="/signup" className={`${textLink} text-brand`}>
            회원가입
          </Link>
        </div>
      </form>
    </>
  );
}
