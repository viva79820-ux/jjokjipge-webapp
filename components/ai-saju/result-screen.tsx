import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  Phone,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { CounselorDetailFrame } from "@/components/counselor/counselor-detail-frame";
import { PhotoPlaceholder } from "@/components/counselor/photo-placeholder";
import { appFixedBarClass } from "@/lib/app-frame";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const pillars = [
  { label: "시주", stem: "乙", branch: "亥" },
  { label: "일주", stem: "己", branch: "卯" },
  { label: "월주", stem: "甲", branch: "子" },
  { label: "연주", stem: "癸", branch: "巳" },
] as const;

const elements = [
  { name: "목", count: 3, width: "w-3/4" },
  { name: "화", count: 1, width: "w-1/4" },
  { name: "토", count: 2, width: "w-1/2" },
  { name: "금", count: 0, width: "w-0" },
  { name: "수", count: 2, width: "w-1/2" },
] as const;

const readings = [
  {
    title: "타고난 성향",
    icon: Sparkles,
    body: "차분하고 꼼꼼해서 맡은 일을 끝까지 해내는 힘이 있어요. 겉으로 드러내기보다 속으로 오래 생각하는 편이에요.",
  },
  {
    title: "올해 운세",
    icon: Calendar,
    body: "상반기에는 정리와 준비의 시기, 하반기에는 새로운 기회가 들어오는 흐름이에요.",
  },
  {
    title: "연애·인연",
    icon: Users,
    body: "천천히 알아 가는 인연과 잘 맞아요. 가까운 사람 소개로 만나는 인연을 눈여겨보세요.",
  },
  {
    title: "재물·직업",
    icon: Wallet,
    body: "꾸준히 쌓아 가는 방식이 잘 맞아요. 큰 지출은 한 번 더 따져 보고 결정하세요.",
  },
] as const;

function AiSajuResultHeader() {
  return (
    <header
      data-ai-saju-header
      className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-border bg-surface px-2"
    >
      <Link
        href="/ai-saju"
        aria-label="뒤로"
        className={`flex size-11 cursor-pointer items-center justify-center text-foreground ${focus}`}
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </Link>
      <p className="text-subtitle font-bold">AI 사주 결과</p>
    </header>
  );
}

export function AiSajuResult() {
  return (
    <CounselorDetailFrame>
      <AiSajuResultHeader />
      <div className="flex min-w-0 flex-col gap-3.5 px-4 py-4 @3xl/app:px-6">
        <p className="m-0 inline-flex max-w-full self-start items-center rounded-full bg-halo px-2.5 py-1 text-fine font-extrabold text-foreground">
          예시 결과 · 실제 내용은 AI 사주 서비스가 채움
        </p>
        <section className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-4.5">
          <div>
            <h1 className="m-0 text-display font-extrabold">홍길동님의 사주</h1>
            <p className="mt-0.5 text-caption text-muted">
              1995년 3월 12일 (양력) · 오전 9시~11시 · 여성
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2" aria-label="사주 네 칸">
            {pillars.map((pillar) => (
              <div
                key={pillar.label}
                className="flex min-w-0 flex-col items-center gap-1.5"
              >
                <span className="text-fine font-bold text-muted">
                  {pillar.label}
                </span>
                <span className="flex h-13 w-full items-center justify-center rounded-input bg-brand text-display font-extrabold text-on-brand">
                  {pillar.stem}
                </span>
                <span className="flex h-13 w-full items-center justify-center rounded-input bg-brand-soft text-display font-extrabold text-brand-deep">
                  {pillar.branch}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4.5">
          <h2 className="m-0 mb-1 text-subtitle font-bold">오행 분포</h2>
          {elements.map((element) => (
            <div
              key={element.name}
              className="flex items-center gap-2.5 text-label"
            >
              <span className="w-5 shrink-0 font-extrabold">
                {element.name}
              </span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-soft">
                <span
                  className={`block h-full rounded-full bg-brand ${element.width}`}
                />
              </span>
              <span className="w-7 shrink-0 text-right font-semibold text-muted">
                {element.count}개
              </span>
            </div>
          ))}
          <p className="m-0 mt-1 text-caption text-muted">
            나무(목) 기운이 많고 쇠(금) 기운이 적어요.
          </p>
        </section>
        {readings.map((reading) => {
          const Icon = reading.icon;
          return (
            <article
              key={reading.title}
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
            >
              <h3 className="m-0 flex items-center gap-2 text-subtitle font-bold">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {reading.title}
              </h3>
              <p className="m-0 text-body">{reading.body}</p>
            </article>
          );
        })}
        <section className="flex flex-col gap-3 rounded-card bg-brand p-4.5 text-on-brand">
          <h2 className="m-0 text-subtitle font-extrabold">
            AI 풀이, 선생님께 직접 물어보세요
          </h2>
          <p className="m-0 text-caption text-brand-soft">
            동성로 쪽집게천사 선생님이 예약한 시간에 전화로 자세히 풀어 드려요.
          </p>
          <div className="flex items-center gap-2">
            <PhotoPlaceholder className="size-11 shrink-0 rounded-full border-2 border-on-brand" />
            <PhotoPlaceholder className="size-11 shrink-0 rounded-full border-2 border-on-brand" />
            <span className="min-w-0 flex-1 text-caption font-bold">
              가연 선생님 · 구정미 원장님
            </span>
          </div>
          <Link
            href="/consult"
            className={`inline-flex h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-surface px-3 text-label font-bold text-brand ${focus}`}
          >
            <Phone size={16} aria-hidden="true" />
            전화상담 예약하기
          </Link>
        </section>
        <p className="m-0 text-center text-fine text-muted">
          AI 풀이는 참고용이며, 중요한 결정은 신중하게 하세요.
        </p>
      </div>
      <div
        data-booking-bar
        className={`${appFixedBarClass} flex items-stretch gap-2 border-t border-border bg-surface px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]`}
      >
        <Link
          href="/ai-saju"
          className={`inline-flex min-h-13 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full border border-brand bg-surface px-3 text-center text-label font-bold text-brand ${focus}`}
        >
          다른 사람 보기
        </Link>
        <Link
          href="/consult"
          className={`inline-flex min-h-13 min-w-0 flex-[1.4] cursor-pointer items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-center text-label font-bold text-on-brand ${focus}`}
        >
          <Phone size={18} aria-hidden="true" className="shrink-0" />
          선생님께 상담
        </Link>
      </div>
    </CounselorDetailFrame>
  );
}
