"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lookupReservation } from "@/lib/reservations/lookup/actions";
import { statusLabels } from "@/lib/reservations/lookup/display";
import {
  lookupFailure,
  validateLookupValues,
} from "@/lib/reservations/lookup/validation";
import { siteConfig } from "@/lib/site-config";
import type {
  LookupErrors,
  LookupResult,
  ReservationStatus,
  LookupValues,
} from "@/lib/reservations/lookup/types";
import { ReservationResult } from "./reservation-result";

const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-input border bg-surface px-3 text-body";
const initialValues: LookupValues = { reservationNo: "", email: "" };
const statusGuide: {
  status: ReservationStatus;
  description: string;
}[] = [
  {
    status: "pending_payment",
    description: "예약 신청 후 입금 확인을 기다리는 상태예요.",
  },
  {
    status: "confirmed",
    description: "입금 또는 결제가 확인되어 예약이 확정된 상태예요.",
  },
  {
    status: "completed",
    description: "예약한 상담이 완료된 상태예요.",
  },
  {
    status: "cancelled",
    description:
      "취소된 예약이에요. 취소 사유가 등록된 경우 조회 결과에서 확인할 수 있어요.",
  },
];
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
      <header>
        <h1 className="text-display font-extrabold">예약 조회</h1>
        <p className="mt-1 text-body text-muted">
          예약번호와 예약할 때 입력한 이메일로 예약 상태를 확인하세요.
        </p>
      </header>
      <form
        ref={formRef}
        method="post"
        noValidate
        onSubmit={submit}
        aria-busy={busy}
        aria-describedby="lookup-help"
        className="mt-6 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2 className="text-subtitle font-bold">예약 정보 입력</h2>
        <p id="lookup-help" className="mt-1 mb-4 text-caption text-muted">
          예약 완료 화면에서 안내받은 예약번호와 이메일을 입력해 주세요.
        </p>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <label
              htmlFor="lookup-reservationNo"
              className="text-label font-bold"
            >
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
            <label htmlFor="lookup-email" className="text-label font-bold">
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
      <section aria-labelledby="lookup-status-guide" className="mt-7">
        <h2 id="lookup-status-guide" className="text-title font-bold">
          예약 상태 안내
        </h2>
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {statusGuide.map(({ status, description }) => (
            <li
              key={status}
              className="flex min-w-0 items-start gap-3 p-3 @3xl/app:p-4"
            >
              <Badge className="shrink-0">{statusLabels[status]}</Badge>
              <p className="min-w-0 text-caption text-muted">{description}</p>
            </li>
          ))}
        </ul>
      </section>
      <section
        aria-labelledby="lookup-missing-number"
        className="mt-7 rounded-card bg-brand-soft p-3 @3xl/app:p-4"
      >
        <h2
          id="lookup-missing-number"
          className="text-subtitle font-bold text-brand-deep"
        >
          예약번호를 잊으셨나요?
        </h2>
        <p className="mt-2 text-body text-foreground">
          회원 서비스는 로그인에서 이용할 수 있어요. 예약번호를 찾을 수 없거나
          비회원 예약 확인이 필요하면 매장으로 문의해 주세요.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            로그인
          </Link>
          <a
            href={`tel:${siteConfig.phone}`}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-brand px-4 text-label font-bold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            매장 문의
          </a>
        </div>
      </section>
    </section>
  );
}
