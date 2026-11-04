export const statusLabels = {
  pending_payment: "입금 대기",
  confirmed: "확정",
  completed: "완료",
  cancelled: "취소",
} as const;
export type ReservationStatus = keyof typeof statusLabels;
export type Search = Record<string, string | string[] | undefined>;
export const sortLabels = {
  created_desc: "예약 최신순",
  starts_desc: "상담일 최신순",
} as const;
export type Filters = {
  status: ReservationStatus | "";
  from: string;
  to: string;
  counselor: string;
  page: number;
  sort: keyof typeof sortLabels;
  excludeCancelled?: boolean;
};
export const PAGE_SIZE = 20;
export const conflictMessage =
  "다른 작업으로 예약이 변경됐습니다. 새로고침 후 다시 확인해 주세요.";
export function changeRangeStart(
  dates: { from: string; to: string },
  from: string,
) {
  return { from, to: from && dates.to && dates.to < from ? from : dates.to };
}
export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
export function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function dayStart(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toISOString();
}
export function dayEndExclusive(value: string) {
  return new Date(Date.parse(dayStart(value)) + 86400000).toISOString();
}
export function koreanDay(now: Date) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function parseFilters(search: Search): Filters | null {
  const fields = [
    "status",
    "from",
    "to",
    "counselor",
    "page",
    "exclude_cancelled",
    "sort",
  ];
  if (fields.some((key) => Array.isArray(search[key]))) return null;
  const value = (key: string) =>
    typeof search[key] === "string" ? (search[key] as string) : "";
  const status = value("status"),
    from = value("from"),
    to = value("to"),
    counselor = value("counselor"),
    page = value("page") || "1";
  if (status && !Object.hasOwn(statusLabels, status)) return null;
  const sort = search.sort === undefined ? "created_desc" : value("sort");
  if (sort !== "created_desc" && sort !== "starts_desc") return null;
  if (
    (from && !isDate(from)) ||
    (to && !isDate(to)) ||
    (from && to && from > to)
  )
    return null;
  if (counselor && !isUuid(counselor)) return null;
  if (!/^[1-9]\d{0,6}$/.test(page)) return null;
  if (value("exclude_cancelled") && value("exclude_cancelled") !== "1")
    return null;
  return {
    status: status as Filters["status"],
    from,
    to,
    counselor,
    page: Number(page),
    sort,
    excludeCancelled: value("exclude_cancelled") === "1",
  };
}
export function listUrl(filters: Filters, page = filters.page) {
  const params = new URLSearchParams();
  for (const key of ["status", "from", "to", "counselor"] as const)
    if (filters[key]) params.set(key, filters[key]);
  if (page > 1) params.set("page", String(page));
  if (filters.excludeCancelled) params.set("exclude_cancelled", "1");
  if (filters.sort !== "created_desc") params.set("sort", filters.sort);
  return `/admin/reservations${params.size ? `?${params}` : ""}`;
}
export function safeReturn(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 1000)
    return "/admin/reservations";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/admin/reservations" ||
      url.hash
    )
      return "/admin/reservations";
    const search: Search = {};
    for (const [key] of url.searchParams) {
      const values = url.searchParams.getAll(key);
      search[key] = values.length === 1 ? values[0] : values;
    }
    const filters = parseFilters(search);
    return filters ? listUrl(filters) : "/admin/reservations";
  } catch {
    return "/admin/reservations";
  }
}
export function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "기록 없음";
}
export type TransitionRow = {
  status: ReservationStatus;
  payment_method: string;
  starts_at: string;
  ends_at: string;
};
export function transitionPatch(
  row: TransitionRow,
  action: string,
  reason: string,
  now: Date,
) {
  const timestamp = now.toISOString();
  if (action === "confirm") {
    if (
      row.status !== "pending_payment" ||
      row.payment_method !== "bank_transfer"
    )
      return { error: "무통장입금 대기 예약만 확정할 수 있습니다." };
    if (!(Date.parse(row.starts_at) > now.getTime()))
      return { error: "상담 시작 시각이 지난 예약은 확정할 수 없습니다." };
    return { patch: { status: "confirmed", confirmed_at: timestamp } };
  }
  if (action === "complete") {
    if (row.status !== "confirmed")
      return { error: "확정된 예약만 완료할 수 있습니다." };
    if (!(Date.parse(row.ends_at) <= now.getTime()))
      return { error: "상담 종료 시각 이후에 완료할 수 있습니다." };
    return { patch: { status: "completed", completed_at: timestamp } };
  }
  if (action === "cancel") {
    if (row.status !== "pending_payment" && row.status !== "confirmed")
      return { error: "입금 대기 또는 확정된 예약만 취소할 수 있습니다." };
    const trimmed = reason.trim();
    if (!trimmed || [...trimmed].length > 500)
      return { error: "취소 사유를 1~500자로 입력해 주세요." };
    return {
      patch: {
        status: "cancelled",
        cancelled_at: timestamp,
        cancel_reason: trimmed,
      },
    };
  }
  return { error: "올바른 처리 동작을 선택해 주세요." };
}
