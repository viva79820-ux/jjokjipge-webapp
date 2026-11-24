export const channels = ["blog", "instagram", "youtube"] as const;
export type Channel = (typeof channels)[number];
export type PublishStatus = "" | "public" | "private";

export const channelLabels: Record<Channel, string> = {
  blog: "블로그",
  instagram: "인스타그램",
  youtube: "유튜브",
};
export const publicChannels = ["youtube", "instagram", "blog"] as const;

export type ContentRecord = {
  id: string;
  title: string;
  description: string | null;
  channel: Channel;
  external_url: string | null;
  thumbnail_path: string | null;
  thumbnail_alt: string | null;
  posted_on: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ContentPatch = {
  title: string;
  description: string | null;
  channel: Channel;
  external_url: string | null;
  thumbnail_path: string | null;
  thumbnail_alt: string | null;
  posted_on: string | null;
  is_published: boolean;
  sort_order: number;
};

export type PublicCard = {
  id: string;
  title: string;
  channel: Channel;
  href: string | null;
  thumbnail_path: string | null;
  thumbnail_alt: string | null;
  thumbnail_url: string | null;
  posted_on: string | null;
};

export const columns =
  "id,title,description,channel,external_url,thumbnail_path,thumbnail_alt,posted_on,is_published,sort_order,created_at,updated_at";
export const publicColumns =
  "id,title,channel,external_url,thumbnail_path,thumbnail_alt,posted_on,is_published,sort_order";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const pageSize = 20;
export const titleLimit = 100;
export const descriptionLimit = 1000;
export const altLimit = 200;
export const urlLimit = 2048;
export const sortMax = 2147483647;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const thumbnailPattern =
  /^contents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;
const storedUrlPattern =
  /^https:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::[0-9]{1,5})?(?:[/?#][^\u0000-\u001F\u007F-\u009F\s]*)?$/;
const authorityPattern =
  /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::[0-9]{1,5})?$/;
const titleControl = /[\u0000-\u001F\u007F\u0080-\u009F\u2028\u2029]/;
const descriptionControl =
  /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F\u2028\u2029]/;

export type Query = Record<string, string | string[] | undefined>;
export type PublicFilters = { page: number; channel: Channel | "" };
export type AdminFilters = {
  page: number;
  status: PublishStatus;
  deleted: boolean;
};

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export function isChannel(value: unknown): value is Channel {
  return value === "blog" || value === "instagram" || value === "youtube";
}

export function textLength(value: string) {
  return Array.from(value).length;
}

export function compareContents<
  T extends { sort_order: number; posted_on: string | null; id: string },
>(left: T, right: T) {
  if (left.sort_order !== right.sort_order)
    return left.sort_order - right.sort_order;
  if (left.posted_on !== right.posted_on) {
    if (left.posted_on === null) return 1;
    if (right.posted_on === null) return -1;
    return left.posted_on < right.posted_on ? 1 : -1;
  }
  if (left.id !== right.id) return left.id < right.id ? 1 : -1;
  return 0;
}

export const thumbnailPath = (value: unknown): value is string =>
  typeof value === "string" && thumbnailPattern.test(value);

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

export function imageMetadataValid(
  info: { size?: number; contentType?: string | null },
  path?: string,
) {
  const mime = info.contentType || "";
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : null;
  const pathExt = path?.split(".").at(-1);
  return (
    ext !== null &&
    typeof info.size === "number" &&
    Number.isInteger(info.size) &&
    info.size > 0 &&
    info.size <= maxBytes &&
    (!path ||
      (thumbnailPath(path) &&
        (pathExt === ext ||
          (mime === "image/jpeg" &&
            (pathExt === "jpg" || pathExt === "jpeg")))))
  );
}

