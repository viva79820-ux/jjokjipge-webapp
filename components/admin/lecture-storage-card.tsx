import type { StorageUsageView } from "@/lib/lectures/storage-view";

export function LectureStorageCard({
  mode,
}: {
  mode:
    | { kind: "empty" }
    | { kind: "unavailable" }
    | { kind: "ready"; view: StorageUsageView };
}) {
  return (
    <section
      aria-labelledby="lecture-storage-heading"
      className="min-w-0 rounded-card border border-border bg-surface p-3"
    >
      <h2 id="lecture-storage-heading" className="text-subtitle font-bold">
        영상 저장소
      </h2>
      {mode.kind === "unavailable" ? (
        <p role="alert" className="mt-3 text-body text-error">
          저장소 사용량을 불러오지 못했어요.
        </p>
      ) : mode.kind === "empty" ? (
        <StorageTimes checkedLabel="기록 없음" alertedLabel={null} empty />
      ) : (
        <StorageReady view={mode.view} />
      )}
    </section>
  );
}

function StorageReady({ view }: { view: StorageUsageView }) {
  return (
    <>
      <dl className="mt-3 space-y-3">
        <div className="min-w-0">
          <dt className="text-caption text-muted">사용</dt>
          <dd className="text-body wrap-anywhere">{view.usedLabel}</dd>
          <dd className="text-caption wrap-anywhere text-muted">
            {view.usedExactLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-caption text-muted">한도</dt>
          <dd className="text-body wrap-anywhere">{view.limitLabel}</dd>
          {view.limitExactLabel ? (
            <dd className="text-caption wrap-anywhere text-muted">
              {view.limitExactLabel}
            </dd>
          ) : null}
        </div>
        <div className="min-w-0">
          <dt className="text-caption text-muted">사용률</dt>
          {view.percentLabel != null && view.barPercent != null ? (
            <>
              <dd className="text-body">{view.percentLabel}</dd>
              <dd className="mt-2">
                <div
                  role="progressbar"
                  aria-label="저장소 사용률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(view.barPercent)}
                  aria-valuetext={view.percentLabel}
                  className="h-2 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${view.barPercent}%` }}
                  />
                </div>
              </dd>
            </>
          ) : (
            <dd className="text-body">한도 미설정</dd>
          )}
        </div>
      </dl>
      {view.warn ? (
        <p className="mt-3 rounded-card bg-brand-soft px-3 py-2 text-caption text-brand-deep">
          저장 용량이 한도의 80% 이상이에요.
        </p>
      ) : null}
      <StorageTimes
        checkedLabel={view.checkedLabel}
        alertedLabel={view.alertedLabel}
      />
    </>
  );
}

function StorageTimes({
  checkedLabel,
  alertedLabel,
  empty = false,
}: {
  checkedLabel: string;
  alertedLabel: string | null;
  empty?: boolean;
}) {
  return (
    <div className="mt-3 space-y-2">
      {empty ? <p className="text-body">사용량 기록이 없어요.</p> : null}
      <p className="text-caption text-muted">
        마지막 점검 <span className="text-foreground">{checkedLabel}</span>
      </p>
      {alertedLabel ? (
        <p className="text-caption text-muted">
          80% 알림 <span className="text-foreground">{alertedLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
