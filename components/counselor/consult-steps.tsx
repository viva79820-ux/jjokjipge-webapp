const steps = [
  {
    title: "상품과 시간 선택",
    description: "원하는 상담 상품과 날짜·시간을 골라요.",
  },
  {
    title: "예약 결제",
    description: "무통장입금은 입금 확인 후, 카드는 결제 후 예약이 확정돼요.",
  },
  {
    title: "매장 전화로 연락",
    description: "예약한 시간에 상담사가 매장 전화로 연락드려요.",
  },
];
export function ConsultSteps() {
  return (
    <>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">
              {index + 1}
            </span>
            <div>
              <p className="font-bold">{step.title}</p>
              <p className="mt-1 text-caption text-muted md:text-sm">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-caption text-muted md:text-sm">
        로그인하지 않아도 예약할 수 있어요.
      </p>
    </>
  );
}