export function publicThumbnailUrl(path: unknown) {
  if (!thumbnailPath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function strictDate(value: unknown): string | null | undefined {
  if (value === "") return null;
  if (typeof value !== "string") return undefined;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return undefined;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return undefined;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? value : undefined;
}

export function formatPostedOn(value: string | null) {
  return value ? value.replaceAll("-", ".") : "게시일 미입력";
}

function forbiddenUrlChar(value: string) {
  return (
    value.includes("\\") ||
    /[\u0000-\u0020\u007F-\u009F\u2028\u2029]/.test(value) ||
    /\s/u.test(value)
  );
}

export function parseExternalUrl(
  value: string,
): { state: "empty" } | { state: "invalid" } | { state: "ok"; href: string } {
  if (value === "") return { state: "empty" };
  if (
    !value.startsWith("https://") ||
    textLength(value) > urlLimit ||
    forbiddenUrlChar(value)
  )
    return { state: "invalid" };
  const rest = value.slice("https://".length);
  const boundary = rest.search(/[/?#]/);
  const authority = boundary === -1 ? rest : rest.slice(0, boundary);
  if (!authorityPattern.test(authority)) return { state: "invalid" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { state: "invalid" };
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname
  )
    return { state: "invalid" };
  const href = url.href;
  if (
    textLength(href) > urlLimit ||
    forbiddenUrlChar(href) ||
    !storedUrlPattern.test(href)
  )
    return { state: "invalid" };
  return { state: "ok", href };
}

export function confirmedSocialHref(value: string) {
  const parsed = parseExternalUrl(value);
  if (parsed.state !== "ok") return null;
  const hostname = new URL(parsed.href).hostname
    .replace(/\.$/, "")
    .toLowerCase();
  if (hostname === "example.com" || hostname.endsWith(".example.com"))
    return null;
  return parsed.href;
}

export function publicFilters(query: Query): PublicFilters | null {
  const allowed = ["page", "channel"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;
  const page = query.page || "1";
  const channel = query.channel || "";
  if (typeof page !== "string" || !/^[1-9]\d{0,6}$/.test(page)) return null;
  if (channel !== "" && !isChannel(channel)) return null;
  return { page: Number(page), channel };
}

export function adminFilters(query: Query): AdminFilters | null {
  const allowed = ["page", "status", "notice"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;
  const page = query.page || "1";
  const status = query.status || "";
  if (typeof page !== "string" || !/^[1-9]\d{0,6}$/.test(page)) return null;
  if (status !== "" && status !== "public" && status !== "private") return null;
  if (query.notice !== undefined && query.notice !== "deleted") return null;
  return {
    page: Number(page),
    status,
    deleted: query.notice === "deleted",
  };
}

export function publicListUrl(page = 1, channel: Channel | "" = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (channel) params.set("channel", channel);
  const query = params.toString();
  return `/contents${query ? `?${query}` : ""}`;
}

export function adminListUrl(
  page = 1,
  status: PublishStatus = "",
  deleted = false,
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (deleted) params.set("notice", "deleted");
  const query = params.toString();
  return `/admin/contents${query ? `?${query}` : ""}`;
}

export function returnUrl(value: unknown) {
  const base = adminListUrl();
  if (typeof value !== "string" || value.includes("\\") || value.length > 300)
    return base;
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/admin/contents" ||
      url.hash
    )
      return base;
    const query: Query = {};
    for (const key of url.searchParams.keys()) {
      const values = url.searchParams.getAll(key);
      query[key] = values.length === 1 ? values[0] : values;
    }
    const filters = adminFilters(query);
    return filters ? adminListUrl(filters.page, filters.status) : base;
  } catch {
    return base;
  }
}

export function adminEditUrl(id: string, returnTo: string, saved = false) {
  const params = new URLSearchParams();
  params.set("returnTo", returnUrl(returnTo));
  if (saved) params.set("saved", "1");
  return `/admin/contents/${id}?${params}`;
}

export function deletedListUrl(returnTo: string) {
  const filters = adminFilters(queryFrom(returnUrl(returnTo)));
  return adminListUrl(filters?.page || 1, filters?.status || "", true);
}

function queryFrom(value: string): Query {
  const url = new URL(value, "https://internal.invalid");
  const query: Query = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

function strictOrder(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value) || value.length > 10) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > sortMax) return null;
  if (String(parsed) !== value) return null;
  return parsed;
}

export function contentPatch(form: FormData): {
  errors: Record<string, string>;
  patch: ContentPatch | null;
} {
  const errors: Record<string, string> = {};
  const title = scalar(form, "title");
  const description = scalar(form, "description");
  const channel = scalar(form, "channel");
  const externalUrl = scalar(form, "external_url");
  const thumbnailText = scalar(form, "thumbnail_path");
  const altText = scalar(form, "thumbnail_alt");
  const postedText = scalar(form, "posted_on");
  const published = scalar(form, "is_published");
  const orderText = scalar(form, "sort_order");
  let trimmedTitle = "";
  if (title === null) errors.title = "제목을 한 칸의 글자로 입력해 주세요.";
  else if (titleControl.test(title))
    errors.title = "제목에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    trimmedTitle = title.trim();
    if (textLength(trimmedTitle) < 1 || textLength(trimmedTitle) > titleLimit)
      errors.title = "제목은 앞뒤 공백을 제외하고 1~100자로 입력해 주세요.";
  }
  const descriptionText =
    description === null ? null : description.replace(/\r\n?/g, "\n");
  let storedDescription: string | null = null;
  if (descriptionText === null)
    errors.description = "설명을 한 칸의 글자로 입력해 주세요.";
  else if (descriptionControl.test(descriptionText))
    errors.description =
      "설명에는 제어문자를 넣을 수 없습니다. 줄바꿈은 사용할 수 있습니다.";
  else if (descriptionText !== "" && !descriptionText.trim())
    errors.description = "설명은 비우거나 1~1000자로 입력해 주세요.";
  else {
    storedDescription = descriptionText.trim() || null;
    if (storedDescription && textLength(storedDescription) > descriptionLimit)
      errors.description = "설명은 비우거나 1~1000자로 입력해 주세요.";
  }
  if (!isChannel(channel)) errors.channel = "채널을 선택해 주세요.";
  let storedUrl: string | null = null;
  if (externalUrl === null)
    errors.external_url = "외부 주소를 한 칸의 글자로 입력해 주세요.";
  else {
    const parsed = parseExternalUrl(externalUrl);
    if (parsed.state === "invalid")
      errors.external_url =
        "외부 주소는 사용자 정보가 없는 HTTPS 주소로 입력해 주세요.";
    else storedUrl = parsed.state === "ok" ? parsed.href : null;
  }
  let thumbnail: string | null = null;
  if (thumbnailText === null)
    errors.thumbnail_path = "썸네일 경로를 한 칸의 글자로 보내 주세요.";
  else if (thumbnailText !== "" && !thumbnailPath(thumbnailText))
    errors.thumbnail_path = "썸네일 경로를 확인해 주세요.";
  else thumbnail = thumbnailText || null;
  let thumbnailAlt: string | null = null;
  if (altText === null)
    errors.thumbnail_alt = "썸네일 대체 설명을 한 칸의 글자로 입력해 주세요.";
  else if (titleControl.test(altText))
    errors.thumbnail_alt =
      "대체 설명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    const trimmed = altText.trim();
    if (thumbnail && !trimmed)
      errors.thumbnail_alt = "썸네일이 있으면 대체 설명을 입력해 주세요.";
    else if (trimmed && textLength(trimmed) > altLimit)
      errors.thumbnail_alt =
        "대체 설명은 공백을 제외하고 200자 이하로 입력해 주세요.";
    else thumbnailAlt = trimmed || null;
  }
  const postedOn = strictDate(postedText);
  if (postedOn === undefined)
    errors.posted_on =
      "게시일은 실제 존재하는 YYYY-MM-DD 날짜로 입력해 주세요.";
  if (published !== "true" && published !== "false")
    errors.is_published = "공개 여부를 확인해 주세요.";
  if (published === "true" && !storedUrl && !errors.external_url)
    errors.external_url = "공개하려면 외부 주소가 필요합니다.";
  const sortOrder = orderText === null ? null : strictOrder(orderText);
  if (sortOrder === null)
    errors.sort_order =
      "표시 순서는 0 이상 2147483647 이하의 정수로 입력해 주세요.";
  if (Object.keys(errors).length || !isChannel(channel) || sortOrder === null)
    return { errors, patch: null };
  return {
    errors,
    patch: {
      title: trimmedTitle,
      description: storedDescription,
      channel,
      external_url: storedUrl,
      thumbnail_path: thumbnail,
      thumbnail_alt: thumbnailAlt,
      posted_on: postedOn ?? null,
      is_published: published === "true",
      sort_order: sortOrder,
    },
  };
}

