"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/admin/actions";
import {
  validateLogin,
  type LoginField,
  type LoginState,
  type LoginValues,
} from "@/lib/admin/rules";

export function LoginForm({ next }: { next: string }) {
  const [values, setValues] = useState<LoginValues>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<NonNullable<LoginState["errors"]>>({});
  const [state, action, pending] = useActionState<LoginState, FormData>(
    async (previous, formData) => {
      const result = await login(previous, formData);
      setErrors(result.errors ?? {});
      return result;
    },
    {},
  );

  function changeField(field: LoginField, value: string) {
    const updated = { ...values, [field]: value };
    setValues(updated);
    setErrors((previous) => ({
      ...previous,
      [field]: validateLogin(updated)[field],
    }));
  }

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      event.preventDefault();
      event.currentTarget
        .querySelector<HTMLInputElement>(`[name="${firstError}"]`)
        ?.focus();
    }
  }

  return (
    <form
      action={action}
      noValidate
      onSubmit={validateBeforeSubmit}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />
      {(
        [
          { name: "email", label: "이메일", autoComplete: "email" },
          {
            name: "password",
            label: "비밀번호",
            autoComplete: "current-password",
          },
        ] as const
      ).map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className="block font-medium">
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type={field.name}
            autoComplete={field.autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={pending}
            value={values[field.name]}
            onChange={(event) => changeField(field.name, event.target.value)}
            onBlur={() =>
              setErrors((previous) => ({
                ...previous,
                [field.name]: validateLogin(values)[field.name],
              }))
            }
            aria-invalid={!!errors[field.name]}
            aria-describedby={
              errors[field.name] ? `${field.name}-error` : undefined
            }
            className={`mt-1 min-h-11 w-full min-w-0 rounded-button border bg-surface px-3 outline-none focus:border-brand focus:ring-2 focus:ring-brand ${errors[field.name] ? "border-error" : "border-border"}`}
          />
          {errors[field.name] && (
            <p
              id={`${field.name}-error`}
              role="alert"
              className="mt-1 text-caption text-error"
            >
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}
      {state.message && (
        <p role="alert" className="text-sm font-semibold text-error">
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
      <p className="text-caption leading-relaxed text-muted md:text-sm">
        비밀번호를 잊으셨으면 엠지미디어에 문의해 주세요.
      </p>
    </form>
  );
}
