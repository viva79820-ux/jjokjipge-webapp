"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bookingConfig } from "@/lib/booking-config";
import { reservationTimeLabel } from "@/lib/booking-time";
import { counselorHeading } from "@/lib/counselors/rules";
import { siteConfig } from "@/lib/site-config";
import type { BookingSuccess } from "@/lib/reservations/types";

export function BookingComplete({
  reservation,
}: {
  reservation: BookingSuccess;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(reservation.reservationNo);
      setCopyMessage("예약번호를 복사했어요.");
    } catch {
      setCopyMessage("복사하지 못했어요. 예약번호를 직접 기록해 주세요.");
    }
  }
  return (
    <section className="space-y-7 md:space-y-9" aria-label="예약 완료">
      <h2 className="text-xl font-bold md:text-2xl">예약이 접수되었어요</h2>
      <div className="rounded-card border border-border bg-surface p-3 md:p-4">
        <p className="text-caption text-muted">예약번호</p>
        <p className="mt-1 break-all text-2xl font-bold text-brand md:text-3xl">
          {reservation.reservationNo}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          onClick={copyNumber}
        >
          복사하기
        </Button>
        <p role="status" className="mt-1 text-caption text-muted">
          {copyMessage}
        </p>
        <dl className="mt-4 space-y-2">
          <div>
            <dt className="text-caption text-muted">상담사</dt>
            <dd className="wrap-anywhere">
              {counselorHeading(reservation.counselorName)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">상담 상품</dt>
            <dd>{reservation.productName}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted">상담 시간</dt>
            <dd>
              {reservationTimeLabel(reservation.startsAt, reservation.endsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted">금액 · 무통장입금</dt>
            <dd>
              {reservation.price.toLocaleString("ko-KR")}원{" "}
              <span className="text-xs text-muted">예시 가격</span>
            </dd>
          </div>
        </dl>
      </div>
      <div className="rounded-card bg-brand-soft p-3 md:p-4">
        <h3 className="font-bold">입금 안내 · 예시 계좌</h3>
        <p className="mt-2 break-words">
          {bookingConfig.bank.name} {bookingConfig.bank.account}
        </p>
        <p>예금주: {bookingConfig.bank.holder}</p>
        <p className="mt-2 font-bold">
          {reservation.price.toLocaleString("ko-KR")}원
        </p>
        <p className="mt-2">
          예약 후 {bookingConfig.depositHours}시간 안에 입금해 주세요. 입금이
          확인되면 예약이 확정돼요.
        </p>
      </div>
      <Link
        href="/booking/lookup"
        className="flex min-h-11 items-center text-brand underline"
      >
        예약번호와 이메일로 예약 조회에서 확인할 수 있어요.
      </Link>
      <p className="text-caption text-muted md:text-sm">
        취소는 상담 시작 전까지 매장 대표전화 또는 1:1 문의로 신청해 주세요.{" "}
        <a
          href={`tel:${siteConfig.phone}`}
          className="inline-flex min-h-11 items-center text-brand underline"
        >
          {siteConfig.phone}
        </a>
      </p>
    </section>
  );
}
