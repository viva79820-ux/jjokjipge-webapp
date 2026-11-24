"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Calendar, Info, Sparkles, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const topics = [
  { label: "타고난 성향", icon: Sparkles },
  { label: "올해 운세", icon: Calendar },
  { label: "연애·인연", icon: Users },
  { label: "재물·직업", icon: Wallet },
] as const;

const birthHours = [
  "밤 11시 ~ 오전 1시 (자시)",
  "오전 1시 ~ 3시 (축시)",
  "오전 3시 ~ 5시 (인시)",
  "오전 5시 ~ 7시 (묘시)",
  "오전 7시 ~ 9시 (진시)",
  "오전 9시 ~ 11시 (사시)",
  "오전 11시 ~ 오후 1시 (오시)",
  "오후 1시 ~ 3시 (미시)",
  "오후 3시 ~ 5시 (신시)",
  "오후 5시 ~ 7시 (유시)",
  "오후 7시 ~ 9시 (술시)",
  "오후 9시 ~ 11시 (해시)",
];

const fieldClass =
  "h-13 w-full min-w-0 rounded-input border border-border bg-surface px-3 text-body text-foreground placeholder:text-muted";

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-label font-bold">{label}</div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-1 rounded-full border border-border bg-background p-1"
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`h-11 min-w-0 flex-1 cursor-pointer rounded-full text-body font-bold ${focus} ${selected ? "bg-brand text-on-brand" : "bg-transparent text-muted"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AiSajuInputForm() {
  const [gender, setGender] = useState<"female" | "male">("female");
  const [calendar, setCalendar] = useState<"solar" | "lunar">("solar");
  const [unknownTime, setUnknownTime] = useState(false);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 @3xl/app:px-6">
      <section className="relative flex flex-col gap-2 overflow-hidden rounded-card bg-brand px-5 py-5.5 text-on-brand">
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          className="pointer-events-none absolute -right-4 -bottom-3.5 w-36 opacity-25"
        />
        <p className="relative m-0 text-body text-on-brand">
          AI 사주는 준비 중이에요. 실제 정보를 입력하지 않고 예시 결과를 볼 수
          있어요.
        </p>
        <Badge tone="halo" icon={Sparkles} className="relative self-start">
          AI 사주
        </Badge>
        <h1 className="relative m-0 text-display font-extrabold">
          생년월일로 보는
          <br />
          나의 사주 풀이
        </h1>
      </section>

      <section aria-label="풀이 항목" className="grid grid-cols-4 gap-2">
        {topics.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex min-w-0 flex-col items-center gap-1.5 rounded-card border border-border bg-surface px-1 py-3 text-center"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="text-caption font-bold">{label}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4.5 rounded-card border border-border bg-surface p-4.5">
        <h2 className="m-0 text-title font-bold">내 정보 입력</h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ai-saju-name" className="text-label font-bold">
            이름 (선택)
          </label>
          <input
            id="ai-saju-name"
            type="text"
            autoComplete="off"
            placeholder="홍길동"
            className={fieldClass}
          />
        </div>
        <Segment
          label="성별"
          value={gender}
          onChange={setGender}
          options={[
            { value: "female", label: "여성" },
            { value: "male", label: "남성" },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <Segment
            label="생년월일"
            value={calendar}
            onChange={setCalendar}
            options={[
              { value: "solar", label: "양력" },
              { value: "lunar", label: "음력" },
            ]}
          />
          <div className="mt-1 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <input
              aria-label="태어난 해"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1995년"
              className={fieldClass}
            />
            <input
              aria-label="태어난 월"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="3월"
              className={fieldClass}
            />
            <input
              aria-label="태어난 일"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="12일"
              className={fieldClass}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-label">
            <input type="checkbox" className="size-5.5 shrink-0 accent-brand" />
            음력 윤달이에요
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-label font-bold">태어난 시간</div>
          <select
            aria-label="태어난 시간"
            defaultValue="오전 9시 ~ 11시 (사시)"
            disabled={unknownTime}
            className={`${fieldClass} disabled:opacity-60`}
          >
            {birthHours.map((hour) => (
              <option key={hour}>{hour}</option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-label">
            <input
              type="checkbox"
              checked={unknownTime}
              onChange={(event) => setUnknownTime(event.target.checked)}
              className="size-5.5 shrink-0 accent-brand"
            />
            태어난 시간을 몰라요
          </label>
        </div>
        <div className="h-px bg-border" />
        <label className="flex min-h-11 items-start gap-2 text-caption">
          <input
            type="checkbox"
            className="mt-px size-5.5 shrink-0 accent-brand"
          />
          <span>동의 안내는 서비스 연결 후 제공돼요.</span>
        </label>
        <button
          type="button"
          disabled
          className="inline-flex h-13 w-full items-center justify-center rounded-full bg-brand px-4 text-base font-bold text-on-brand"
        >
          준비 중
        </button>
        <Link
          href="/ai-saju/result"
          className={`inline-flex min-h-11 items-center justify-center text-label font-bold text-brand ${focus}`}
        >
          예시 결과 보기
        </Link>
        <p className="m-0 text-center text-fine text-muted">
          이용 요금 [확인 필요]
        </p>
      </section>

      <aside className="flex gap-2.5 rounded-card border border-border bg-surface p-3.5 text-caption text-muted">
        <Info size={18} aria-hidden="true" className="shrink-0 text-brand" />
        <p className="m-0">
          사주 풀이는 아직 제공되지 않아요. 상담은 쪽집게천사 선생님과
          전화상담으로 나눌 수 있어요.
        </p>
      </aside>
    </div>
  );
}
