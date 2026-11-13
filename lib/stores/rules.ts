import { siteConfig } from "@/lib/site-config";

export type StoreRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  hours: string | null;
  phone: string | null;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type StorePatch = Pick<
  StoreRecord,
  | "name"
  | "description"
  | "address"
  | "hours"
  | "phone"
  | "image_path"
  | "sort_order"
  | "is_active"
>;

export const columns =
  "id,slug,name,description,address,hours,phone,image_path,sort_order,is_active,updated_at";
export const listColumns =
  "id,slug,name,address,image_path,sort_order,is_active";
export const writableFields = [
  "name",
  "description",
  "address",
  "hours",
  "phone",
  "image_path",
  "sort_order",
  "is_active",
] as const;
export const bucket = "public-images";
export const maxBytes = 5242880;
export const pageSize = 20;
const intMin = -2147483648;
const intMax = 2147483647;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const singleLineControl = /[\u0000-\u001F\u007F\u0080-\u009F\u2028\u2029]/;
const multilineControl =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F\u2028\u2029]/;

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
export const imagePath = (value: unknown): value is string =>
  typeof value === "string" &&
  /^stores\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/.test(
    value,
  );

export type Query = Record<string, string | string[] | undefined>;

export function filters(query: Query) {
  const allowed = ["page", "status", "store"];
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
    (query.store !== undefined && query.store !== "saved")
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    saved: query.store === "saved",
  };
}

export function listUrl(page = 1, status = "", saved = false) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (saved) params.set("store", "saved");
  const query = params.toString();
  return `/admin/stores${query ? `?${query}` : ""}`;
}

export function returnUrl(value: unknown) {
  const fallback = listUrl();
  if (typeof value !== "string" || value.includes("\\") || value.length > 300)
    return fallback;
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/admin/stores" ||
      url.hash
    )
      return fallback;
    const query: Query = {};
    for (const key of url.searchParams.keys()) {
      const values = url.searchParams.getAll(key);
      query[key] = values.length === 1 ? values[0] : values;
    }
    const parsed = filters(query);
    return parsed ? listUrl(parsed.page, parsed.status) : fallback;
  } catch {
    return fallback;
  }
}

export function savedListUrl(back: string) {
  const safe = returnUrl(back);
  return `${safe}${safe.includes("?") ? "&" : "?"}store=saved`;
}

export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function strictInt(value: string) {
  if (!/^(?:0|-?[1-9]\d*)$/.test(value)) return null;
  if (value.startsWith("-") ? value.length > 11 : value.length > 10)
    return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < intMin || parsed > intMax)
    return null;
  if (String(parsed) !== value) return null;
  return parsed;
}

function optionalText(
  value: string | null,
  max: number,
  name: string,
  multiline: boolean,
  errors: Record<string, string>,
  key: string,
) {
  if (value === null) {
    errors[key] = `${name} 형식이 올바르지 않습니다.`;
    return null;
  }
  if ((multiline ? multilineControl : singleLineControl).test(value)) {
    errors[key] = multiline
      ? `${name}에는 허용되지 않는 제어문자가 있습니다.`
      : `${name}에는 줄바꿈이나 제어문자를 넣을 수 없습니다.`;
    return null;
  }
  const named = name === "영업시간" ? "영업시간은" : `${name}는`;
  if (value !== "" && !value.trim()) {
    errors[key] = `${named} 공백만 입력할 수 없습니다.`;
    return null;
  }
  const trimmed = value.trim();
  if ([...trimmed].length > max) {
    errors[key] = `${named} ${max}자 이하여야 합니다.`;
    return null;
  }
  return trimmed || null;
}

type PhoneResult = { empty: true } | { error: true } | { value: string };

