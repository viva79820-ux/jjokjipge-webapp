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
import { Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupReservation } from "@/lib/reservations/lookup/actions";
import {
  lookupFailure,
  validateLookupValues,
} from "@/lib/reservations/lookup/validation";
import { representativeContact, siteConfig } from "@/lib/site-config";
import type {
  LookupErrors,
  LookupResult,
  ReservationStatus,
  LookupValues,
} from "@/lib/reservations/lookup/types";
import { ReservationResult } from "./reservation-result";
import { StatusBadge } from "./status-badge";

const inputClass =
  "mt-1 h-13 w-full min-w-0 rounded-input border bg-surface px-3.5 text-base text-foreground placeholder:text-muted";
const storeLinkClass =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-brand bg-surface px-3 text-center text-label font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const initialValues: LookupValues = { reservationNo: "", email: "" };
const statusGuide: {
  status: ReservationStatus;
  description: string;
}[] = [
  {
    status: "pending_payment",
    description: "안내 계좌로 입금하면 매장에서 확인해요.",
  },
  {
    status: "confirmed",
    description: "예약 시간에 매장 전화로 연락드려요.",
  },
  {
    status: "completed",
    description: "상담이 끝났어요. 후기를 남길 수 있어요.",
  },
  {
    status: "cancelled",
    description: "취소된 예약이에요. 사유는 조회 결과에서 확인해요.",
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
export function ReservationLookup({ linkNotice }: { linkNotice?: string }) {
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
  const contact = representativeContact(siteConfig.phone);
  useEffect(() => {
    const query = window.location.search;
    if (!query) return;
    const kept = query
      .slice(1)
      .split("&")
      .filter((part) => part === "t" || part.startsWith("t="));
    const next = kept.length ? `?${kept.join("&")}` : "";
    if (next === query) return;
    router.replace(next ? `${pathname}${next}` : pathname);
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
          예약번호와 예약할 때 입력한 이메일로 조회해요.
        </p>
        {linkNotice ? (
          <p role="alert" className="mt-4 text-body font-semibold text-error">
            {linkNotice}
          </p>
        ) : null}
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
          예약번호와 예약할 때 입력한 이메일을 입력해 주세요.
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
              예약 완료 화면이나 안내 메일에서 예약번호를 확인할 수 있어요.
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
              placeholder="example@email.com"
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
          <button
            type="submit"
            aria-disabled={busy}
            className={`inline-flex h-13 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand px-4 text-base font-bold text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            {busy ? (
              "조회 중…"
            ) : (
              <>
                <Search size={18} aria-hidden="true" />
                예약 조회하기
              </>
            )}
          </button>
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
      <section
        aria-labelledby="lookup-status-guide"
        className="mt-7 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2
          id="lookup-status-guide"
          className="text-body font-extrabold text-foreground"
        >
          예약 상태 안내
        </h2>
        <ul className="mt-3 space-y-3">
          {statusGuide.map(({ status, description }) => (
            <li key={status} className="flex min-w-0 items-center gap-2.5">
              <StatusBadge status={status} />
              <p className="min-w-0 text-caption text-foreground">
                {description}
              </p>
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
          className="text-body font-extrabold text-brand-deep"
        >
          예약번호를 잊으셨나요?
        </h2>
        <p className="mt-2 text-caption text-brand-deep">
          로그인하면 회원 이름과 이메일을 확인할 수 있어요. 예약 상태는 이
          화면에서 예약번호와 이메일로 확인해요.
          {contact.href.startsWith("tel:")
            ? " 예약번호를 모르면 매장으로 문의해 주세요."
            : " 예약번호를 모르면 매장 정보에서 위치와 안내를 확인해 주세요."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button href="/login" className="h-full w-full px-3">
            로그인
          </Button>
          {contact.href.startsWith("tel:") ? (
            <a href={contact.href} className={storeLinkClass}>
              <Phone size={16} aria-hidden="true" />
              {contact.label}
            </a>
          ) : (
            <Link href={contact.href} className={storeLinkClass}>
              {contact.label}
            </Link>
          )}
        </div>
      </section>
    </section>
  );
}
