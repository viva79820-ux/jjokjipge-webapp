"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/member-auth/actions";
import type { FieldState } from "@/lib/member-auth/actions";
import { validateLogin } from "@/lib/member-auth/validation";
import { HardNavigation, useFormResetRef } from "./navigation-reset";
import { PasswordField } from "./password-field";
import { fieldClass, linkClass } from "./styles";
import { useActionState } from "react";

export function LoginForm() {
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
            autoComplete="username"
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
        <PasswordField
          id="password"
          name="password"
          label="비밀번호"
          autoComplete="current-password"
          invalid={Boolean(errors.password)}
          describedBy={errors.password ? "password-error" : undefined}
          disabled={pending}
        />
        {errors.password && (
          <p
            id="password-error"
            role="alert"
            className="-mt-2 text-caption text-error"
          >
            {errors.password}
          </p>
        )}
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
        <Button
          type="submit"
          disabled={pending}
          className="w-full disabled:opacity-50"
        >
          {pending ? "로그인 중..." : "로그인"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col">
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
