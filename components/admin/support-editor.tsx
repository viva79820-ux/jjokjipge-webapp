"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  saveFaq,
  deleteFaq,
  saveInquiryAnswer,
  reloadFaq,
  reloadInquiry,
} from "@/lib/admin/support-actions";
import {
  faqErrors,
  faqCategories,
  categoryLabels,
  answerError,
  supportReturn,
  supportSavedUrl,
  type FaqInput,
} from "@/lib/admin/support-rules";
import type { FaqRow, InquiryDetail } from "@/lib/admin/support-types";
import { formatTime } from "@/lib/admin/reservation-rules";

type Props =
  | { kind: "faqs"; initial: FaqRow | null; returnTo: string }
  | { kind: "inquiries"; initial: InquiryDetail; returnTo: string };
const blank: FaqInput = {
  category: "",
  question: "",
  answer: "",
  sort_order: "0",
  is_active: false,
};
function toInput(row: FaqRow): FaqInput {
  return {
    category: row.category,
    question: row.question,
    answer: row.answer,
    sort_order: String(row.sort_order),
    is_active: row.is_active,
  };
}
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-button border border-border bg-surface p-3";
export function SupportEditor(props: Props) {
  const { kind } = props;
  const fieldPrefix = useId();
  // The editable draft and its exact database version are captured together.
  // Refreshed server props never silently rebase an unsaved draft.
  const [original, setOriginal] = useState(props.initial);
  const [faq, setFaq] = useState<FaqInput>(
    kind === "faqs" && props.initial ? toInput(props.initial) : blank,
  );
  const [answer, setAnswer] = useState(
    kind === "inquiries" ? (props.initial.answer ?? "") : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState(
    props.initial ? "저장된 내용을 불러왔습니다." : "",
  );
  const [error, setError] = useState("");
  const [conflicted, setConflicted] = useState(false);
  const [modal, setModal] = useState<"save" | "delete" | "reload" | null>(null);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false),
    reloadRef = useRef<HTMLDivElement>(null),
    noticeRef = useRef<HTMLParagraphElement>(null),
    errorRef = useRef<HTMLParagraphElement>(null),
    formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const returnTo = supportReturn(kind, props.returnTo);
  useEffect(() => {
    if (conflicted && !modal && !pending) {
      const frame = requestAnimationFrame(() => {
        reloadRef.current?.querySelector("button")?.focus();
        reloadRef.current?.scrollIntoView({ block: "center" });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [conflicted, modal, pending]);
  useEffect(() => {
    if (!pending && !modal && notice) {
      noticeRef.current?.focus();
      noticeRef.current?.scrollIntoView({ block: "center" });
    }
  }, [notice, pending, modal]);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
      errorRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [error]);
  function openSave(e: React.FormEvent) {
    e.preventDefault();
    const next =
      kind === "faqs"
        ? faqErrors(faq)
        : answerError(answer)
          ? { answer: answerError(answer) }
          : {};
    setErrors(next);
    setNotice("");
    setError("");
    const first = Object.keys(next)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setModal("save");
  }
  function close() {
    if (!pending && !lock.current) setModal(null);
  }
  function run() {
    if (lock.current || pending || !modal) return;
    lock.current = true;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        if (modal === "reload") {
          if (!original) return;
          const res =
            kind === "faqs"
              ? await reloadFaq(original.id)
              : await reloadInquiry(original.id);
          if (res.success && res.row) {
            setOriginal(res.row);
            if (kind === "faqs") setFaq(toInput(res.row as FaqRow));
            else setAnswer((res.row as InquiryDetail).answer ?? "");
            setErrors({});
            setConflicted(false);
            setModal(null);
            setNotice(res.message);
          } else setError(res.message);
          return;
        }
        const form = new FormData();
        if (original) {
          form.set("id", original.id);
          form.set("version", original.updated_at);
        }
        form.set("mode", original ? "update" : "create");
        if (kind === "faqs")
          for (const [key, value] of Object.entries(faq))
            form.set(key, String(value));
        else form.set("answer", answer);
        const res =
          modal === "delete"
            ? await deleteFaq(form)
            : kind === "faqs"
              ? await saveFaq(form)
              : await saveInquiryAnswer(form);
        if (!res.success) {
          setErrors(res.errors ?? {});
          setError(res.message);
          setConflicted(Boolean(res.conflict));
          return;
        }
        setModal(null);
        setNotice(res.message);
        setErrors({});
        setConflicted(false);
        if (res.deleted) {
          router.push(returnTo);
          return;
        }
        if (res.row) {
          setOriginal(res.row);
          if (kind === "faqs") setFaq(toInput(res.row as FaqRow));
          else setAnswer((res.row as InquiryDetail).answer ?? "");
          if (!props.initial) {
            setOriginal(null);
            setFaq(blank);
            setNotice("");
          }
          router.replace(supportSavedUrl(kind, returnTo));
        }
      } catch {
        setError("처리 결과를 확인하지 못했습니다. 최신 내용을 확인해 주세요.");
      } finally {
        lock.current = false;
      }
    });
  }
  const inquiry = kind === "inquiries" ? (original as InquiryDetail) : null;
  const field = (key: keyof FaqInput, label: string, max?: number) => (
    <div>
      <label htmlFor={`${fieldPrefix}-${key}`}>{label}</label>
      <input
        id={`${fieldPrefix}-${key}`}
        name={key}
        className={inputClass}
        maxLength={max}
        value={String(faq[key])}
        onChange={(e) => setFaq({ ...faq, [key]: e.target.value })}
        aria-invalid={!!errors[key]}
        aria-describedby={
          errors[key] ? `${fieldPrefix}-${key}-error` : undefined
        }
      />
      {errors[key] && (
        <p
          id={`${fieldPrefix}-${key}-error`}
          role="alert"
          className="text-error"
        >
          {errors[key]}
        </p>
      )}
    </div>
  );
  return (
    <div className="min-w-0 space-y-4 wrap-anywhere">
      <Button href={returnTo} variant="secondary">
        목록으로 돌아가기
      </Button>
      <h1 className="text-xl font-bold">
        {kind === "faqs"
          ? original
            ? "FAQ 편집"
            : "FAQ 등록"
          : `${inquiry?.inquiry_no} · ${inquiry?.status === "answered" ? "답변 완료" : "답변 대기"}`}
      </h1>
      {notice && (
        <p ref={noticeRef} tabIndex={-1} role="status" className="text-brand">
          {notice}
        </p>
      )}
      {inquiry && (
        <>
          <section className="space-y-2 rounded-card border border-border bg-surface p-4">
            <h2 className="text-lg font-bold">고객 정보</h2>
            <p>이름: {inquiry.customer_name}</p>
            <p>이메일: {inquiry.customer_email}</p>
            <p>휴대폰: {inquiry.customer_phone}</p>
          </section>
          <section className="space-y-2 rounded-card border border-border bg-surface p-4">
            <h2 className="text-lg font-bold">문의 정보</h2>
            <p>
              {categoryLabels[inquiry.category]} ·{" "}
              {formatTime(inquiry.created_at)}
            </p>
            {inquiry.reservation_no && (
              <p>참고용 예약번호: {inquiry.reservation_no}</p>
            )}
            <p className="whitespace-pre-wrap">{inquiry.content}</p>
          </section>
          <section className="space-y-2 rounded-card border border-border bg-surface p-4">
            <h2 className="text-lg font-bold">현재 답변</h2>
            <p className="whitespace-pre-wrap">
              {inquiry.answer ?? "아직 답변이 등록되지 않았습니다."}
            </p>
            {inquiry.answered_at && (
              <p>답변 시각: {formatTime(inquiry.answered_at)}</p>
            )}
          </section>
        </>
      )}
      <form ref={formRef} onSubmit={openSave} noValidate>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="mb-3 text-lg font-bold">
            {kind === "faqs"
              ? "FAQ 내용"
              : inquiry?.status === "answered"
                ? "답변 수정"
                : "답변 등록"}
          </legend>
          {kind === "faqs" && (
            <>
              <div>
                <label htmlFor={`${fieldPrefix}-category`}>분류</label>
                <select
                  id={`${fieldPrefix}-category`}
                  name="category"
                  className={inputClass}
                  value={faq.category}
                  onChange={(e) => setFaq({ ...faq, category: e.target.value })}
                  aria-invalid={!!errors.category}
                  aria-describedby={`${fieldPrefix}-category-error`}
                >
                  <option value="">분류 선택</option>
                  {Object.entries(faqCategories).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <p
                  id={`${fieldPrefix}-category-error`}
                  role="alert"
                  className="text-error"
                >
                  {errors.category}
                </p>
              </div>
              {field("question", "질문", 300)}
              {field("sort_order", "표시 순서", 10)}
              <p className="text-sm text-muted">
                0~2147483647 사이 정수입니다. 작은 값이 먼저 나옵니다.
              </p>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={faq.is_active}
                  onChange={(e) =>
                    setFaq({ ...faq, is_active: e.target.checked })
                  }
                />
                공개
              </label>
            </>
          )}
          <div>
            <label htmlFor={`${fieldPrefix}-answer`}>답변</label>
            <textarea
              id={`${fieldPrefix}-answer`}
              name="answer"
              rows={9}
              maxLength={5000}
              className={inputClass}
              value={kind === "faqs" ? faq.answer : answer}
              onChange={(e) =>
                kind === "faqs"
                  ? setFaq({ ...faq, answer: e.target.value })
                  : setAnswer(e.target.value)
              }
              aria-invalid={!!errors.answer}
              aria-describedby={`${fieldPrefix}-answer-help ${fieldPrefix}-answer-error`}
            />
            <p className="text-right text-sm text-muted">
              {(kind === "faqs" ? faq.answer : answer).length} / 5000자
            </p>
            <p
              id={`${fieldPrefix}-answer-error`}
              role="alert"
              className="text-error"
            >
              {errors.answer}
            </p>
          </div>
          <p id={`${fieldPrefix}-answer-help`} className="text-sm text-muted">
            고객에게 보이는 내용입니다. 내부 메모·개인정보 등 고객에게 보여서는
            안 되는 내용을 적지 마세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              저장 전 확인
            </Button>
            {conflicted && !modal && (
              <div ref={reloadRef}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setError("");
                    setModal("reload");
                  }}
                >
                  최신 내용 다시 불러오기
                </Button>
              </div>
            )}
            {kind === "faqs" && original && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setError("");
                  setModal("delete");
                }}
              >
                FAQ 삭제
              </Button>
            )}
          </div>
          {!modal && error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-error">
              {error}
            </p>
          )}
        </fieldset>
      </form>
      {modal && (
        <Modal
          title={
            modal === "reload"
              ? "최신 내용 불러오기"
              : modal === "delete"
                ? "FAQ 삭제 확인"
                : "저장 확인"
          }
          busy={pending}
          onClose={close}
          footer={
            <>
              <Button disabled={pending} onClick={run}>
                {pending ? "처리 중…" : "확인 후 처리"}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={close}>
                돌아가기
              </Button>
            </>
          }
        >
          {modal === "reload" ? (
            <p>
              작성 중인 입력이 사라지고 최신 저장 내용으로 바뀝니다.
              계속하시겠습니까?
            </p>
          ) : kind === "faqs" ? (
            <>
              <p>
                {faqCategories[faq.category]} ·{" "}
                {modal === "delete"
                  ? (original as FaqRow)?.question
                  : faq.question}
              </p>
              <p>{faq.is_active ? "공개" : "비공개"}</p>
              {modal === "delete" ? (
                <p>
                  {(original as FaqRow)?.is_active
                    ? "공개 중인 FAQ를 삭제하면 고객 FAQ에서도 사라집니다."
                    : "이 FAQ를 삭제하시겠습니까?"}
                </p>
              ) : (
                <p>
                  공개로 저장하면 고객 FAQ에 반영됩니다. 공개 중인 FAQ 수정도
                  고객이 볼 수 있는 변경입니다.
                </p>
              )}
            </>
          ) : (
            <p>저장하면 고객이 문의 조회에서 답변을 확인할 수 있습니다.</p>
          )}
          {error && (
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-error">
              {error}
            </p>
          )}
          {conflicted && modal !== "reload" && (
            <Button
              disabled={pending}
              variant="secondary"
              onClick={() => {
                setError("");
                setModal("reload");
              }}
            >
              최신 내용 다시 불러오기
            </Button>
          )}
        </Modal>
      )}
    </div>
  );
}
