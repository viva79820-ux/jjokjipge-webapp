export type Notice = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  image_alt: string | null;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export const columns =
  "id,title,body,image_path,image_alt,is_pinned,is_published,published_at,created_at,updated_at";
export const summaryColumns = "id,title,is_pinned,is_published,published_at";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
export const imagePath = (s: unknown): s is string =>
  typeof s === "string" &&
  /^notices\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/.test(
    s,
  );
export type Query = Record<string, string | string[] | undefined>;
export function filters(q: Query, admin = false) {
  if (
    Object.keys(q).some(
      (k) =>
        !["page", ...(admin ? ["status", "notice"] : [])].includes(k) ||
        typeof q[k] !== "string",
    )
  )
    return null;
  const page = q.page || "1",
    status = q.status || "";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,6}$/.test(page) ||
    !["", "public", "private"].includes(String(status)) ||
    (q.notice !== undefined && q.notice !== "saved")
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    saved: q.notice === "saved",
  };
}
export function listUrl(admin: boolean, page = 1, status = "", saved = false) {
  const p = new URLSearchParams();
  if (page > 1) p.set("page", String(page));
  if (admin && status) p.set("status", status);
  if (admin && saved) p.set("notice", "saved");
  return `${admin ? "/admin" : ""}/notices${p.size ? `?${p}` : ""}`;
}
export function returnUrl(value: unknown, admin = true) {
  const base = listUrl(admin);
  if (typeof value !== "string" || value.includes("\\") || value.length > 300)
    return base;
  try {
    const u = new URL(value, "https://internal.invalid");
    if (
      u.origin !== "https://internal.invalid" ||
      u.pathname !== base ||
      u.hash
    )
      return base;
    const q: Query = {};
    for (const k of u.searchParams.keys()) {
      const a = u.searchParams.getAll(k);
      q[k] = a.length === 1 ? a[0] : a;
    }
    const f = filters(q, admin);
    return f ? listUrl(admin, f.page, f.status) : base;
  } catch {
    return base;
  }
}
export function scalar(f: FormData, key: string) {
  const v = f.getAll(key);
  return v.length === 1 && typeof v[0] === "string" ? v[0] : null;
}
export function parseNotice(f: FormData) {
  const errors: Record<string, string> = {};
  const title = scalar(f, "title"),
    body = scalar(f, "body"),
    alt = scalar(f, "image_alt"),
    path = scalar(f, "image_path"),
    pin = scalar(f, "is_pinned"),
    pub = scalar(f, "is_published");
  for (const [k, v, max] of [
    ["title", title, 100],
    ["body", body, 5000],
  ] as const)
    if (v === null || !v.trim() || v.length > max || v.includes("\0"))
      errors[k] = `1~${max}자로 입력해 주세요.`;
  if (
    alt === null ||
    alt.length > 200 ||
    (alt !== "" && !alt.trim()) ||
    alt.includes("\0") ||
    (path && !alt.trim())
  )
    errors.image_alt = "이미지 설명을 1~200자로 입력해 주세요.";
  if (path === null || (path !== "" && !imagePath(path)))
    errors.image_path = "이미지 경로를 확인해 주세요.";
  if (!["true", "false"].includes(pin || ""))
    errors.is_pinned = "고정 여부를 확인해 주세요.";
  if (!["true", "false"].includes(pub || ""))
    errors.is_published = "공개 여부를 확인해 주세요.";
  return {
    errors,
    patch: {
      title: title?.trim() || "",
      body: body?.trim() || "",
      image_path: path || null,
      image_alt: alt?.trim() || null,
      is_pinned: pin === "true",
      is_published: pub === "true",
    },
  };
}
export function publicImageUrl(path: string | null) {
  if (!imagePath(path)) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
export function noticeMatches(row: Notice, form: FormData) {
  const parsed = parseNotice(form);
  return (
    !Object.keys(parsed.errors).length &&
    (Object.keys(parsed.patch) as (keyof typeof parsed.patch)[]).every(
      (key) => row[key] === parsed.patch[key],
    )
  );
}
