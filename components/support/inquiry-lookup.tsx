"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { lookupInquiry } from "@/lib/inquiries/actions";
import {
  inquiryNoMaxLength,
  lookupFailure,
  validateLookupValues,
} from "@/lib/inquiries/validation";
import type {
  InquiryResult as Result,
  LookupErrors,
  LookupValues,
} from "@/lib/inquiries/types";
import { FieldError, focusField, inputClass } from "./form-fields";
import { InquiryResult } from "./inquiry-result";

const initialValues: LookupValues = { inquiryNo: "", email: "" };
export function InquiryLookup() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<LookupErrors>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const locked = useRef(false);
  const focusRequested = useRef(false);
  useEffect(() => {
    if (!pending && focusRequested.current) {
      focusRequested.current = false;
      const first = Object.keys(errors)[0];
      if (first) focusField(formRef, first);
      else if (result) {
        resultRef.current?.focus();
        resultRef.current?.scrollIntoView({ block: "start" });
      }
    }
  }, [errors, pending, result]);
  function change(field: keyof LookupValues, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    setResult(undefined);
    setMessage("");
    if (errors[field])
      setErrors({ ...errors, [field]: validateLookupValues(next)[field] });
  }
  function reset() {
    setValues(initialValues);
    setErrors({});
    setResult(undefined);
    setMessage("");
    focusField(formRef, "inquiryNo");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setResult(undefined);
    setMessage("");
    const nextErrors = validateLookupValues(values);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      focusField(formRef, first);
      return;
    }
    const form = new FormData(event.currentTarget);
    locked.current = true;
    startTransition(async () => {
      try {
        const state = await lookupInquiry(form);
        setErrors(state.errors ?? {});
        setMessage(state.message ?? "");
        setResult(state.result);
        focusRequested.current = true;
      } catch {
        setMessage(lookupFailure);
      } finally {
        locked.current = false;
      }
    });
  }
  return (
    <section>
      <h1 className="text-lg font-bold md:text-xl">문의 조회</h1>
      <p
        id="lookup-help"
        className="mt-2 mb-6 text-caption text-muted md:text-sm"
      >
        문의번호와 작성한 이메일을 입력해 주세요. 로그인한 경우에도 두 값이 모두
        필요합니다.
      </p>
      <form
        ref={formRef}
        onSubmit={submit}
        method="post"
        noValidate
        aria-busy={pending}
        aria-describedby="lookup-help"
      >
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="sr-only">문의 조회 조건</legend>
          {(
            [
              {
                field: "inquiryNo",
                label: "문의번호",
                maxLength: inquiryNoMaxLength,
                type: "text",
                placeholder: "I-20261106-0001",
              },
              {
                field: "email",
                label: "이메일",
                maxLength: 254,
                type: "email",
                placeholder: "",
              },
            ] as const
          ).map(({ field, label, maxLength, type, placeholder }) => (
            <div key={field}>
              <label htmlFor={`lookup-${field}`} className="font-medium">
                {label}
              </label>
              <input
                id={`lookup-${field}`}
                name={field}
                type={type}
                required
                maxLength={maxLength}
                autoComplete={field === "email" ? "email" : "off"}
                autoCapitalize="none"
                spellCheck={false}
                placeholder={placeholder}
                value={values[field]}
                onChange={(e) => change(field, e.target.value)}
                onBlur={() =>
                  setErrors((previous) => ({
                    ...previous,
                    [field]: validateLookupValues(values)[field],
                  }))
                }
                aria-invalid={Boolean(errors[field])}
                aria-describedby={
                  errors[field] ? `lookup-${field}-error` : undefined
                }
                className={`${inputClass} ${errors[field] ? "border-error" : "border-border"}`}
              />
              <FieldError field={`lookup-${field}`} message={errors[field]} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={pending}
              className="flex-1 disabled:opacity-50"
            >
              {pending ? "조회 중…" : "문의 조회"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={reset}
            >
              다시 조회하기
            </Button>
          </div>
        </fieldset>
        <p role="status" className="mt-3 text-caption text-muted">
          {pending
            ? "문의를 조회하고 있습니다."
            : result
              ? "문의 조회가 완료되었습니다."
              : ""}
        </p>
        <p role="alert" className="mt-2 text-body font-semibold text-error">
          {message}
        </p>
      </form>
      {result && !pending && (
        <div>
          <h2
            ref={resultRef}
            tabIndex={-1}
            className="mt-7 scroll-mt-4 text-lg font-bold focus:outline-none md:text-xl"
          >
            조회 결과
          </h2>
          <InquiryResult result={result} />
        </div>
      )}
    </section>
  );
}
