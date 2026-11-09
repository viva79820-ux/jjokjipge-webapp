import { categoryLabels } from "../inquiries/validation";
export { categoryLabels };
export type Kind = "faqs" | "inquiries";
export type Search = Record<string, string | string[] | undefined>;
export const faqCategories = Object.fromEntries(
  Object.entries(categoryLabels).filter(([key]) => key !== "other"),
);
export const inquiryStatuses = { pending: "답변 대기", answered: "답변 완료" };
export const visibilityLabels = { public: "공개", private: "비공개" };
export const uuid = (s: string) =>
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
export const versionValid = (s: string) =>
  s.length <= 50 &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    s,
  ) &&
  Number.isFinite(Date.parse(s));
export const conflict = {
  faqs: "다른 작업으로 FAQ가 변경됐습니다. 최신 내용을 확인해 주세요.",
  inquiries: "다른 작업으로 문의가 변경됐습니다. 최신 내용을 확인해 주세요.",
};
export type Filters = { category: string; status: string; page: number };
export function parseSupportFilters(
  kind: Kind,
  search: Search,
): Filters | null {
  if (
    Object.keys(search).some(
      (key) =>
        !["category", "status", "page"].includes(key) ||
        typeof search[key] !== "string",
    )
  )
    return null;
  const category = (search.category as string) || "",
    status = (search.status as string) || "",
    page = (search.page as string) || "1";
  if (
    (category &&
      !Object.hasOwn(
        kind === "faqs" ? faqCategories : categoryLabels,
        category,
      )) ||
    (status &&
      !Object.hasOwn(
        kind === "faqs" ? visibilityLabels : inquiryStatuses,
        status,
      )) ||
    !/^[1-9]\d{0,6}$/.test(page)
  )
    return null;
  return { category, status, page: Number(page) };
}
export function supportUrl(kind: Kind, filters: Filters, page = filters.page) {
  const p = new URLSearchParams();
  if (filters.category) p.set("category", filters.category);
  if (filters.status) p.set("status", filters.status);
  if (page > 1) p.set("page", String(page));
  return `/admin/support/${kind}${p.size ? `?${p}` : ""}`;
}
export function supportReturn(kind: Kind, value: unknown) {
  const base = `/admin/support/${kind}`;
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith(base) ||
    value.includes("\\")
  )
    return base;
  try {
    const u = new URL(value, "https://internal.invalid");
    if (
      u.origin !== "https://internal.invalid" ||
      u.pathname !== base ||
      u.hash
    )
      return base;
    const search: Search = {};
    for (const [key] of u.searchParams) {
      const values = u.searchParams.getAll(key);
      search[key] = values.length === 1 ? values[0] : values;
    }
    const f = parseSupportFilters(kind, search);
    return f ? supportUrl(kind, f) : base;
  } catch {
    return base;
  }
}
export function supportSavedUrl(kind: Kind, returnTo: unknown) {
  const url = new URL(
    supportReturn(kind, returnTo),
    "https://internal.invalid",
  );
  if (kind === "inquiries") {
    url.searchParams.set("status", "answered");
    url.searchParams.delete("page");
  }
  url.searchParams.set("notice", "saved");
  return url.pathname + "?" + url.searchParams;
}
export function supportListQuery(search: Search) {
  const { notice, ...filters } = search;
  return {
    filters,
    saved: notice === "saved",
    valid: notice === undefined || notice === "saved",
  };
}
export function scalar(form: FormData, key: string) {
  const a = form.getAll(key);
  return a.length === 1 && typeof a[0] === "string" ? a[0] : null;
}
export type FaqInput = {
  category: string;
  question: string;
  answer: string;
  sort_order: string;
  is_active: boolean;
};
export function faqErrors(v: FaqInput) {
  const e: Record<string, string> = {};
  if (!Object.hasOwn(faqCategories, v.category))
    e.category = "분류를 선택해 주세요.";
  for (const [key, max, label] of [
    ["question", 300, "질문"],
    ["answer", 5000, "답변"],
  ] as const)
    if (!v[key].trim() || v[key].length > max || v[key].includes("\0"))
      e[key] = `${label}을 1~${max}자로 입력해 주세요.`;
  if (!/^\d{1,10}$/.test(v.sort_order) || Number(v.sort_order) > 2147483647)
    e.sort_order = "표시 순서를 0~2147483647 사이 정수로 입력해 주세요.";
  return e;
}
export function parseFaq(form: FormData) {
  const v: FaqInput = {
    category: "",
    question: "",
    answer: "",
    sort_order: "",
    is_active: false,
  };
  const malformed: Record<string, string> = {};
  for (const key of ["category", "question", "answer", "sort_order"] as const) {
    const value = scalar(form, key);
    if (value === null) malformed[key] = "입력값을 확인해 주세요.";
    else v[key] = value;
  }
  const active = scalar(form, "is_active");
  if (active !== "true" && active !== "false")
    malformed.is_active = "공개 여부를 선택해 주세요.";
  v.is_active = active === "true";
  return {
    errors: { ...faqErrors(v), ...malformed },
    patch: {
      category: v.category,
      question: v.question.trim(),
      answer: v.answer.trim(),
      sort_order: Number(v.sort_order),
      is_active: v.is_active,
    },
  };
}
export function answerError(value: string) {
  return !value.trim() || value.length > 5000 || value.includes("\0")
    ? "답변을 1~5000자로 입력해 주세요."
    : "";
}
