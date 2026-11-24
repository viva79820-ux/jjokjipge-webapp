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
  is_published: boolean;
  sort_order: number;
};

export type PublicCard = {
  id: string;
  title: string;
  description: string | null;
  channel: Channel;
  href: string | null;
};

export const columns =
  "id,title,description,channel,external_url,is_published,sort_order,created_at,updated_at";
export const publicColumns =
  "id,title,description,channel,external_url,is_published,sort_order,created_at";
export const pageSize = 20;
export const titleLimit = 100;
export const descriptionLimit = 1000;
export const urlLimit = 2048;
export const sortMax = 2147483647;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
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
  T extends { sort_order: number; created_at: string; id: string },
>(left: T, right: T) {
  if (left.sort_order !== right.sort_order)
    return left.sort_order - right.sort_order;
  if (left.created_at !== right.created_at)
    return left.created_at < right.created_at ? 1 : -1;
  if (left.id !== right.id) return left.id < right.id ? 1 : -1;
  return 0;
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
  description?: unknown;
  channel?: unknown;
  external_url?: unknown;
  is_published?: unknown;
}): PublicCard | null {
  if (row.is_published !== true) return null;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  if (!isChannel(row.channel)) return null;
  const description =
    typeof row.description === "string" ? row.description : null;
  let href: string | null = null;
  if (typeof row.external_url === "string" && row.external_url) {
    const parsed = parseExternalUrl(row.external_url);
    if (parsed.state === "ok") href = parsed.href;
  }
  return {
    id: row.id,
    title: row.title,
    description,
    channel: row.channel,
    href,
  };
}
