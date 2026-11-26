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
import { Search } from "lucide-react";
import { lookupOrder } from "@/lib/orders/lookup/actions";
import type {
  OrderLookupErrors,
  OrderLookupResult,
  OrderLookupValues,
} from "@/lib/orders/lookup/types";
import {
  orderLookupFailure,
  validateOrderLookupValues,
} from "@/lib/orders/lookup/validation";
import type { OrderStatus } from "@/lib/orders/types";
import { OrderResult } from "./order-result";
import { OrderStatusBadge } from "./status-badge";

const inputClass =
  "mt-1 h-13 w-full min-w-0 rounded-input border bg-surface px-3.5 text-base text-foreground placeholder:text-muted";
const initialValues: OrderLookupValues = { orderNo: "", email: "" };
const statusGuide: { status: OrderStatus; description: string }[] = [
  {
    status: "pending_payment",
    description: "안내 계좌로 입금하면 관리자가 확인해요.",
  },
  {
    status: "payment_confirmed",
    description: "입금을 확인하고 상품을 준비하고 있어요.",
  },
  {
    status: "shipping",
    description: "배송을 시작했어요. 조회 결과에서 송장번호를 확인해요.",
  },
  {
    status: "completed",
    description: "배송 처리가 완료된 주문이에요.",
  },
  {
    status: "cancelled",
    description: "취소된 주문이에요.",
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

export function OrderLookup() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<OrderLookupErrors>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<OrderLookupResult>();
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
      const heading = document.getElementById("order-lookup-result-title");
      heading?.focus();
      heading?.scrollIntoView({ block: "nearest" });
    } else messageRef.current?.focus();
  }, [busy, errors, message, result]);

  function change(field: keyof OrderLookupValues, value: string) {
    generation.current += 1;
    const next = { ...values, [field]: value };
    setValues(next);
    setResult(undefined);
    setMessage("");
    if (errors[field])
      setErrors({ ...errors, [field]: validateOrderLookupValues(next)[field] });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const id = ++generation.current;
    setResult(undefined);
    setMessage("");
    const nextErrors = validateOrderLookupValues(values);
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
        const state = await lookupOrder(form);
        if (generation.current !== id) return;
        setErrors(state.errors ?? {});
        setMessage(state.message ?? "");
        setResult(state.result);
        focusRequested.current = true;
      } catch {
        if (generation.current !== id) return;
        setErrors({});
        setResult(undefined);
        setMessage(orderLookupFailure);
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
        <h1 className="text-display font-extrabold">주문 조회</h1>
        <p className="mt-1 text-body text-muted">
          주문번호와 주문할 때 입력한 이메일로 조회해요.
        </p>
      </header>
      <form
        ref={formRef}
        method="post"
        noValidate
        onSubmit={submit}
        aria-busy={busy}
        aria-describedby="order-lookup-help"
        className="mt-6 min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2 className="text-subtitle font-bold">주문 정보 입력</h2>
        <p id="order-lookup-help" className="mt-1 mb-4 text-caption text-muted">
          주문번호와 주문할 때 입력한 이메일을 입력해 주세요.
        </p>
        <div className="min-w-0 space-y-4">
          <div className="min-w-0">
            <label
              htmlFor="order-lookup-orderNo"
              className="text-label font-bold"
            >
              주문번호
            </label>
            <input
              id="order-lookup-orderNo"
              name="orderNo"
              type="text"
              required
              maxLength={40}
              readOnly={busy}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="O-20261125-0001"
              value={values.orderNo}
              onChange={(event) => change("orderNo", event.target.value)}
              onBlur={(event) =>
                setErrors((previous) => ({
                  ...previous,
                  orderNo: validateOrderLookupValues({
                    ...values,
                    orderNo: event.target.value,
                  }).orderNo,
                }))
              }
              aria-invalid={Boolean(errors.orderNo)}
              aria-describedby={
                errors.orderNo
                  ? "order-lookup-orderNo-hint order-lookup-orderNo-error"
                  : "order-lookup-orderNo-hint"
              }
              className={`${inputClass} ${errors.orderNo ? "border-error" : "border-border"}`}
            />
            <p
              id="order-lookup-orderNo-hint"
              className="mt-1 text-caption text-muted"
            >
              주문 완료 화면에서 주문번호를 확인할 수 있어요.
            </p>
            <FieldError field="order-lookup-orderNo" message={errors.orderNo} />
          </div>
          <div className="min-w-0">
            <label
              htmlFor="order-lookup-email"
              className="text-label font-bold"
            >
              이메일
            </label>
            <input
              id="order-lookup-email"
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
                  email: validateOrderLookupValues({
                    ...values,
                    email: event.target.value,
                  }).email,
                }))
              }
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? "order-lookup-email-error" : undefined
              }
              className={`${inputClass} ${errors.email ? "border-error" : "border-border"}`}
            />
            <FieldError field="order-lookup-email" message={errors.email} />
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
                주문 조회하기
              </>
            )}
          </button>
        </div>
        <p
          id="order-lookup-status"
          role="status"
          className="mt-3 text-caption text-muted"
        >
          {busy
            ? "주문을 조회하고 있습니다."
            : result
              ? "주문 조회가 완료되었습니다."
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
      {result && !busy && <OrderResult result={result} />}
      <section
        aria-labelledby="order-lookup-status-guide"
        className="mt-7 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2
          id="order-lookup-status-guide"
          className="text-body font-extrabold text-foreground"
        >
          주문 상태 안내
        </h2>
        <ul className="mt-3 space-y-3">
          {statusGuide.map(({ status, description }) => (
            <li key={status} className="flex min-w-0 items-center gap-2.5">
              <OrderStatusBadge status={status} />
              <p className="min-w-0 text-caption text-foreground">
                {description}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-7 rounded-card bg-brand-soft p-3 @3xl/app:p-4">
        <h2 className="text-body font-extrabold text-brand-deep">
          주문번호를 잊으셨나요?
        </h2>
        <p className="mt-2 text-caption text-brand-deep">
          주문 완료 화면에서 주문번호를 확인해 주세요. 확인이 어려우면 1:1
          문의를 남겨 주세요.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/support/inquiry"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-4 text-label font-bold text-brand"
          >
            1:1 문의
          </Link>
          <Link
            href="/shop"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full bg-brand px-4 text-label font-bold text-on-brand"
          >
            타로샵 보기
          </Link>
        </div>
      </section>
    </section>
  );
}
