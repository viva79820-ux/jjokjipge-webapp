export type ReviewTarget = {
  name: string;
} | null;

export type ReviewListItem = {
  id: string;
  counselor_id: string | null;
  product_id: string | null;
  author_name: string;
  rating: number;
  body: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  counselor: ReviewTarget;
  product: ReviewTarget;
};

export type ReviewQuery = Record<string, string | string[] | undefined>;

export const pageSize = 20;

export const reviewColumns =
  "id,counselor_id,product_id,author_name,rating,body,is_published,created_at,updated_at,counselor:counselors(name),product:products(name)";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function parseReviewQuery(query: ReviewQuery, admin = false) {
  const allowed = admin ? ["page", "status"] : ["page"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;

  const page = query.page ?? "1";
  const status = admin ? (query.status ?? "") : "";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,6}$/.test(page) ||
    typeof status !== "string" ||
    !["", "public", "private"].includes(status)
  )
    return null;

  return { page: Number(page), status };
}

export function reviewListUrl(admin: boolean, page = 1, status = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (admin && status) params.set("status", status);
  const query = params.toString();
  return `${admin ? "/admin" : ""}/reviews${query ? `?${query}` : ""}`;
}

export function reviewTarget(review: ReviewListItem) {
  if (review.counselor_id)
    return {
      kind: "상담",
      name: review.counselor?.name?.trim() || "상담사 후기",
    };
  return {
    kind: "상품",
    name: review.product?.name?.trim() || "타로샵 상품 후기",
  };
}

export function maskReviewAuthor(name: string) {
  const characters = [...name.trim()];
  if (characters.length <= 1) return characters[0] ? `${characters[0]}*` : "*";
  if (characters.length === 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}

export function formatReviewDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
