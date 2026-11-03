"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { createReservation } from "@/lib/reservations/actions";
import type { BookingState } from "@/lib/reservations/types";
import type { Counselor } from "@/lib/data/counselors";
import { bookingConfig } from "@/lib/booking-config";
import { dateLabel, timeLabel, type Slot } from "@/lib/booking-time";
import { BookingComplete } from "./booking-complete";

type Props = {
  counselorSlug: string;
  product: Counselor["products"][number];
  date: string;
  slots: Slot[];
  children: ReactNode;
};
const inputClass =
  "mt-1 min-h-11 w-full rounded-button border border-border bg-surface px-3 text-body md:text-base";

export function BookingForm({
  counselorSlug,
  product,
  date,
  slots,
  children,
}: Props) {
  const [state, action, pending] = useActionState<BookingState, FormData>(
    createReservation,
    {},
  );
  const [startsAt, setStartsAt] = useState("");
  const [contact, setContact] = useState({
    name: "",
    phone: "",
    email: "",
    depositor: "",
  });
  const [consent, setConsent] = useState({
    refundConsent: false,
    privacyConsent: false,
  });
  function errorFor(field: keyof NonNullable<BookingState["errors"]>) {
    return state.errors?.[field] ? (
      <p
        id={`${field}-error`}
        className="mt-1 text-caption font-semibold text-brand"
        role="alert"
      >
        {state.errors[field]}
      </p>
    ) : null;
  }
  if (state.success) return <BookingComplete reservation={state.success} />;
  return (
    <div className="space-y-7 md:space-y-9">
      {children}
      <form action={action} className="space-y-7 md:space-y-9">
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
                onClick={() => setStartsAt(slot.startsAt)}
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
                inputMode: "tel",
                maxLength: 20,
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
                value={contact[field.name]}
                onChange={(event) =>
                  setContact({ ...contact, [field.name]: event.target.value })
                }
                aria-invalid={!!state.errors?.[field.name]}
                aria-describedby={
                  state.errors?.[field.name]
                    ? `${field.name}-error`
                    : field.name === "email"
                      ? "email-help"
                      : undefined
                }
                className={inputClass}
              />
              {field.name === "email" && (
                <p id="email-help" className="mt-1 text-caption text-muted">
                  예약 조회에 쓰여요.
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
              카드결제{" "}
              <span className="rounded-full bg-gold-soft px-2 py-1 text-xs text-gold-deep">
                준비 중
              </span>
            </label>
          </div>
          {errorFor("paymentMethod")}
          <label htmlFor="depositor" className="mt-3 block font-medium">
            입금자명
          </label>
          <input
            id="depositor"
            name="depositor"
            maxLength={30}
            autoComplete="name"
            value={contact.depositor}
            onChange={(event) =>
              setContact({ ...contact, depositor: event.target.value })
            }
            className={inputClass}
            aria-invalid={!!state.errors?.depositor}
            aria-describedby="depositor-help depositor-error"
          />
          <p id="depositor-help" className="mt-1 text-caption text-muted">
            비우면 이름과 같게 처리돼요.
          </p>
          {errorFor("depositor")}
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
                required
                checked={consent.refundConsent}
                onChange={(event) =>
                  setConsent({
                    ...consent,
                    refundConsent: event.target.checked,
                  })
                }
                aria-describedby="refundConsent-error"
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
                required
                checked={consent.privacyConsent}
                onChange={(event) =>
                  setConsent({
                    ...consent,
                    privacyConsent: event.target.checked,
                  })
                }
                aria-describedby="privacyConsent-error"
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
