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
import { updatePassword, type FieldState } from "@/lib/member-auth/actions";
import {
  readPasswordChange,
  validatePasswordChange,
} from "@/lib/member-auth/validation";
import { useFormResetRef } from "./navigation-reset";
import { PasswordField } from "./password-field";
import { linkClass } from "./styles";

export function UpdatePasswordForm() {
  const [formRef, formResetRef] = useFormResetRef();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [state, action, pending] = useActionState<FieldState, FormData>(
    updatePassword,
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
    const parsed = readPasswordChange(new FormData(event.currentTarget));
    if ("message" in parsed) {
      event.preventDefault();
      return;
    }
    const nextErrors = validatePasswordChange(parsed.values);
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
        <PasswordField
          id="password"
          name="password"
          label="새 비밀번호"
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
          label="새 비밀번호 확인"
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
          {pending ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </form>
      <div className="mt-4 flex flex-col">
        <Link href="/forgot-password" className={linkClass}>
          재설정 메일 다시 요청
        </Link>
        <Link href="/login" className={linkClass}>
          로그인
        </Link>
      </div>
    </>
  );
}