export function phoneText(value: string): PhoneResult {
  if (singleLineControl.test(value)) return { error: true as const };
  const trimmed = value.trim();
  if (!trimmed)
    return value === "" ? { empty: true as const } : { error: true as const };
  const digits = trimmed.replace(/\D/g, "");
  const compact = `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
  if (
    [...trimmed].length > 30 ||
    singleLineControl.test(trimmed) ||
    !/^\+?(?:\(\d+\)|\d)[\d\s()-]*$/.test(trimmed) ||
    !/^\+?\d{8,15}$/.test(compact)
  )
    return { error: true as const };
  return { value: trimmed };
}

export function storeTelHref(phone: string) {
  const fallback = `tel:${siteConfig.phone}`;
  const parsed = phoneText(phone);
  if (!("value" in parsed)) return fallback;
  const digits = parsed.value.replace(/\D/g, "");
  const compact = `${parsed.value.startsWith("+") ? "+" : ""}${digits}`;
  if (!/^\+?\d{8,15}$/.test(compact)) return fallback;
  return `tel:${compact}`;
}

export function parseStore(form: FormData) {
  const errors: Record<string, string> = {};
  const name = scalar(form, "name");
  const description = scalar(form, "description");
  const address = scalar(form, "address");
  const hours = scalar(form, "hours");
  const phone = scalar(form, "phone");
  const path = scalar(form, "image_path");
  const active = scalar(form, "is_active");
  const order = scalar(form, "sort_order");
  let trimmedName = "";
  if (name === null) errors.name = "매장명을 한 칸의 글자로 입력해 주세요.";
  else if (singleLineControl.test(name))
    errors.name = "매장명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    trimmedName = name.trim();
    if ([...trimmedName].length < 1 || [...trimmedName].length > 100)
      errors.name = "매장명은 앞뒤 공백을 제외하고 1~100자로 입력해 주세요.";
  }
  const descriptionValue = optionalText(
    description,
    5000,
    "소개",
    true,
    errors,
    "description",
  );
  const addressValue = optionalText(
    address,
    500,
    "주소",
    false,
    errors,
    "address",
  );
  const hoursValue = optionalText(
    hours,
    1000,
    "영업시간",
    true,
    errors,
    "hours",
  );
  let phoneValue: string | null = null;
  if (phone === null) errors.phone = "전화번호 형식을 확인해 주세요.";
  else {
    const parsedPhone = phoneText(phone);
    if ("error" in parsedPhone)
      errors.phone =
        "전화번호는 8~15자리 숫자로 30자 이하로 입력해 주세요. 비워 두면 대표번호를 사용합니다.";
    else if ("value" in parsedPhone) phoneValue = parsedPhone.value;
  }
  if (path === null || (path !== "" && !imagePath(path)))
    errors.image_path = "사진 경로를 확인해 주세요.";
  if (active !== "true" && active !== "false")
    errors.is_active = "공개 여부를 확인해 주세요.";
  const sortOrder =
    order === null || singleLineControl.test(order) ? null : strictInt(order);
  if (sortOrder === null)
    errors.sort_order =
      "정렬 순서는 -2147483648 이상 2147483647 이하의 정수로 입력해 주세요.";
  const patch: StorePatch = {
    name: trimmedName,
    description: descriptionValue,
    address: addressValue,
    hours: hoursValue,
    phone: phoneValue,
    image_path: path || null,
    sort_order: sortOrder ?? 0,
    is_active: active === "true",
  };
  return { errors, patch };
}

export function sameStore(row: StoreRecord, patch: StorePatch) {
  return writableFields.every((key) => row[key] === patch[key]);
}

export function storeMatches(row: StoreRecord, form: FormData) {
  const parsed = parseStore(form);
  if (Object.keys(parsed.errors).length) return false;
  return sameStore(row, parsed.patch);
}

export function publicImageUrl(path: string | null) {
  if (!imagePath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function imageMetadataValid(info: {
  size?: number;
  contentType?: string | null;
}) {
  return (
    typeof info.size === "number" &&
    Number.isInteger(info.size) &&
    info.size > 0 &&
    info.size <= maxBytes &&
    ["image/jpeg", "image/png", "image/webp"].includes(info.contentType || "")
  );
}
