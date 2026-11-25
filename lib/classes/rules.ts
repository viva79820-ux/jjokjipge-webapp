export type ClassField = "saju" | "tarot";

export type ClassRecord = {
  id: string;
  title: string;
  description: string;
  field: ClassField;
  video_url: string | null;
  is_online: boolean;
  poster_path: string | null;
  poster_alt: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ClassPatch = Pick<
  ClassRecord,
  | "title"
  | "description"
  | "field"
  | "video_url"
  | "is_online"
  | "poster_path"
  | "poster_alt"
  | "is_published"
  | "sort_order"
>;

export type PublicClassSummary = {
  id: string;
  title: string;
  description: string;
  field: ClassField;
  is_online: boolean;
  poster_path: string | null;
  poster_alt: string | null;
  sort_order: number;
  created_at: string;
};

export type PublicClassDetail = PublicClassSummary & {
  video_url: string | null;
};

export const columns =
  "id,title,description,field,video_url,is_online,poster_path,poster_alt,is_published,sort_order,created_at,updated_at";
export const publicListColumns =
  "id,title,description,field,is_online,poster_path,poster_alt,sort_order,created_at";
export const publicDetailColumns =
  "id,title,description,field,video_url,is_online,poster_path,poster_alt,is_published,sort_order,created_at";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const pageSize = 20;
export const fieldLabels: Record<ClassField, string> = {
  saju: "사주",
  tarot: "타로",
};

const intMax = 2147483647;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const posterPattern =
  /^classes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;
const videoPattern =
  /^https:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::[0-9]{1,5})?(?:[/?#][^\s\u0000-\u001F\u007F-\u009F]*)?$/;
const videoError =
  "영상 주소는 공백·제어문자·로그인 정보가 없는 HTTPS 주소로 입력해 주세요.";

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export const posterPath = (value: unknown): value is string =>
  typeof value === "string" && posterPattern.test(value);

export function charLength(value: string) {
  return Array.from(value).length;
}

export function fieldLabel(field: string) {
  return field === "saju" || field === "tarot" ? fieldLabels[field] : "";
}

export type ClassQuery = Record<string, string | string[] | undefined>;

export type ClassFilters = {
  page: number;
  status: string;
  result: string;
  field: string;
};

export const publicFieldFilters = [
  { value: "", label: "전체" },
  { value: "saju", label: "사주" },
  { value: "tarot", label: "타로" },
] as const;

export function classFilters(
  query: ClassQuery,
  admin = false,
): ClassFilters | null {
  const allowed = admin ? ["page", "status", "result"] : ["page", "field"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;
  const page = query.page || "1";
  const status = admin ? query.status || "" : "";
  const result = admin ? query.result || "" : "";
  const field = admin ? "" : query.field || "";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,6}$/.test(page) ||
    !["", "public", "private"].includes(String(status)) ||
    !["", "saved", "deleted"].includes(String(result)) ||
    !["", "saju", "tarot"].includes(String(field))
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    result: String(result),
    field: String(field),
  };
}

export function classListUrl(
  admin: boolean,
  page = 1,
  status = "",
  result = "",
  field = "",
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (admin && status) params.set("status", status);
  if (admin && result) params.set("result", result);
  if (!admin && field) params.set("field", field);
  const base = admin ? "/admin/classes" : "/class";
  return `${base}${params.size ? `?${params}` : ""}`;
}

export function classEditUrl(id: string, page = 1, status = "", result = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (result) params.set("result", result);
  return `/admin/classes/${id}${params.size ? `?${params}` : ""}`;
}

export function classNewUrl(page = 1, status = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  return `/admin/classes/new${params.size ? `?${params}` : ""}`;
}

export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function hasControl(value: string) {
  return /[\u0000-\u001F\u007F\u0080-\u009F\u2028\u2029]/.test(value);
}

function descriptionControls(value: string) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/.test(
    value,
  );
}

function strictSort(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value) || value.length > 10) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > intMax) return null;
  if (String(parsed) !== value) return null;
  return parsed;
}

export function parseVideoUrl(value: string): {
  url: string | null;
  error: string;
} {
  if (value === "") return { url: null, error: "" };
  if (
    value.includes("\\") ||
    charLength(value) > 2048 ||
    !videoPattern.test(value)
  )
    return { url: null, error: videoError };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: videoError };
  }
  const authority = value.slice("https://".length).split(/[/?#]/, 1)[0] ?? "";
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    authority.includes("@") ||
    parsed.hostname === ""
  )
    return { url: null, error: videoError };
  const normalized = parsed.href;
  if (
    normalized.includes("\\") ||
    charLength(normalized) > 2048 ||
    !videoPattern.test(normalized)
  )
    return { url: null, error: videoError };
  return { url: normalized, error: "" };
}

export function publicVideoHref(value: unknown) {
  if (typeof value !== "string" || value === "") return null;
  const parsed = parseVideoUrl(value);
  return parsed.error || !parsed.url ? null : parsed.url;
}

export function imageKind(bytes: Uint8Array) {
  const ext =
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "jpg"
      : bytes.length >= 8 &&
          bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
        ? "png"
        : bytes.length >= 12 &&
            String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
          ? "webp"
          : null;
  if (!ext) return null;
  return {
    ext,
    mime: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
  } as const;
}

