"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { lookupReservation } from "@/lib/reservations/lookup/actions";
import {
  lookupFailure,
  validateLookupValues,
} from "@/lib/reservations/lookup/validation";
import type {
  LookupErrors,
  LookupResult,
  LookupValues,
} from "@/lib/reservations/lookup/types";
import { ReservationResult } from "./reservation-result";

const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-button border bg-surface px-3 text-body md:text-base";
const initialValues: LookupValues = { reservationNo: "", email: "" };
function FieldError({ field, message }: { field: string; message?: string }) {
  return message ? (
    <p
      id={`${field}-error`}
      role="alert"
      className="mt-1 text-caption font-semibold text-error"
    >
      {message}
    </p>
  ) : null;
}
function focusField(form: RefObject<HTMLFormElement | null>, field: string) {
  form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
}
export function ReservationLookup() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<LookupErrors>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult>();
  const [submitting, setSubmitting] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const locked = useRef(false);
  const generation = useRef(0);
  const focusRequested = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const busy = submitting || pending;
  useEffect(() => {
    if (!window.location.search) return;
    router.replace(pathname);
  }, [pathname, router]);
  useEffect(() => {
    if (busy || !focusRequested.current) return;
    focusRequested.current = false;
    const first = Object.keys(errors)[0];
    if (first) focusField(formRef, first);
    else if (result) {
      const heading = document.getElementById("lookup-result-title");
      heading?.focus();
      heading?.scrollIntoView({ block: "nearest" });
    } else messageRef.current?.focus();
  }, [busy, errors, message, result]);
  function change(field: keyof LookupValues, value: string) {
    generation.current += 1;
    const next = { ...values, [field]: value };
    setValues(next);
    setResult(undefined);
    setMessage("");
    if (errors[field])
      setErrors({ ...errors, [field]: validateLookupValues(next)[field] });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const id = ++generation.current;
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
    setSubmitting(true);
    startTransition(async () => {
      try {
        const state = await lookupReservation(form);
        if (generation.current !== id) return;
        setErrors(state.errors ?? {});
        setMessage(state.message ?? "");
        setResult(state.result);
        focusRequested.current = true;
      } catch {
        if (generation.current !== id) return;
        setErrors({});
        setResult(undefined);
        setMessage(lookupFailure);
        focusRequested.current = true;
      } finally {
        locked.current = false;
        setSubmitting(false);
      }
    });
  }
  return (
    <section className="min-w-0">
      <h1 className="text-lg font-bold md:text-xl">예약 조회</h1>
      <p
        id="lookup-help"
        className="mt-2 mb-6 text-caption text-muted md:text-sm"
      >
        예약번호와 예약할 때 입력한 이메일을 입력해 주세요.
      </p>
      <form
        ref={formRef}
        method="post"
        noValidate
        onSubmit={submit}
        aria-busy={busy}
        aria-describedby="lookup-help"
        className="min-w-0"
      >
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <label htmlFor="lookup-reservationNo" className="font-medium">
              예약번호
            </label>
            <input
              id="lookup-reservationNo"
              name="reservationNo"
              type="text"
              required
              maxLength={40}
              readOnly={busy}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="R-20261102-0001"
              value={values.reservationNo}
              onChange={(event) => change("reservationNo", event.target.value)}
              onBlur={(event) =>
                setErrors((previous) => ({
                  ...previous,
                  reservationNo: validateLookupValues({
                    ...values,
                    reservationNo: event.target.value,
                  }).reservationNo,
                }))
              }
              aria-invalid={Boolean(errors.reservationNo)}
              aria-describedby={
                errors.reservationNo
                  ? "lookup-reservationNo-hint lookup-reservationNo-error"
                  : "lookup-reservationNo-hint"
              }
              className={`${inputClass} ${errors.reservationNo ? "border-error" : "border-border"}`}
            />
            <p
              id="lookup-reservationNo-hint"
              className="mt-1 text-caption text-muted"
            >
              예: R-20261102-0001
            </p>
            <FieldError
              field="lookup-reservationNo"
              message={errors.reservationNo}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="lookup-email" className="font-medium">
              이메일
            </label>
            <input
              id="lookup-email"
              name="email"
              type="email"
              inputMode="email"
              required
              maxLength={254}
              readOnly={busy}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={values.email}
              onChange={(event) => change("email", event.target.value)}
              onBlur={(event) =>
                setErrors((previous) => ({
                  ...previous,
                  email: validateLookupValues({
                    ...values,
                    email: event.target.value,
                  }).email,
                }))
              }
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "lookup-email-error" : undefined}
              className={`${inputClass} ${errors.email ? "border-error" : "border-border"}`}
            />
            <FieldError field="lookup-email" message={errors.email} />
          </div>
          <Button
            type="submit"
            aria-disabled={busy}
            className={`w-full cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            {busy ? "조회 중…" : "조회"}
          </Button>
        </div>
        <p
          id="lookup-status"
          role="status"
          className="mt-3 text-caption text-muted"
        >
          {busy
            ? "예약을 조회하고 있습니다."
            : result
              ? "예약 조회가 완료되었습니다."
              : ""}
        </p>
        {message && (
          <p
            ref={messageRef}
            tabIndex={-1}
            role="alert"
            className="mt-2 text-body font-semibold text-error focus:outline-none"
          >
            {message}
          </p>
        )}
      </form>
      {result && !busy && <ReservationResult result={result} />}
    </section>
  );
}
