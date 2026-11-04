"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { changeReservation } from "@/lib/admin/reservation-actions";
import type { ReservationStatus } from "@/lib/admin/reservation-rules";

const labels = {
  confirm: "입금 확인 후 예약 확정",
  complete: "상담 완료 처리",
  cancel: "예약 취소",
};
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
  const [choice, setChoice] = useState<keyof typeof labels | null>(null);
  const [state, submit, pending] = useActionState(changeReservation, {
    success: false,
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const locked = pending || (submitted && state.success);
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-lg font-bold">예약 상태 변경</h2>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={state.success ? "text-brand" : "text-error"}
        >
          {state.message}
        </p>
      )}
      {state.success && (
        <Button variant="secondary" onClick={() => window.location.reload()}>
          예약 상태 다시 확인
        </Button>
      )}
      {status === "completed" || status === "cancelled" ? (
        <p className="text-muted">완료·취소된 예약은 변경할 수 없습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {status === "pending_payment" && bankTransfer && (
              <Button
                disabled={locked}
                onClick={() => {
                  setChoice("confirm");
                  setSubmitted(false);
                }}
              >
                {labels.confirm}
              </Button>
            )}
            {status === "confirmed" && (
              <Button
                disabled={locked}
                onClick={() => {
                  setChoice("complete");
                  setSubmitted(false);
                }}
              >
                {labels.complete}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={locked}
              onClick={() => {
                setChoice("cancel");
                setSubmitted(false);
              }}
            >
              {labels.cancel}
            </Button>
          </div>
          {choice && !state.success && (
            <form
              action={submit}
              onSubmit={() => setSubmitted(true)}
              className="space-y-3 border-t border-border pt-3"
            >
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="version" value={version} />
              <input type="hidden" name="action" value={choice} />
              <p className="break-words font-semibold">
                {reservationNo} 예약을 ‘{labels[choice]}’ 하시겠습니까?
              </p>
              {choice === "confirm" && (
                <p className="text-sm text-muted">
                  실제 입금 내역을 확인한 뒤 확정해 주세요. 상담 시작 전 예약만
                  확정할 수 있습니다.
                </p>
              )}
              {choice === "complete" && (
                <p className="text-sm text-muted">
                  상담 종료 시각 이후에만 완료할 수 있습니다.
                </p>
              )}
              {choice === "cancel" && (
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
                    disabled={pending}
                    className="w-full rounded-button border border-border bg-background p-3"
                  />
                  <p className="text-sm text-muted">
                    고객이 볼 수 있으므로 개인정보나 내부 평가를 적지 마세요.
                  </p>
                  <p className="text-sm text-muted">
                    예약 상태만 취소되며, 환불이 필요한 경우 별도로 처리해야
                    합니다.
                  </p>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={locked}>
                  {pending ? "처리 중…" : "확인 후 처리"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setChoice(null)}
                >
                  돌아가기
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