export function imageMetadataValid(info: {
  size?: number;
  contentType?: string | null;
}) {
  const mime = info.contentType || "";
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : null;
  return (
    ext !== null &&
    typeof info.size === "number" &&
    Number.isInteger(info.size) &&
    info.size > 0 &&
    info.size <= maxBytes
  );
}

export function publicPosterUrl(path: string | null) {
  if (!posterPath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function parseClass(form: FormData) {
  const errors: Record<string, string> = {};
  const title = scalar(form, "title");
  const description = scalar(form, "description");
  const field = scalar(form, "field");
  const video = scalar(form, "video_url");
  const online = scalar(form, "is_online");
  const pathText = scalar(form, "poster_path");
  const altText = scalar(form, "poster_alt");
  const published = scalar(form, "is_published");
  const orderText = scalar(form, "sort_order");
  let titleValue = "";
  if (title === null) errors.title = "제목을 한 칸의 글자로 입력해 주세요.";
  else if (hasControl(title))
    errors.title = "제목에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    titleValue = title.trim();
    if (charLength(titleValue) < 1 || charLength(titleValue) > 100)
      errors.title = "제목은 앞뒤 공백을 제외하고 1~100자로 입력해 주세요.";
  }
  let descriptionValue = "";
  if (description === null)
    errors.description = "설명을 한 칸의 글자로 입력해 주세요.";
  else if (descriptionControls(description))
    errors.description = "설명에는 허용되지 않은 제어문자를 넣을 수 없습니다.";
  else {
    descriptionValue = description.trim();
    if (
      charLength(descriptionValue) < 1 ||
      charLength(descriptionValue) > 5000 ||
      !/[^\s]/u.test(descriptionValue)
    )
      errors.description =
        "설명은 앞뒤 공백을 제외하고 1~5000자로 입력해 주세요.";
  }
  if (field !== "saju" && field !== "tarot")
    errors.field = "분야는 사주 또는 타로 중 하나여야 합니다.";
  let videoUrl: string | null = null;
  if (video === null)
    errors.video_url = "영상 주소를 한 칸의 글자로 입력해 주세요.";
  else {
    const parsed = parseVideoUrl(video);
    if (parsed.error) errors.video_url = parsed.error;
    else videoUrl = parsed.url;
  }
  if (online !== "true" && online !== "false")
    errors.is_online =
      "수업 형태는 온라인 또는 오프라인으로만 보낼 수 있습니다.";
  const isOnline = online === "true";
  let posterPathValue: string | null = null;
  if (pathText === null)
    errors.poster_path = "포스터 경로를 한 칸의 글자로 보내 주세요.";
  else if (pathText !== "" && !posterPath(pathText))
    errors.poster_path = "포스터 경로를 확인해 주세요.";
  else posterPathValue = pathText || null;
  let posterAlt: string | null = null;
  if (altText === null)
    errors.poster_alt = "포스터 대체 설명을 한 칸의 글자로 입력해 주세요.";
  else if (hasControl(altText))
    errors.poster_alt = "대체 설명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    const trimmed = altText.trim();
    if (posterPathValue && (!trimmed || !/[^\s]/u.test(trimmed)))
      errors.poster_alt = "포스터가 있으면 대체 설명을 입력해 주세요.";
    else if (trimmed && (charLength(trimmed) > 200 || !/[^\s]/u.test(trimmed)))
      errors.poster_alt =
        "대체 설명은 공백을 제외하고 200자 이하로 입력해 주세요.";
    else posterAlt = trimmed || null;
  }
  if (published !== "true" && published !== "false")
    errors.is_published = "공개 여부는 예 또는 아니오로만 보낼 수 있습니다.";
  else if (
    published === "true" &&
    isOnline &&
    !errors.video_url &&
    videoUrl === null
  )
    errors.video_url = "온라인으로 공개하려면 유효한 영상 주소가 필요합니다.";
  const sortOrder = orderText === null ? null : strictSort(orderText);
  if (sortOrder === null)
    errors.sort_order =
      "표시 순서는 0 이상 2147483647 이하의 정수로 입력해 주세요.";
  const patch: ClassPatch = {
    title: titleValue,
    description: descriptionValue,
    field: field === "tarot" ? "tarot" : "saju",
    video_url: videoUrl,
    is_online: isOnline,
    poster_path: posterPathValue,
    poster_alt: posterAlt,
    is_published: published === "true",
    sort_order: sortOrder ?? 0,
  };
  return { errors, patch };
}

export function sameClass(row: ClassRecord, patch: ClassPatch) {
  return (
    row.title === patch.title &&
    row.description === patch.description &&
    row.field === patch.field &&
    row.video_url === patch.video_url &&
    row.is_online === patch.is_online &&
    row.poster_path === patch.poster_path &&
    row.poster_alt === patch.poster_alt &&
    row.is_published === patch.is_published &&
    row.sort_order === patch.sort_order
  );
}

export function classMatches(row: ClassRecord, form: FormData) {
  const parsed = parseClass(form);
  return !Object.keys(parsed.errors).length && sameClass(row, parsed.patch);
}

export function summarize(description: string, limit = 80) {
  const flat = description.replace(/[ \t\r\n]+/g, " ").trim();
  const chars = Array.from(flat);
  if (chars.length <= limit) return flat;
  return `${chars.slice(0, limit).join("")}…`;
}
