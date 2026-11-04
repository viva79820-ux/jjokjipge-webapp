"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DragRow } from "@/components/ui/drag-row";
import { SectionTitle } from "@/components/ui/section-title";
import { createReservation } from "@/lib/reservations/actions";
import type { BookingState } from "@/lib/reservations/types";
import type { Counselor } from "@/lib/data/counselors";
import { bookingConfig } from "@/lib/booking-config";
import { dateLabel, timeLabel, type Slot } from "@/lib/booking-time";
import { BookingComplete } from "./booking-complete";
import {
  duplicateMessage,
  formatPhone,
  validateContact,
  type ContactField,
  type ContactValues,
} from "@/lib/reservations/rules";

type Props = {
  counselorSlug: string;
  products: Counselor["products"];
  calendars: Record<string, { date: string; slots: Slot[] }[]>;
  initialProductId: string;
  initialDate: string;
};
const inputClass =
  "mt-1 min-h-11 w-full rounded-button border bg-surface px-3 text-body md:text-base";

export function BookingForm({
  counselorSlug,
  products,
  calendars,
  initialProductId,
  initialDate,
}: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId);
  const [date, setDate] = useState(initialDate);
  const product = products.find((item) => item.id === productId) ?? products[0];
  const calendar = calendars[product.id] ?? [];
  const slots = calendar.find((day) => day.date === date)?.slots ?? [];
  const [errors, setErrors] = useState<NonNullable<BookingState["errors"]>>({});
  const invalidFields = useRef(new Set<ContactField>());
  const [startsAt, setStartsAt] = useState("");
  const [state, action, pending] = useActionState<BookingState, FormData>(
    async (previous, form) => {
      const result = await createReservation(previous, form);
      setErrors(result.errors ?? {});
      for (const field of ["name", "phone", "email", "depositor"] as const) {
        if (result.errors?.[field]) invalidFields.current.add(field);
      }
      if (result.errors?.startsAt === duplicateMessage) {
        setStartsAt("");
        router.refresh();
      }
      return result;
    },
    {},
  );
  const [contact, setContact] = useState<ContactValues>({
    name: "",
    phone: "",
    email: "",
    depositor: "",
  });
  const [sameDepositor, setSameDepositor] = useState(true);
  const [consent, setConsent] = useState({
    refundConsent: false,
    privacyConsent: false,
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("product", product.id);
    url.searchParams.set("date", date);
    window.history.replaceState(null, "", url);
  }, [product.id, date]);
  function selectProduct(nextProductId: string) {
    const nextCalendar = calendars[nextProductId] ?? [];
    const nextDate =
      nextCalendar.find(
        (day) => day.date === date && day.slots.some((slot) => slot.available),
      )?.date ??
      nextCalendar.find((day) => day.slots.some((slot) => slot.available))
        ?.date ??
      nextCalendar[0]?.date ??
      date;
    setProductId(nextProductId);
    selectDate(nextDate);
  }
  function selectDate(nextDate: string) {
    setDate(nextDate);
    setStartsAt("");
    setErrors((previous) => ({ ...previous, startsAt: undefined }));
  }
  function checkField(field: ContactField, values = contact) {
    const error = validateContact({
      ...values,
      depositor: sameDepositor ? "" : values.depositor,
    })[field];
    if (error) invalidFields.current.add(field);
    setErrors((previous) => ({ ...previous, [field]: error }));
  }
  function changeContact(field: ContactField, value: string) {
    const next = {
      ...contact,
      [field]: field === "phone" ? formatPhone(value) : value,
    };
    setContact(next);
    if (invalidFields.current.has(field)) checkField(field, next);
    if (field === "name" && invalidFields.current.has("depositor"))
      checkField("depositor", next);
  }
  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    const nextErrors: NonNullable<BookingState["errors"]> = validateContact({
      ...contact,
      depositor: sameDepositor ? "" : contact.depositor,
    });
    // The hidden depositor uses the server's fallback to the reservation name.
    if (sameDepositor) delete nextErrors.depositor;
    if (!startsAt) nextErrors.startsAt = "상담 시간을 선택해 주세요.";
    if (!consent.refundConsent)
      nextErrors.refundConsent = "환불 규정을 확인하고 동의해 주세요.";
    if (!consent.privacyConsent)
      nextErrors.privacyConsent = "개인정보 수집·이용에 동의해 주세요.";
    setErrors(nextErrors);
    for (const field of ["name", "phone", "email", "depositor"] as const) {
      if (nextErrors[field]) invalidFields.current.add(field);
    }
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      event.preventDefault();
      event.currentTarget
        .querySelector<HTMLElement>(
          firstError === "startsAt"
            ? "fieldset button:not(:disabled)"
            : `[name="${firstError}"]`,
        )
        ?.focus();
    }
  }
  function errorFor(field: keyof NonNullable<BookingState["errors"]>) {
    return errors[field] ? (
      <p
        id={`${field}-error`}
        className="mt-1 text-caption font-semibold text-error"
        role="alert"
      >
        {errors[field]}
      </p>
    ) : null;
  }
  if (state.success) return <BookingComplete reservation={state.success} />;
  return (
    <div className="space-y-7 md:space-y-9">
      <section>
        <SectionTitle title="상품 선택" />
        <div className="grid gap-2 md:grid-cols-2">
          {products.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={pending}
              onClick={() => selectProduct(item.id)}
              aria-pressed={item.id === product.id}
              className={`block min-h-11 rounded-card border bg-surface p-3 text-left md:p-4 ${item.id === product.id ? "border-brand" : "border-border"}`}
            >
              <span className="block font-bold">{item.name}</span>
              <span className="mt-2 block">
                {item.price.toLocaleString("ko-KR")}원 <Badge>예시 가격</Badge>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle title="날짜 선택" />
        <DragRow
          containerClassName="gap-2 pb-2"
          selectedIndex={calendar.findIndex((day) => day.date === date)}
        >
          {calendar.map((day) => (
            <button
              key={day.date}
              type="button"
              disabled={pending || !day.slots.some((slot) => slot.available)}
              aria-pressed={day.date === date}
              onClick={() => selectDate(day.date)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm disabled:opacity-40 ${day.date === date ? "bg-brand text-on-brand" : "bg-surface-muted text-muted"}`}
            >
              {dateLabel(day.date)}
            </button>
          ))}
        </DragRow>
      </section>
      <form
        action={action}
        noValidate
        onSubmit={validateBeforeSubmit}
        className="space-y-7 md:space-y-9"
      >
        <input type="hidden" name="counselorSlug" value={counselorSlug} />
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="startsAt" value={startsAt} />
        <input type="hidden" name="paymentMethod" value="bank_transfer" />
        <fieldset disabled={pending}>
          <legend className="mb-3 text-lg font-bold md:text-xl">
            시간 선택
          </legend>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
            {slots.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                disabled={!slot.available}
                aria-pressed={startsAt === slot.startsAt}
                onClick={() => {
                  setStartsAt(slot.startsAt);
                  setErrors((previous) => ({
                    ...previous,
                    startsAt: undefined,
                  }));
                }}
                className={`min-h-11 rounded-button border text-sm disabled:opacity-40 ${startsAt === slot.startsAt ? "border-brand bg-brand text-on-brand" : "border-border bg-surface text-foreground"}`}
              >
                {timeLabel(slot.startsAt)}
              </button>
            ))}
          </div>
          {!slots.some((slot) => slot.available) && (
            <p className="mt-3 text-muted">
              이 날은 예약 가능한 시간이 없어요.
            </p>
          )}
          {errorFor("startsAt")}
          {errorFor("productId")}
          {errorFor("counselorSlug")}
        </fieldset>
        <fieldset disabled={pending} className="space-y-3">
          <legend className="mb-3 text-lg font-bold md:text-xl">연락처</legend>
          {(
            [
              {
                name: "name",
                label: "이름",
                type: "text",
                autoComplete: "name",
                inputMode: "text",
                maxLength: 30,
              },
              {
                name: "phone",
                label: "휴대폰",
                type: "tel",
                autoComplete: "tel",
                inputMode: "numeric",
                maxLength: undefined,
              },
              {
                name: "email",
                label: "이메일",
                type: "email",
                autoComplete: "email",
                inputMode: "email",
                maxLength: 254,
              },
            ] as const
          ).map((field) => (
            <div key={field.name}>
              <label htmlFor={field.name} className="font-medium">
                {field.label}
              </label>
              <input
                name={field.name}
                type={field.type}
                autoComplete={field.autoComplete}
                inputMode={field.inputMode}
                maxLength={field.maxLength}
                id={field.name}
                required
                placeholder={
                  field.name === "phone" ? "010-1234-5678" : undefined
                }
                value={contact[field.name]}
                onChange={(event) =>
                  changeContact(field.name, event.target.value)
                }
                onPaste={(event) => {
                  if (field.name !== "phone") return;
                  event.preventDefault();
                  const input = event.currentTarget;
                  changeContact(
                    "phone",
                    input.value.slice(0, input.selectionStart ?? 0) +
                      event.clipboardData.getData("text") +
                      input.value.slice(
                        input.selectionEnd ?? input.value.length,
                      ),
                  );
                }}
                onBlur={() => checkField(field.name)}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  [
                    field.name === "email" ? "email-help" : "",
                    field.name === "phone" ? "phone-help" : "",
                    errors[field.name] ? `${field.name}-error` : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className={`${inputClass} ${errors[field.name] ? "border-error" : "border-border"}`}
              />
              {field.name === "email" && (
                <p id="email-help" className="mt-1 text-caption text-muted">
                  예약 조회에 쓰여요.
                </p>
              )}
              {field.name === "phone" && (
                <p id="phone-help" className="mt-1 text-caption text-muted">
                  010으로 시작하는 휴대폰 번호 11자리를 입력해 주세요.
                </p>
              )}
              {errorFor(field.name)}
            </div>
          ))}
        </fieldset>
        <fieldset disabled={pending}>
          <legend className="mb-3 text-lg font-bold md:text-xl">
            결제 방법
          </legend>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 rounded-card border border-brand bg-surface p-3">
              <input type="radio" checked readOnly name="paymentChoice" />
              무통장입금
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-card border border-border bg-surface-muted p-3 text-muted">
              <input type="radio" disabled name="paymentChoice" />
              카드결제 <Badge>준비 중</Badge>
            </label>
          </div>
          {errorFor("paymentMethod")}
          <label className="mt-3 flex min-h-11 items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={sameDepositor}
              onChange={(event) => {
                setSameDepositor(event.target.checked);
                setErrors((previous) => ({
                  ...previous,
                  depositor: undefined,
                }));
              }}
            />
            예약자 이름으로 입금
          </label>
          {sameDepositor ? (
            <input type="hidden" name="depositor" value="" />
          ) : (
            <div>
              <label htmlFor="depositor" className="block font-medium">
                입금자명
              </label>
              <input
                id="depositor"
                name="depositor"
                maxLength={30}
                autoComplete="name"
                value={contact.depositor}
                onChange={(event) =>
                  changeContact("depositor", event.target.value)
                }
                onBlur={() => checkField("depositor")}
                className={`${inputClass} ${errors.depositor ? "border-error" : "border-border"}`}
                aria-invalid={!!errors.depositor}
                aria-describedby={`depositor-help${errors.depositor ? " depositor-error" : ""}`}
              />
              <p id="depositor-help" className="mt-1 text-caption text-muted">
                비우면 예약자 이름으로 처리돼요.
              </p>
              {errorFor("depositor")}
            </div>
          )}
        </fieldset>
        <fieldset disabled={pending} className="space-y-4">
          <legend className="mb-3 text-lg font-bold md:text-xl">
            안내와 동의
          </legend>
          <div className="rounded-card border border-border bg-surface p-3 md:p-4">
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                name="refundConsent"
                aria-invalid={!!errors.refundConsent}
                required
                checked={consent.refundConsent}
                onChange={(event) => {
                  setConsent({
                    ...consent,
                    refundConsent: event.target.checked,
                  });
                  if (event.target.checked)
                    setErrors((previous) => ({
                      ...previous,
                      refundConsent: undefined,
                    }));
                }}
                aria-describedby={
                  errors.refundConsent ? "refundConsent-error" : undefined
                }
              />
              [필수] 환불 규정 확인
            </label>
            <div className="space-y-2 text-caption leading-relaxed text-muted md:text-sm">
              <p>
                상담 시작 전에는 언제든 전액 환불됩니다. 상담이 시작된 뒤에는
                환불되지 않습니다. 다만 상담사 사정으로 상담이 제대로 이루어지지
                않은 경우에는 전액 환불 또는 재예약해 드립니다.
              </p>
              <p>
                예약 시간에 상담사가 매장 번호로 전화드립니다. 받지 못하시면 1회
                무료로 다시 예약해 드립니다.
              </p>
              <p>사주타로 상담은 참고용 해석이며 결과를 보장하지 않습니다.</p>
            </div>
            {errorFor("refundConsent")}
          </div>
          <div className="rounded-card border border-border bg-surface p-3 md:p-4">
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                name="privacyConsent"
                aria-invalid={!!errors.privacyConsent}
                required
                checked={consent.privacyConsent}
                onChange={(event) => {
                  setConsent({
                    ...consent,
                    privacyConsent: event.target.checked,
                  });
                  if (event.target.checked)
                    setErrors((previous) => ({
                      ...previous,
                      privacyConsent: undefined,
                    }));
                }}
                aria-describedby={
                  errors.privacyConsent ? "privacyConsent-error" : undefined
                }
              />
              [필수] 개인정보 수집이용
            </label>
            <p className="text-caption leading-relaxed text-muted md:text-sm">
              수집 항목: 이름, 휴대폰 번호, 이메일 / 목적: 상담 예약과 연락,
              예약 조회 / 보관 기간: 전자상거래법에 따라 5년
            </p>
            {errorFor("privacyConsent")}
          </div>
        </fieldset>
        <section className="rounded-card bg-brand-soft p-3 md:p-4">
          <SectionTitle title="예약 요약" />
          <p className="font-semibold">{product.name}</p>
          <p className="mt-1">
            {dateLabel(date)} ·{" "}
            {startsAt ? timeLabel(startsAt) : "시간을 선택해 주세요."}
          </p>
          <p className="mt-1 font-bold">
            {product.price.toLocaleString("ko-KR")}원{" "}
            <span className="text-xs font-medium text-muted">예시 가격</span>
          </p>
          <p className="mt-3 text-caption text-muted">
            예약 후 {bookingConfig.depositHours}시간 안에 입금해 주세요. 입금
            확인 후 확정돼요.
          </p>
          <Button
            type="submit"
            disabled={!startsAt || pending}
            className="mt-3 w-full disabled:opacity-50"
          >
            {pending ? "예약 중..." : "예약하기"}
          </Button>
          <p role="alert" className="mt-2 font-semibold text-brand">
            {state.message}
          </p>
        </section>
      </form>
    </div>
  );
}
