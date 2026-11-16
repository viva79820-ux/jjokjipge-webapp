const steps = [
  "선생님과 메뉴, 시간 고르기",
  "입금 또는 카드결제",
  "예약 시간에 매장 전화로 연락 받기",
];

export function ConsultSteps() {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-body font-extrabold text-brand">이렇게 진행돼요</h2>
      <ol className="flex list-none flex-col gap-2.5 p-0">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2.5">
            <span className="flex size-6.5 shrink-0 items-center justify-center rounded-full bg-brand text-caption font-extrabold text-on-brand">
              {index + 1}
            </span>
            <span className="text-label font-semibold">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-caption text-muted">
        회원가입 없이도 예약할 수 있어요. 예약 내역은 예약번호로 조회해요.
      </p>
    </section>
  );
}
