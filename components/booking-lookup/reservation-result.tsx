import { Badge } from "@/components/ui/badge";
import { bookingConfig } from "@/lib/booking-config";
import { counselorHeading } from "@/lib/counselors/rules";
import {
  formatSchedule,
  paymentLabels,
  statusLabels,
} from "@/lib/reservations/lookup/display";
import type { LookupResult } from "@/lib/reservations/lookup/types";

export function ReservationResult({ result }: { result: LookupResult }) {
  const schedule = formatSchedule(result.startsAt, result.endsAt);
  return (
    <div data-lookup-result className="mt-7 min-w-0 scroll-mb-28">
      <h2
        id="lookup-result-title"
        tabIndex={-1}
        className="scroll-mt-4 text-lg font-bold focus:outline-none md:text-xl"
      >
        조회 결과
      </h2>
      <section
        aria-label="예약 정보"
        className="mt-3 min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
      >
        <dl className="space-y-3 text-body md:text-base">
          <div className="min-w-0">
            <dt className="text-caption text-muted">예약번호</dt>
            <dd className="font-semibold break-all">{result.reservationNo}</dd>
          </div>
          <div>
            <dt className="mb-1 text-caption text-muted">예약 상태</dt>
            <dd>
              <Badge>{statusLabels[result.status]}</Badge>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">상담사</dt>
            <dd className="wrap-anywhere">
              {counselorHeading(result.counselorName)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">상담 상품</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              {result.productName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-caption text-muted">상담 날짜</dt>
            <dd className="wrap-anywhere">
              <time dateTime={result.startsAt}>{schedule.date}</time>
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">시작·종료</dt>
            <dd>
              <time dateTime={result.startsAt}>{schedule.startTime}</time>
              {" ~ "}
              <time dateTime={result.endsAt}>{schedule.endTime}</time>
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">상담 시간</dt>
            <dd>{result.minutes}분</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">금액</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span>{result.price.toLocaleString("ko-KR")}원</span>
              <Badge>예시 가격</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">결제 방식</dt>
            <dd>{paymentLabels[result.paymentMethod]}</dd>
          </div>
          {result.cancelReason && (
            <div className="min-w-0">
              <dt className="text-caption text-muted">취소 사유</dt>
              <dd className="whitespace-pre-wrap wrap-anywhere">
                {result.cancelReason}
              </dd>
            </div>
          )}
        </dl>
      </section>
      {result.status === "pending_payment" && (
        <div className="mt-4 min-w-0 rounded-card bg-brand-soft p-3 md:p-4">
          <h3 className="font-bold">입금 안내</h3>
          <p className="mt-2">입금이 확인되면 예약이 확정돼요.</p>
          {result.paymentMethod === "bank_transfer" && (
            <>
              <p className="mt-3 font-bold">현재 시안의 예시 계좌</p>
              <p className="mt-2 break-words">
                {bookingConfig.bank.name} {bookingConfig.bank.account}
              </p>
              <p className="break-words">예금주: {bookingConfig.bank.holder}</p>
              <p className="mt-2 font-bold">
                {result.price.toLocaleString("ko-KR")}원
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
