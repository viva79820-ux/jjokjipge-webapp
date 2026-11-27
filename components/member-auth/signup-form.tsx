"use client";

import {
  useActionState,
  useEffect,
  useLayoutEffect,
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
import {
  alertClass,
  linkClass,
  screenFieldClass,
  screenLabelClass,
  statusClass,
} from "./styles";

type AgreementName = "ageConfirmed" | "termsAgreed" | "privacyAgreed";

const initialAgreements: Record<AgreementName, boolean> = {
  ageConfirmed: false,
  termsAgreed: false,
  privacyAgreed: false,
};

const agreementInputClass =
  "size-5.5 shrink-0 cursor-pointer rounded-md border-2 border-border accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function SignupForm() {
  const [formRef, formResetRef] = useFormResetRef();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [agreements, setAgreements] = useState(initialAgreements);
  const agreementsRef = useRef(initialAgreements);
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
  const allAgreed = Object.values(agreements).every(Boolean);
  const agreementError =
    errors.ageConfirmed || errors.termsAgreed || errors.privacyAgreed;

  useLayoutEffect(() => {
    agreementsRef.current = agreements;
  }, [agreements]);

  // 액션이 끝나면 폼이 초기화된다. 이름·이메일·동의는 되돌리고
  // 비밀번호와 비밀번호 확인만 비운다.
  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const failed =
      Boolean(state.message) || Object.values(state.errors ?? {}).some(Boolean);
    if (!failed) return;
    const name = form.querySelector<HTMLInputElement>('[name="name"]');
    const email = form.querySelector<HTMLInputElement>('[name="email"]');
    if (name && state.name !== undefined) name.value = state.name;
    if (email && state.email !== undefined) email.value = state.email;
    for (const field of ["password", "passwordConfirm"]) {
      const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`);
      if (input) input.value = "";
    }
    const current = agreementsRef.current;
    for (const field of [
      "ageConfirmed",
      "termsAgreed",
      "privacyAgreed",
    ] as const) {
      const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`);
      if (input) input.checked = current[field];
    }
    const selectAll = form.querySelector<HTMLInputElement>(
      'section input[type="checkbox"]:not([name])',
    );
    if (selectAll) {
      selectAll.checked =
        current.ageConfirmed && current.termsAgreed && current.privacyAgreed;
    }
  }, [formRef, state]);

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

  function setAgreement(name: AgreementName, checked: boolean) {
    setAgreements((current) => ({ ...current, [name]: checked }));
    setLocalErrors((current) => ({ ...current, [name]: undefined }));
  }

  function setAllAgreements(checked: boolean) {
    setAgreements({
      ageConfirmed: checked,
      termsAgreed: checked,
      privacyAgreed: checked,
    });
    setLocalErrors((current) => ({
      ...current,
      ageConfirmed: undefined,
      termsAgreed: undefined,
      privacyAgreed: undefined,
    }));
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={screenLabelClass}>
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
          defaultValue={state.name}
          placeholder="홍길동"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          className={`${screenFieldClass(Boolean(errors.name))} px-3.5`}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-caption text-error">
            {errors.name}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={screenLabelClass}>
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
          defaultValue={state.email}
          placeholder="example@email.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email ? "signup-email-help email-error" : "signup-email-help"
          }
          className={`${screenFieldClass(Boolean(errors.email))} px-3.5`}
        />
        <p id="signup-email-help" className="text-caption text-muted">
          인증 메일을 받을 주소예요.
        </p>
        {errors.email && (
          <p id="email-error" role="alert" className="text-caption text-error">
            {errors.email}
          </p>
        )}
      </div>
      <div>
        <PasswordField
          id="password"
          name="password"
          label="비밀번호"
          autoComplete="new-password"
          invalid={Boolean(errors.password)}
          describedBy={errors.password ? "password-error" : undefined}
          disabled={pending}
          screen
          showIcon={false}
        />
        {errors.password && (
          <p
            id="password-error"
            role="alert"
            className="mt-1 text-caption text-error"
          >
            {errors.password}
          </p>
        )}
      </div>
      <div>
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
          screen
          showIcon={false}
          placeholder="비밀번호를 한 번 더"
        />
        {errors.passwordConfirm && (
          <p
            id="passwordConfirm-error"
            role="alert"
            className="mt-1 text-caption text-error"
          >
            {errors.passwordConfirm}
          </p>
        )}
      </div>

      <section
        aria-labelledby="signup-agreements"
        className="rounded-card border border-border bg-surface px-3.5 py-2"
      >
        <h2 id="signup-agreements" className="sr-only">
          약관 동의
        </h2>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-body font-extrabold">
          <input
            type="checkbox"
            checked={allAgreed}
            disabled={pending}
            onChange={(event) => setAllAgreements(event.currentTarget.checked)}
            className={agreementInputClass}
          />
          <span>전체 동의</span>
        </label>
        <div className="my-1 h-px bg-border" />
        <AgreementRow
          name="ageConfirmed"
          checked={agreements.ageConfirmed}
          disabled={pending}
          invalid={Boolean(errors.ageConfirmed)}
          onChange={setAgreement}
        >
          만 14세 이상
        </AgreementRow>
        <AgreementRow
          name="termsAgreed"
          checked={agreements.termsAgreed}
          disabled={pending}
          invalid={Boolean(errors.termsAgreed)}
          href="/terms"
          onChange={setAgreement}
        >
          이용약관
        </AgreementRow>
        <AgreementRow
          name="privacyAgreed"
          checked={agreements.privacyAgreed}
          disabled={pending}
          invalid={Boolean(errors.privacyAgreed)}
          href="/privacy-consent"
          onChange={setAgreement}
        >
          개인정보 수집·이용
        </AgreementRow>
        {agreementError && (
          <p
            id="agreement-error"
            role="alert"
            className="text-caption text-error"
          >
            {agreementError}
          </p>
        )}
      </section>

      {state.message && (
        <div className="flex flex-col gap-1">
          <p
            ref={feedbackRef}
            tabIndex={-1}
            role={state.status === "resent" ? "status" : "alert"}
            className={state.status === "resent" ? statusClass : alertClass}
          >
            {state.message}
          </p>
          {state.status === "duplicate" && (
            <div className="flex flex-col">
              <Link href="/login" className={linkClass}>
                로그인
              </Link>
              <Link href="/forgot-password" className={linkClass}>
                비밀번호 찾기
              </Link>
            </div>
          )}
        </div>
      )}
      <Button
        type="submit"
        disabled={pending || !allAgreed}
        className="h-13 w-full text-base disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "가입 요청 중..." : "가입하고 인증 메일 받기"}
      </Button>
      <p className="text-center text-label text-muted">
        이미 회원이신가요?{" "}
        <Link
          href="/login"
          className="-mx-1 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center px-1 font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          로그인
        </Link>
      </p>
    </form>
  );
}

function AgreementRow({
  name,
  checked,
  disabled,
  invalid,
  href,
  onChange,
  children,
}: {
  name: AgreementName;
  checked: boolean;
  disabled: boolean;
  invalid: boolean;
  href?: string;
  onChange: (name: AgreementName, checked: boolean) => void;
  children: string;
}) {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2">
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-label font-medium">
        <input
          type="checkbox"
          name={name}
          value="accepted"
          checked={checked}
          required
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={invalid ? "agreement-error" : undefined}
          onChange={(event) => onChange(name, event.currentTarget.checked)}
          className={agreementInputClass}
        />
        <span className="min-w-0">
          <span className="font-bold text-pink">(필수)</span> {children}
        </span>
      </label>
      {href && (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="-mx-[7px] inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center px-[11px] text-caption font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span className="underline underline-offset-2">보기</span>
        </Link>
      )}
    </div>
  );
}
