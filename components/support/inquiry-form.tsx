"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/booking/phone-input";
import { createInquiry } from "@/lib/inquiries/actions";
import {
  categoryLabels,
  createFailure,
  validateInquiryValues,
} from "@/lib/inquiries/validation";
import type {
  InquiryErrors,
  InquiryField,
  InquiryReceipt,
  InquiryValues,
} from "@/lib/inquiries/types";
import { FieldError, focusField, inputClass } from "./form-fields";
import { InquiryComplete } from "./inquiry-complete";

const initialValues: InquiryValues = {
  category: "",
  name: "",
  email: "",
  phone: "",
  reservationNo: "",
  content: "",
  privacyConsent: false,
};
export function InquiryForm() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<InquiryReceipt>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const focusRequested = useRef(false);
  const newInquiryFocus = useRef(false);
  useEffect(() => {
    if (!receipt && newInquiryFocus.current) {
      newInquiryFocus.current = false;
      const category =
        formRef.current?.querySelector<HTMLSelectElement>('[name="category"]');
      category?.focus();
      category?.scrollIntoView({ block: "center" });
    }
    if (!pending && focusRequested.current) {
      focusRequested.current = false;
      const first = Object.keys(errors)[0];
      if (first) focusField(formRef, first);
    }
  }, [errors, pending, receipt]);
  function newInquiry() {
    setValues(initialValues);
    setErrors({});
    setMessage("");
    setReceipt(undefined);
    locked.current = false;
    focusRequested.current = false;
    newInquiryFocus.current = true;
  }
  function change<K extends InquiryField>(field: K, value: InquiryValues[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    setMessage("");
    if (errors[field])
      setErrors({ ...errors, [field]: validateInquiryValues(next)[field] });
  }
  function blur(field: InquiryField) {
    setErrors((previous) => ({
      ...previous,
      [field]: validateInquiryValues(values)[field],
    }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const nextErrors = validateInquiryValues(values);
    setErrors(nextErrors);
    setMessage("");
    const first = Object.keys(nextErrors)[0];
    if (first) {
      focusField(formRef, first);
      return;
    }
    const form = new FormData(event.currentTarget);
    locked.current = true;
    startTransition(async () => {
      try {
        const state = await createInquiry(form);
        setErrors(state.errors ?? {});
        setMessage(state.message ?? "");
        if (state.success) setReceipt(state.success);
        else focusRequested.current = true;
      } catch {
        setMessage(createFailure);
      } finally {
        locked.current = false;
      }
    });
  }
  function attributes(field: InquiryField, help?: string) {
    return {
      id: `inquiry-${field}`,
      name: field,
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby":
        [help, errors[field] ? `inquiry-${field}-error` : ""]
          .filter(Boolean)
          .join(" ") || undefined,
      className: `${inputClass} ${errors[field] ? "border-error" : "border-border"}`,
    };
  }
  const errorFor = (field: InquiryField) => (
    <FieldError field={`inquiry-${field}`} message={errors[field]} />
  );
  if (receipt)
    return <InquiryComplete receipt={receipt} onNewInquiry={newInquiry} />;
  return (
    <section>
      <h1 className="text-lg font-bold md:text-xl">1:1 문의</h1>
      <p className="mt-2 mb-6 text-caption text-muted md:text-sm">
        로그인 없이 문의할 수 있습니다. 예약번호를 제외한 모든 항목은
        필수입니다.
      </p>
      <form
        ref={formRef}
        onSubmit={submit}
        method="post"
        noValidate
        aria-busy={pending}
      >
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="sr-only">문의 작성</legend>
          <div>
            <label htmlFor="inquiry-category" className="font-medium">
              분류
            </label>
            <select
              {...attributes("category")}
              required
              value={values.category}
              onChange={(e) => change("category", e.target.value)}
              onBlur={() => blur("category")}
            >
              <option value="">분류를 선택해 주세요</option>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {errorFor("category")}
          </div>
          <div>
            <label htmlFor="inquiry-name" className="font-medium">
              이름
            </label>
            <input
              {...attributes("name")}
              required
              autoComplete="name"
              maxLength={30}
              value={values.name}
              onChange={(e) => change("name", e.target.value)}
              onBlur={() => blur("name")}
            />
            {errorFor("name")}
          </div>
          <div>
            <label htmlFor="inquiry-email" className="font-medium">
              이메일
            </label>
            <input
              {...attributes("email", "inquiry-email-help")}
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={values.email}
              onChange={(e) => change("email", e.target.value)}
              onBlur={() => blur("email")}
            />
            <p id="inquiry-email-help" className="mt-1 text-caption text-muted">
              문의번호와 함께 답변 조회에 사용합니다.
            </p>
            {errorFor("email")}
          </div>
          <div>
            <label htmlFor="inquiry-phone" className="font-medium">
              휴대폰
            </label>
            <PhoneInput
              {...attributes("phone")}
              required
              inputMode="numeric"
              autoComplete="tel"
              placeholder="010-1234-5678"
              value={values.phone}
              onValueChange={(value) => change("phone", value)}
              onBlur={() => blur("phone")}
            />
            {errorFor("phone")}
          </div>
          <div>
            <label htmlFor="inquiry-reservationNo" className="font-medium">
              예약번호 (선택)
            </label>
            <input
              {...attributes("reservationNo", "inquiry-reservation-help")}
              maxLength={50}
              value={values.reservationNo}
              onChange={(e) => change("reservationNo", e.target.value)}
              onBlur={() => blur("reservationNo")}
            />
            <p
              id="inquiry-reservation-help"
              className="mt-1 text-caption text-muted"
            >
              참고용으로만 접수하며, 입력해도 예약 상태는 변경되지 않습니다.
            </p>
            {errorFor("reservationNo")}
          </div>
          <div>
            <label htmlFor="inquiry-content" className="font-medium">
              문의 내용
            </label>
            <textarea
              {...attributes(
                "content",
                "inquiry-content-help inquiry-content-count",
              )}
              required
              rows={8}
              maxLength={5000}
              value={values.content}
              onChange={(e) => change("content", e.target.value)}
              onBlur={() => blur("content")}
              className={`${attributes("content").className} resize-y`}
            />
            <p
              id="inquiry-content-count"
              className="mt-1 text-right text-caption text-muted"
            >
              {values.content.length.toLocaleString("ko-KR")} / 5,000자
            </p>
            <p
              id="inquiry-content-help"
              className="mt-1 text-caption text-muted"
            >
              주민등록번호나 카드번호 등 민감한 정보는 적지 마세요.
            </p>
            {errorFor("content")}
          </div>
          <div className="rounded-card border border-border bg-surface p-3 md:p-4">
            <label
              htmlFor="inquiry-privacyConsent"
              className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold"
            >
              <input
                id="inquiry-privacyConsent"
                name="privacyConsent"
                type="checkbox"
                required
                checked={values.privacyConsent}
                onChange={(e) => change("privacyConsent", e.target.checked)}
                onBlur={() => blur("privacyConsent")}
                aria-invalid={Boolean(errors.privacyConsent)}
                aria-describedby={`inquiry-privacy-help${errors.privacyConsent ? " inquiry-privacyConsent-error" : ""}`}
              />
              [필수] 개인정보 수집·이용 동의
            </label>
            <div
              id="inquiry-privacy-help"
              className="space-y-2 text-caption leading-relaxed text-muted md:text-sm"
            >
              <p>
                수집 항목: 이름, 휴대폰 번호, 이메일, 문의 내용, 예약번호(입력한
                경우)
              </p>
              <p>목적: 문의 접수·처리와 답변 확인</p>
              <p>보관 기간: 문의 처리 기록 3년 (현재 임시 기준)</p>
              <p>동의를 거부할 수 있으며, 거부 시 문의 접수가 어렵습니다.</p>
            </div>
            {errorFor("privacyConsent")}
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full disabled:opacity-50"
          >
            {pending ? "문의 접수 중…" : "문의 접수"}
          </Button>
        </fieldset>
        <p role="status" className="mt-3 text-caption text-muted">
          {pending ? "문의를 접수하고 있습니다." : ""}
        </p>
        <p role="alert" className="mt-2 text-body font-semibold text-error">
          {message}
        </p>
      </form>
    </section>
  );
}
