export type CounselorField = "tarot" | "saju";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type CounselorRecord = {
  id: string;
  slug: string;
  store_id: string | null;
  name: string;
  field: CounselorField;
  fields: CounselorField[];
  tags: string[];
  careers: string[];
  intro: string | null;
  description: string | null;
  image_path: string | null;
  is_recommended: boolean;
  is_new: boolean;
  is_active: boolean;
  sort_order: number;
  affiliation: "store" | "partner";
  approval_status: ApprovalStatus;
  expert_url: string | null;
  updated_at: string;
};
export type CounselorPatch = Pick<
  CounselorRecord,
  | "name"
  | "field"
  | "fields"
  | "tags"
  | "careers"
  | "intro"
  | "description"
  | "image_path"
  | "is_recommended"
  | "is_new"
  | "is_active"
  | "sort_order"
  | "store_id"
>;
export const columns =
  "id,slug,store_id,name,field,fields,tags,careers,intro,description,image_path,is_recommended,is_new,is_active,sort_order,affiliation,approval_status,expert_url,updated_at";
export const listColumns =
  "id,slug,name,field,fields,image_path,is_active,is_recommended,is_new,approval_status,sort_order,stores(name,is_active)";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const fieldLabel: Record<CounselorField, string> = {
  tarot: "타로",
  saju: "사주",
};
export const approvalLabel: Record<ApprovalStatus, string> = {
  pending: "승인 대기",
  approved: "승인",
  rejected: "거절",
};
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
export const imagePath = (value: unknown): value is string =>
  typeof value === "string" &&
  /^counselors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/.test(
    value,
  );
