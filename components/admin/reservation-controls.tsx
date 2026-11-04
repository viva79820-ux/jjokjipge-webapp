"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { changeReservation } from "@/lib/admin/reservation-actions";
import type { ReservationStatus } from "@/lib/admin/reservation-rules";

const labels = {
  confirm: "입금 확인 후 예약 확정",
  complete: "상담 완료 처리",
  cancel: "예약 취소",
};
type Choice = keyof typeof labels;
export function ReservationControls({
  id,
  version,
  status,
  reservationNo,
  bankTransfer,
}: {
  id: string;
  version: string;
  status: ReservationStatus;
  reservationNo: string;
  bankTransfer: boolean;
}) {
  // Capture the displayed version when opening. Never refresh it behind an open dialog.
  const [selection, setSelection] = useState<{
    choice: Choice;
    version: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formId = useId();
  useEffect(() => {
    if (!notice) return;
    noticeRef.current?.focus();
    noticeRef.current?.scrollIntoView({ block: "nearest" });
  }, [notice]);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  function open(choice: Choice) {
    if (pending || submitting.current) return;
    setSelection({ choice, version });
    setReason("");
    setError("");
    setNotice("");
  }
  function close() {
    if (!pending && !submitting.current) setSelection(null);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || pending || submitting.current) return;
    const form = new FormData(event.currentTarget);
    submitting.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await changeReservation(
          { success: false, message: "" },
          form,
        );
        if (result.success) {
          // revalidatePath returns the refreshed detail and version in this transition.
          setSelection(null);
          setReason("");
          setNotice(result.message);
        } else setError(result.message);
      } catch {
        setError(
          "처리 결과를 확인하지 못했습니다. 예약 상태를 다시 확인해 주세요.",
        );
      } finally {
        submitting.current = false;
      }
    });
  }
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-lg font-bold">예약 상태 변경</h2>
      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="status"
          className="font-semibold text-brand"
        >
          {notice}
        </p>
      )}
      {status === "completed" || status === "cancelled" ? (
        <p className="text-muted">완료·취소된 예약은 변경할 수 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "pending_payment" && bankTransfer && (
            <Button disabled={pending} onClick={() => open("confirm")}>
              {labels.confirm}
            </Button>
          )}
          {status === "confirmed" && (
            <Button disabled={pending} onClick={() => open("complete")}>
              {labels.complete}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => open("cancel")}
          >
            {labels.cancel}
          </Button>
        </div>
      )}
      {selection && (
        <Modal
          title={labels[selection.choice]}
          busy={pending}
          onClose={close}
          footer={
            <>
              <Button type="submit" form={formId} disabled={pending}>
                {pending ? "처리 중…" : "확인 후 처리"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={close}
              >
                돌아가기
              </Button>
            </>
          }
        >
          <form id={formId} noValidate onSubmit={submit} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="version" value={selection.version} />
            <input type="hidden" name="action" value={selection.choice} />
            <p className="break-words font-semibold">
              {reservationNo} 예약을 ‘{labels[selection.choice]}’ 하시겠습니까?
            </p>
            {selection.choice === "confirm" && (
              <p className="text-sm text-muted">
                실제 입금 내역을 확인한 뒤 확정해 주세요. 상담 시작 전 예약만
                확정할 수 있습니다.
              </p>
            )}
            {selection.choice === "complete" && (
              <p className="text-sm text-muted">
                상담 종료 시각 이후에만 완료할 수 있습니다.
              </p>
            )}
            {selection.choice === "cancel" && (
              <>
                <label
                  className="block text-sm font-semibold"
                  htmlFor="cancel-reason"
                >
                  취소 사유 (필수, 1~500자)
                </label>
                <textarea
                  id="cancel-reason"
                  name="reason"
                  required
                  maxLength={500}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={pending}
                  aria-invalid={!!error}
                  aria-describedby="cancel-help"
                  className="w-full rounded-button border border-border bg-background p-3"
                />
                <p id="cancel-help" className="text-sm text-muted">
                  고객이 볼 수 있으므로 개인정보나 내부 평가를 적지 마세요.
                </p>
                <p className="text-sm text-muted">
                  예약 상태만 취소되며, 환불이 필요한 경우 별도로 처리해야
                  합니다.
                </p>
              </>
            )}
            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="text-error"
              >
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}
