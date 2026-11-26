"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { updateProfile, type AccountState } from "@/lib/member-auth/account";
import { readProfile, validateProfile } from "@/lib/member-auth/validation";
import { alertClass, fieldClass, labelClass, statusClass } from "./styles";

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [localErrors, setLocalErrors] = useState<
    Record<string, string | undefined>
  >({});
  const [state, action, pending] = useActionState<AccountState, FormData>(
    updateProfile,
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
  }, [errors, state.message]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const parsed = readProfile(new FormData(event.currentTarget));
    if ("message" in parsed) {
      event.preventDefault();
      return;
    }
    const nextErrors = validateProfile(parsed.values);
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
    <form
      ref={formRef}
      action={action}
      noValidate
      aria-busy={pending}
      onSubmit={onSubmit}
      className="mt-5 space-y-4 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
    >
      <h2 className="text-title font-bold">회원정보</h2>
      <div>
        <label htmlFor="profile-name" className={labelClass}>
          이름
        </label>
        <input
          id="profile-name"
          name="name"
          type="text"
          autoComplete="name"
          maxLength={30}
          required
          defaultValue={name}
          disabled={pending}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "profile-name-error" : undefined}
          className={fieldClass(Boolean(errors.name))}
        />
        {errors.name && (
          <p
            id="profile-name-error"
            role="alert"
            className={`mt-1 ${alertClass}`}
          >
            {errors.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="profile-phone" className={labelClass}>
          연락처
        </label>
        <input
          id="profile-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={13}
          defaultValue={phone}
          disabled={pending}
          placeholder="010-0000-0000"
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={errors.phone ? "profile-phone-error" : undefined}
          className={fieldClass(Boolean(errors.phone))}
        />
        {errors.phone && (
          <p
            id="profile-phone-error"
            role="alert"
            className={`mt-1 ${alertClass}`}
          >
            {errors.phone}
          </p>
        )}
      </div>
      {state.message && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={state.status === "saved" ? "status" : "alert"}
          className={
            state.status === "saved"
              ? `${statusClass} font-semibold text-brand`
              : alertClass
          }
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
