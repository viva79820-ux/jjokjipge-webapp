import { returnUrl } from "@/lib/counselors/rules";

export type ProductCounselor = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  approval_status: "pending" | "approved" | "rejected";
};

export type ProductRecord = {
  id: string;
  counselor_id: string;
  name: string;
  minutes: number;
  price: number;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type ProductPatch = Pick<
  ProductRecord,
  "name" | "minutes" | "price" | "sort_order" | "is_active"
>;

export const columns =
  "id,counselor_id,name,minutes,price,sort_order,is_active,updated_at";
export const writableFields = [
  "name",
  "minutes",
  "price",
  "sort_order",
  "is_active",
] as const;
export const pageSize = 20;

const intMin = -2147483648;
const intMax = 2147483647;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export type ProductQuery = Record<string, string | string[] | undefined>;

export type ProductFilters = {
  page: number;
  status: string;
  counselorReturn: string;
  saved: boolean;
};

export function productFilters(query: ProductQuery): ProductFilters | null {
  const allowed = ["page", "status", "counselorReturn", "product"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;
  const page = query.page || "1";
  const status = query.status || "";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,6}$/.test(page) ||
    !["", "public", "private"].includes(String(status)) ||
    (query.product !== undefined && query.product !== "saved")
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    counselorReturn: returnUrl(query.counselorReturn),
    saved: query.product === "saved",
  };
}

export function productListUrl(
  counselorId: string,
  page = 1,
  status = "",
  counselorReturn = "",
  saved = false,
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  params.set("counselorReturn", returnUrl(counselorReturn));
  if (saved) params.set("product", "saved");
  return `/admin/counselors/${counselorId}/products?${params}`;
}

export function productFormUrl(
  counselorId: string,
  productId: string,
  filters: Pick<ProductFilters, "page" | "status" | "counselorReturn">,
) {
  const params = new URLSearchParams();
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.status) params.set("status", filters.status);
  params.set("counselorReturn", returnUrl(filters.counselorReturn));
  return `/admin/counselors/${counselorId}/products/${productId}?${params}`;
}

export function counselorAdminUrl(
  counselorId: string,
  counselorReturn: string,
) {
  const back = returnUrl(counselorReturn);
  return `/admin/counselors/${counselorId}?returnTo=${encodeURIComponent(back)}`;
}

export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function strictInt(value: string, min: number, max: number) {
  if (!/^(0|-?[1-9]\d*)$/.test(value)) return null;
  if (value.startsWith("-") ? value.length > 11 : value.length > 10)
    return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    return null;
  if (String(parsed) !== value) return null;
  return parsed;
}

function hasControl(value: string) {
  return /[\u0000-\u001F\u007F\u0080-\u009F\u2028\u2029]/.test(value);
}

export function parseProduct(form: FormData) {
  const errors: Record<string, string> = {};
  const name = scalar(form, "name");
  const minutesText = scalar(form, "minutes");
  const priceText = scalar(form, "price");
  const orderText = scalar(form, "sort_order");
  const active = scalar(form, "is_active");
  let trimmedName = "";
  if (name === null) errors.name = "상품명을 한 칸의 글자로 입력해 주세요.";
  else if (hasControl(name))
    errors.name = "상품명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    trimmedName = name.trim();
    if ([...trimmedName].length < 1 || [...trimmedName].length > 100)
      errors.name = "상품명은 앞뒤 공백을 제외하고 1~100자로 입력해 주세요.";
  }
  const minutes =
    minutesText === null ? null : strictInt(minutesText, 1, intMax);
  if (minutes === null)
    errors.minutes =
      "상담 시간은 1 이상 2147483647 이하의 정수로 입력해 주세요.";
  const price = priceText === null ? null : strictInt(priceText, 0, intMax);
  if (price === null)
    errors.price = "가격은 0 이상 2147483647 이하의 정수로 입력해 주세요.";
  const sortOrder =
    orderText === null ? null : strictInt(orderText, intMin, intMax);
  if (sortOrder === null)
    errors.sort_order =
      "정렬 순서는 -2147483648 이상 2147483647 이하의 정수로 입력해 주세요.";
  if (active !== "true" && active !== "false")
    errors.is_active = "공개 여부를 확인해 주세요.";
  const patch: ProductPatch = {
    name: trimmedName,
    minutes: minutes ?? 0,
    price: price ?? 0,
    sort_order: sortOrder ?? 0,
    is_active: active === "true",
  };
  return { errors, patch };
}

export function sameProduct(
  row: ProductRecord,
  counselorId: string,
  patch: ProductPatch,
) {
  return (
    row.counselor_id === counselorId &&
    row.name === patch.name &&
    row.minutes === patch.minutes &&
    row.price === patch.price &&
    row.sort_order === patch.sort_order &&
    row.is_active === patch.is_active
  );
}

export function productMatches(row: ProductRecord, form: FormData) {
  const parsed = parseProduct(form);
  const counselorId = scalar(form, "counselor_id");
  if (Object.keys(parsed.errors).length || !counselorId) return false;
  return sameProduct(row, counselorId, parsed.patch);
}
