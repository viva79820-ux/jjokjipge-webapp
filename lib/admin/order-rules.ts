export const orderStatusLabels = {
  pending_payment: "입금 대기",
  payment_confirmed: "입금 확인",
  shipping: "배송 중",
  completed: "완료",
  cancelled: "취소",
} as const;

export type AdminOrderStatus = keyof typeof orderStatusLabels;
export type OrderSearch = Record<string, string | string[] | undefined>;
export type OrderFilters = {
  status: AdminOrderStatus | "";
  page: number;
};

export const ORDER_PAGE_SIZE = 20;
export const orderConflictMessage =
  "다른 작업으로 주문이 변경됐습니다. 새로고침 후 다시 확인해 주세요.";

export function isOrderUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function parseOrderFilters(search: OrderSearch): OrderFilters | null {
  if (
    Object.keys(search).some((key) => key !== "status" && key !== "page") ||
    Array.isArray(search.status) ||
    Array.isArray(search.page)
  )
    return null;
  const status = typeof search.status === "string" ? search.status : "";
  const page =
    typeof search.page === "string" && search.page ? search.page : "1";
  if (status && !Object.hasOwn(orderStatusLabels, status)) return null;
  if (!/^[1-9]\d{0,6}$/.test(page)) return null;
  return {
    status: status as OrderFilters["status"],
    page: Number(page),
  };
}

export function orderListUrl(filters: OrderFilters, page = filters.page) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (page > 1) params.set("page", String(page));
  return `/admin/orders${params.size ? `?${params}` : ""}`;
}

export function safeOrderReturn(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 1000) return "/admin/orders";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/admin/orders" ||
      url.hash
    )
      return "/admin/orders";
    const search: OrderSearch = {};
    for (const [key] of url.searchParams) {
      const values = url.searchParams.getAll(key);
      search[key] = values.length === 1 ? values[0] : values;
    }
    const filters = parseOrderFilters(search);
    return filters ? orderListUrl(filters) : "/admin/orders";
  } catch {
    return "/admin/orders";
  }
}

function normalizedTrackingNumber(value: string) {
  const trimmed = value.trim();
  return trimmed &&
    [...trimmed].length <= 100 &&
    !/[\u0000-\u001F\u007F]/.test(trimmed)
    ? trimmed
    : null;
}

export type OrderTransitionRow = {
  status: AdminOrderStatus;
  tracking_number: string | null;
};

export function orderTransitionPatch(
  row: OrderTransitionRow,
  action: string,
  trackingNumber: string,
) {
  if (action === "confirm") {
    if (row.status !== "pending_payment")
      return { error: "입금 대기 주문만 입금 확인할 수 있습니다." };
    return { patch: { status: "payment_confirmed" as const } };
  }
  if (action === "ship") {
    if (row.status !== "payment_confirmed")
      return { error: "입금 확인된 주문만 배송 중으로 변경할 수 있습니다." };
    const normalized = normalizedTrackingNumber(trackingNumber);
    if (!normalized)
      return { error: "송장번호를 1~100자의 텍스트로 입력해 주세요." };
    return {
      patch: {
        status: "shipping" as const,
        tracking_number: normalized,
      },
    };
  }
  if (action === "complete") {
    if (row.status !== "shipping" || !row.tracking_number)
      return { error: "배송 중인 주문만 완료할 수 있습니다." };
    return { patch: { status: "completed" as const } };
  }
  if (action === "cancel") {
    if (
      row.status !== "pending_payment" &&
      row.status !== "payment_confirmed" &&
      row.status !== "shipping"
    )
      return { error: "진행 중인 주문만 취소할 수 있습니다." };
    return { patch: { status: "cancelled" as const } };
  }
  return { error: "올바른 처리 동작을 선택해 주세요." };
}