export function sameContent(row: ContentRecord, patch: ContentPatch) {
  return (
    row.title === patch.title &&
    row.description === patch.description &&
    row.channel === patch.channel &&
    row.external_url === patch.external_url &&
    row.thumbnail_path === patch.thumbnail_path &&
    row.thumbnail_alt === patch.thumbnail_alt &&
    row.posted_on === patch.posted_on &&
    row.is_published === patch.is_published &&
    row.sort_order === patch.sort_order
  );
}

export function contentMatches(row: ContentRecord, form: FormData) {
  const parsed = contentPatch(form);
  if (!parsed.patch) return false;
  return sameContent(row, parsed.patch);
}

export function presentPublic(row: {
  id?: unknown;
  title?: unknown;
  channel?: unknown;
  external_url?: unknown;
  thumbnail_path?: unknown;
  thumbnail_alt?: unknown;
  posted_on?: unknown;
  is_published?: unknown;
}): PublicCard | null {
  if (row.is_published !== true) return null;
  if (!uuid(row.id) || typeof row.title !== "string") return null;
  if (!isChannel(row.channel)) return null;
  let href: string | null = null;
  if (typeof row.external_url === "string" && row.external_url) {
    const parsed = parseExternalUrl(row.external_url);
    if (parsed.state === "ok") href = parsed.href;
  }
  const validPath = thumbnailPath(row.thumbnail_path)
    ? row.thumbnail_path
    : null;
  const validAlt =
    validPath &&
    typeof row.thumbnail_alt === "string" &&
    row.thumbnail_alt.trim() &&
    textLength(row.thumbnail_alt.trim()) <= altLimit
      ? row.thumbnail_alt.trim()
      : null;
  const postedOn =
    row.posted_on === null ? null : strictDate(row.posted_on) || null;
  return {
    id: row.id,
    title: row.title,
    channel: row.channel,
    href,
    thumbnail_path: validAlt ? validPath : null,
    thumbnail_alt: validAlt,
    thumbnail_url: validAlt ? publicThumbnailUrl(validPath) : null,
    posted_on: postedOn,
  };
}

