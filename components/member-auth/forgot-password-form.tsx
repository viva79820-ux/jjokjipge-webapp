"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  requestPasswordReset,
  type FieldState,
} from "@/lib/member-auth/actions";
import { messages } from "@/lib/member-auth/errors";
import { readReset, validateReset } from "@/lib/member-auth/validation";
import { EmailField } from "./email-field";
import { useFormResetRef } from "./navigation-reset";
import { alertClass, statusClass } from "./styles";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const submitClass = `inline-flex h-13 w-full cursor-pointer items-center justify-center rounded-full bg-brand px-4 text-base font-bold text-on-brand disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;

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
    <form
      ref={formResetRef}
      action={action}
      noValidate
      aria-busy={pending}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      <div>
        <EmailField
          id="email"
          autoComplete="email"
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
      {state.message && (
        <p ref={feedbackRef} tabIndex={-1} role="alert" className={alertClass}>
          {state.message}
        </p>
      )}
      {state.status === "accepted" && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role="status"
          className={statusClass}
        >
          {messages.resetAccepted}
        </p>
      )}
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "요청 중..." : "재설정 메일 보내기"}
      </button>
    </form>
  );
}