export type Query = Record<string, string | string[] | undefined>;
export function filters(query: Query) {
  const allowed = ["page", "status", "counselor"];
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
    (query.counselor !== undefined && query.counselor !== "saved")
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    saved: query.counselor === "saved",
  };
}
export function listUrl(page = 1, status = "", saved = false) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (saved) params.set("counselor", "saved");
  const query = params.toString();
  return `/admin/counselors${query ? `?${query}` : ""}`;
}
export function returnUrl(value: unknown) {
  const fallback = listUrl();
  if (typeof value !== "string" || value.includes("\\") || value.length > 300)
    return fallback;
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/admin/counselors" ||
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
export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}
export function stringArray(form: FormData, key: string) {
  const values = form.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  try {
    const parsed = JSON.parse(values[0]);
    if (
      !Array.isArray(parsed) ||
      parsed.some((item) => typeof item !== "string")
    )
      return null;
    return parsed as string[];
  } catch {
    return null;
  }
}
function cleanText(value: string) {
  return value.trim();
}
export function parseCounselor(form: FormData) {
  const errors: Record<string, string> = {};
  const name = scalar(form, "name");
  const representative = scalar(form, "field");
  const fields = stringArray(form, "fields");
  const tags = stringArray(form, "tags");
  const careers = stringArray(form, "careers");
  const intro = scalar(form, "intro");
  const description = scalar(form, "description");
  const path = scalar(form, "image_path");
  const store = scalar(form, "store_id");
  const recommended = scalar(form, "is_recommended");
  const fresh = scalar(form, "is_new");
  const active = scalar(form, "is_active");
  const order = scalar(form, "sort_order");
  const trimmedName = name === null ? "" : cleanText(name);
  if (
    name === null ||
    !trimmedName ||
    [...trimmedName].length > 30 ||
    name.includes("\0")
  )
    errors.name = "이름을 공백 없이 1~30자로 입력해 주세요.";
  if (!fields) errors.fields = "전체 분야 형식이 올바르지 않습니다.";
  else if (
    fields.length < 1 ||
    fields.length > 2 ||
    new Set(fields).size !== fields.length ||
    fields.some((item) => item !== "tarot" && item !== "saju")
  )
    errors.fields = "타로와 사주 중에서 1~2개를 중복 없이 선택해 주세요.";
  if (representative !== "tarot" && representative !== "saju")
    errors.field = "대표 분야를 선택해 주세요.";
  else if (fields && !errors.fields && !fields.includes(representative))
    errors.field = "대표 분야는 선택한 전체 분야 중 하나여야 합니다.";
  if (store === null || (store !== "" && !uuid(store)))
    errors.store_id = "소속 매장 형식이 올바르지 않습니다.";
  if (intro === null || intro.includes("\0") || /[\r\n]/.test(intro))
    errors.intro = "한 줄 소개 형식이 올바르지 않습니다.";
  else if (intro !== "" && !cleanText(intro))
    errors.intro = "한 줄 소개는 공백만 입력할 수 없습니다.";
  else if ([...cleanText(intro)].length > 150)
    errors.intro = "한 줄 소개는 150자 이하여야 합니다.";
  if (description === null || description.includes("\0"))
    errors.description = "상세 소개 형식이 올바르지 않습니다.";
  else if (description !== "" && !cleanText(description))
    errors.description = "상세 소개는 공백만 입력할 수 없습니다.";
  else if ([...cleanText(description)].length > 5000)
    errors.description = "상세 소개는 5000자 이하여야 합니다.";
  if (!tags) errors.tags = "상담 주제 형식이 올바르지 않습니다.";
  else if (tags.length > 8)
    errors.tags = "상담 주제는 8개까지 입력할 수 있습니다.";
  else if (
    tags.some(
      (item) =>
        item.includes("\0") ||
        !cleanText(item) ||
        [...cleanText(item)].length > 20,
    )
  )
    errors.tags = "상담 주제는 공백만으로 둘 수 없고 20자 이하여야 합니다.";
  if (!careers) errors.careers = "경력 목록 형식이 올바르지 않습니다.";
  else if (careers.length > 20)
    errors.careers = "경력은 20개까지 입력할 수 있습니다.";
  else if (
    careers.some(
      (item) =>
        item.includes("\0") ||
        !cleanText(item) ||
        [...cleanText(item)].length > 200,
    )
  )
    errors.careers = "경력 항목은 공백만으로 둘 수 없고 200자 이하여야 합니다.";
  if (path === null || (path !== "" && !imagePath(path)))
    errors.image_path = "사진 경로를 확인해 주세요.";
  if (recommended !== "true" && recommended !== "false")
    errors.is_recommended = "추천 여부를 확인해 주세요.";
  if (fresh !== "true" && fresh !== "false")
    errors.is_new = "신규 여부를 확인해 주세요.";
  if (active !== "true" && active !== "false")
    errors.is_active = "공개 여부를 확인해 주세요.";
  if (order === null || !/^(0|[1-9]\d{0,3})$/.test(order))
    errors.sort_order = "표시 순서는 0~9999 정수로 입력해 주세요.";
  const patch: CounselorPatch = {
    name: trimmedName,
    field: representative === "saju" ? "saju" : "tarot",
    fields: (fields || []) as CounselorField[],
    tags: (tags || []).map(cleanText),
    careers: (careers || []).map(cleanText),
    intro: intro ? cleanText(intro) : null,
    description: description ? cleanText(description) : null,
    image_path: path || null,
    is_recommended: recommended === "true",
    is_new: fresh === "true",
    is_active: active === "true",
    sort_order: order && /^\d+$/.test(order) ? Number(order) : 0,
    store_id: store || null,
  };
  return { errors, patch };
}
export function counselorMatches(row: CounselorRecord, form: FormData) {
  const parsed = parseCounselor(form);
  if (Object.keys(parsed.errors).length) return false;
  const patch = parsed.patch;
  return (
    row.name === patch.name &&
    row.field === patch.field &&
    sameItems(row.fields, patch.fields) &&
    sameItems(row.tags, patch.tags) &&
    sameItems(row.careers, patch.careers) &&
    row.intro === patch.intro &&
    row.description === patch.description &&
    row.image_path === patch.image_path &&
    row.is_recommended === patch.is_recommended &&
    row.is_new === patch.is_new &&
    row.is_active === patch.is_active &&
    row.sort_order === patch.sort_order &&
    row.store_id === patch.store_id
  );
}
function sameItems(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}
export function publicImageUrl(path: string | null) {
  if (!imagePath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
export function counselorHeading(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/(?:선생님|쌤|샘)$/.test(trimmed)) return trimmed;
  return `${trimmed} 선생님`;
}
export function counselorNeedsHonorific(name: string) {
  const trimmed = name.trim();
  return Boolean(trimmed) && !/(?:선생님|쌤|샘)$/.test(trimmed);
}
export function displayChips(input: {
  field: CounselorField;
  fields: readonly CounselorField[];
  tags: readonly string[];
}) {
  const chips: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const label = value.trim();
    if (!label || seen.has(label)) return;
    seen.add(label);
    chips.push(label);
  };
  add(fieldLabel[input.field]);
  for (const item of input.fields) add(fieldLabel[item]);
  for (const tag of input.tags) add(tag);
  return chips;
}
export function filterByField<T extends { fields: readonly CounselorField[] }>(
  items: readonly T[],
  type: string,
) {
  if (type !== "tarot" && type !== "saju") return [...items];
  return items.filter((item) => item.fields.includes(type));
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
