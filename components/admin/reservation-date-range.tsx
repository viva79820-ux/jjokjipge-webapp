"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { changeRangeStart } from "@/lib/admin/reservation-rules";

export function ReservationDateRange({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const [dates, setDates] = useState({ from, to });
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => setDates({ from: "", to: "" });
    const restore = () => setDates({ from, to });
    form?.addEventListener("reset", reset);
    window.addEventListener("pageshow", restore);
    return () => {
      form?.removeEventListener("reset", reset);
      window.removeEventListener("pageshow", restore);
    };
  }, [from, to]);
  const fieldClass =
    "min-h-11 w-full min-w-0 rounded-button border border-border bg-surface px-3";
  return (
    <>
      <label className="min-w-0 space-y-1 text-sm">
        상담 시작일 (부터)
        <input
          ref={inputRef}
          name="from"
          type="date"
          value={dates.from}
          className={fieldClass}
          onChange={(event) => {
            const from = event.target.value;
            setDates((previous) => changeRangeStart(previous, from));
          }}
        />
      </label>
      <label className="min-w-0 space-y-1 text-sm">
        상담 시작일 (까지)
        <input
          name="to"
          type="date"
          value={dates.to}
          min={dates.from || undefined}
          className={fieldClass}
          onChange={(event) =>
            setDates((previous) => ({ ...previous, to: event.target.value }))
          }
        />
      </label>
    </>
  );
}

export function ResetReservationFilters() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={(event) => {
        event.currentTarget.form?.reset();
        router.push("/admin/reservations");
      }}
    >
      초기화
    </Button>
  );
}
