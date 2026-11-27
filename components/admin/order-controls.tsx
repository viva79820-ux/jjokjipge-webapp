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
import { changeOrder } from "@/lib/admin/order-actions";
import type { AdminOrderStatus } from "@/lib/admin/order-rules";

const labels = {
  confirm: "입금 확인",
  ship: "배송 중으로 변경",
  complete: "주문 완료",
  cancel: "주문 취소",
};
type Choice = keyof typeof labels;

export function OrderControls({
  id,
  version,
  status,
  orderNo,
}: {
  id: string;
  version: string;
  status: AdminOrderStatus;
  orderNo: string;
}) {
  const [selection, setSelection] = useState<{
    choice: Choice;
    version: string;
  } | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
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
    setTrackingNumber("");
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
        const result = await changeOrder({ success: false, message: "" }, form);
        if (result.success) {
          setSelection(null);
          setTrackingNumber("");
          setNotice(result.message);
        } else setError(result.message);
      } catch {
        setError(
          "처리 결과를 확인하지 못했습니다. 주문 상태를 다시 확인해 주세요.",
        );
      } finally {
        submitting.current = false;
      }
    });
  }

  const terminal = status === "completed" || status === "cancelled";
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-title font-bold">주문 상태 변경</h2>
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
      {terminal ? (
        <p className="text-muted">완료·취소된 주문은 변경할 수 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status === "pending_payment" && (
            <Button disabled={pending} onClick={() => open("confirm")}>
              {labels.confirm}
            </Button>
          )}
          {status === "payment_confirmed" && (
            <Button disabled={pending} onClick={() => open("ship")}>
              {labels.ship}
            </Button>
          )}
          {status === "shipping" && (
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
              {orderNo} 주문을 ‘{labels[selection.choice]}’ 처리하시겠습니까?
            </p>
            {selection.choice === "confirm" && (
              <p className="text-sm text-muted">
                실제 입금 내역을 확인한 뒤 처리해 주세요.
              </p>
            )}
            {selection.choice === "ship" && (
              <>
                <label
                  htmlFor="tracking-number"
                  className="block text-sm font-semibold"
                >
                  송장번호 (필수, 1~100자)
                </label>
                <input
                  id="tracking-number"
                  name="trackingNumber"
                  required
                  maxLength={100}
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  disabled={pending}
                  aria-invalid={Boolean(error)}
                  className="min-h-11 w-full min-w-0 rounded-input border border-border bg-background px-3"
                />
                <p className="text-sm text-muted">
                  저장한 송장번호는 고객 주문 조회에 바로 표시됩니다.
                </p>
              </>
            )}
            {selection.choice === "complete" && (
              <p className="text-sm text-muted">
                배송 완료를 확인한 뒤 주문을 완료해 주세요.
              </p>
            )}
            {selection.choice === "cancel" && (
              <p className="text-sm text-muted">
                환불이 필요한 경우 별도로 처리해야 합니다.
              </p>
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