export function contentRecord(row: {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  channel?: unknown;
  external_url?: unknown;
  thumbnail_path?: unknown;
  thumbnail_alt?: unknown;
  posted_on?: unknown;
  is_published?: unknown;
  sort_order?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): ContentRecord | null {
  const path = row.thumbnail_path === null ? null : row.thumbnail_path;
  const alt = row.thumbnail_alt === null ? null : row.thumbnail_alt;
  const posted = row.posted_on === null ? null : strictDate(row.posted_on);
  if (
    !uuid(row.id) ||
    typeof row.title !== "string" ||
    (row.description !== null && typeof row.description !== "string") ||
    !isChannel(row.channel) ||
    (row.external_url !== null && typeof row.external_url !== "string") ||
    (path !== null && !thumbnailPath(path)) ||
    (alt !== null &&
      (typeof alt !== "string" ||
        !alt.trim() ||
        textLength(alt.trim()) > altLimit)) ||
    (path !== null && alt === null) ||
    posted === undefined ||
    typeof row.is_published !== "boolean" ||
    typeof row.sort_order !== "number" ||
    !Number.isInteger(row.sort_order) ||
    row.sort_order < 0 ||
    row.sort_order > sortMax ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  )
    return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    channel: row.channel,
    external_url: row.external_url,
    thumbnail_path: path,
    thumbnail_alt: alt,
    posted_on: posted,
    is_published: row.is_published,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
