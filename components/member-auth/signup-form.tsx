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
import { signUp, type FieldState } from "@/lib/member-auth/actions";
import { readSignup, validateSignup } from "@/lib/member-auth/validation";
import { useFormResetRef } from "./navigation-reset";
import { PasswordField } from "./password-field";
import { fieldClass, linkClass } from "./styles";

export function SignupForm() {
  const [formRef, formResetRef] = useFormResetRef();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [state, action, pending] = useActionState<FieldState, FormData>(
    signUp,
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
    const parsed = readSignup(new FormData(event.currentTarget));
    if ("message" in parsed) {
      event.preventDefault();
      return;
    }
    const nextErrors = validateSignup(parsed.values);
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
      <form
        ref={formResetRef}
        action={action}
        noValidate
        aria-busy={pending}
        onSubmit={onSubmit}
        className="space-y-4"
      >
        <div>
          <label htmlFor="name" className="block font-medium">
            이름
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={30}
            disabled={pending}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={fieldClass(Boolean(errors.name))}
          />
          {errors.name && (
            <p
              id="name-error"
              role="alert"
              className="mt-1 text-caption text-error"
            >
              {errors.name}
            </p>
          )}
        </div>
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
        <PasswordField
          id="password"
          name="password"
          label="비밀번호"
          autoComplete="new-password"
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
        <PasswordField
          id="passwordConfirm"
          name="passwordConfirm"
          label="비밀번호 확인"
          autoComplete="new-password"
          invalid={Boolean(errors.passwordConfirm)}
          describedBy={
            errors.passwordConfirm ? "passwordConfirm-error" : undefined
          }
          disabled={pending}
        />
        {errors.passwordConfirm && (
          <p
            id="passwordConfirm-error"
            role="alert"
            className="-mt-2 text-caption text-error"
          >
            {errors.passwordConfirm}
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
          {pending ? "가입 요청 중..." : "가입하기"}
        </Button>
      </form>
      <Link href="/login" className={`${linkClass} mt-4`}>
        로그인으로 돌아가기
      </Link>
    </>
  );
}
