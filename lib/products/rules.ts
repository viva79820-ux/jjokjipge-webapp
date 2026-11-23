export type ProductRecord = {
  id: string;
  name: string;
  description: string;
  price: number;
  image_path: string | null;
  image_alt: string | null;
  is_published: boolean;
  is_sold_out: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProductPatch = Pick<
  ProductRecord,
  | "name"
  | "description"
  | "price"
  | "image_path"
  | "image_alt"
  | "is_published"
  | "is_sold_out"
  | "sort_order"
>;

export type PublicProductSummary = {
  id: string;
  name: string;
  price: number;
  image_path: string | null;
  image_alt: string | null;
  is_sold_out: boolean;
  sort_order: number;
  created_at: string;
};

export type PublicProductDetail = PublicProductSummary & {
  description: string;
};

export const columns =
  "id,name,description,price,image_path,image_alt,is_published,is_sold_out,sort_order,created_at,updated_at";
export const publicListColumns =
  "id,name,price,image_path,image_alt,is_published,is_sold_out,sort_order,created_at";
export const publicDetailColumns =
  "id,name,description,price,image_path,image_alt,is_published,is_sold_out,sort_order,created_at";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const pageSize = 20;
const priceMax = 2147483647;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imagePattern =
  /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;
const singleLineControl = /[\u0000-\u001F\u007F\u0080-\u009F\u2028\u2029]/;
const multilineControl =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F\u2028\u2029]/;

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export const imagePath = (value: unknown): value is string =>
  typeof value === "string" && imagePattern.test(value);

export function charLength(value: string) {
  return Array.from(value).length;
}

export type ProductQuery = Record<string, string | string[] | undefined>;

export type ProductFilters = {
  page: number;
  status: string;
  result: string;
};

export function productFilters(
  query: ProductQuery,
  admin = false,
): ProductFilters | null {
  const allowed = admin ? ["page", "status", "result"] : ["page"];
  if (
    Object.keys(query).some(
      (key) => !allowed.includes(key) || typeof query[key] !== "string",
    )
  )
    return null;
  const page = query.page || "1";
  const status = admin ? query.status || "" : "";
  const result = admin ? query.result || "" : "";
  if (
    typeof page !== "string" ||
    !/^[1-9]\d{0,6}$/.test(page) ||
    !["", "public", "private"].includes(String(status)) ||
    !["", "saved", "deleted"].includes(String(result))
  )
    return null;
  return {
    page: Number(page),
    status: String(status),
    result: String(result),
  };
}

export function productListUrl(
  admin: boolean,
  page = 1,
  status = "",
  result = "",
) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (admin && status) params.set("status", status);
  if (admin && result) params.set("result", result);
  const base = admin ? "/admin/shop-products" : "/shop";
  return `${base}${params.size ? `?${params}` : ""}`;
}

export function productEditUrl(id: string, page = 1, status = "", result = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  if (result) params.set("result", result);
  return `/admin/shop-products/${id}${params.size ? `?${params}` : ""}`;
}

export function productNewUrl(page = 1, status = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);
  return `/admin/shop-products/new${params.size ? `?${params}` : ""}`;
}

export function scalar(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string"
    ? values[0]
    : null;
}

export function formatWon(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

// DB numeric은 문자로 올 수 있다. 소수·지수 표기는 자르거나 반올림하지 않는다.
export function storedWon(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1 || value > priceMax)
      return null;
    return value;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const matched = /^([1-9]\d{0,9})(?:\.0+)?$/.exec(text);
  if (!matched) return null;
  const parsed = Number(matched[1]);
  if (
    !Number.isSafeInteger(parsed) ||
    String(parsed) !== matched[1] ||
    parsed > priceMax
  )
    return null;
  return parsed;
}

function strictPrice(value: string) {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed) || trimmed.length > 10) return null;
  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed > priceMax ||
    String(parsed) !== trimmed
  )
    return null;
  return parsed;
}

function strictSort(value: string) {
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed) || trimmed.length > 10) return null;
  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed > priceMax ||
    String(parsed) !== trimmed
  )
    return null;
  return parsed;
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

export function publicImageUrl(path: string | null) {
  if (!imagePath(path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function publicBase(row: {
  id?: unknown;
  name?: unknown;
  price?: unknown;
  image_path?: unknown;
  image_alt?: unknown;
  is_published?: unknown;
  is_sold_out?: unknown;
  sort_order?: unknown;
  created_at?: unknown;
}): PublicProductSummary | null {
  const price = storedWon(row.price);
  const path = row.image_path === null ? null : row.image_path;
  const alt = row.image_alt === null ? null : row.image_alt;
  if (
    !uuid(row.id) ||
    typeof row.name !== "string" ||
    price === null ||
    (path !== null && !imagePath(path)) ||
    (alt !== null && typeof alt !== "string") ||
    row.is_published !== true ||
    typeof row.is_sold_out !== "boolean" ||
    typeof row.sort_order !== "number" ||
    !Number.isInteger(row.sort_order) ||
    row.sort_order < 0 ||
    row.sort_order > priceMax ||
    typeof row.created_at !== "string" ||
    (path !== null && (typeof alt !== "string" || !alt.trim()))
  )
    return null;
  return {
    id: row.id,
    name: row.name,
    price,
    image_path: path,
    image_alt: alt,
    is_sold_out: row.is_sold_out,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

export function publicSummary(row: Parameters<typeof publicBase>[0]) {
  return publicBase(row);
}

export function publicDetail(
  row: Parameters<typeof publicBase>[0] & { description?: unknown },
): PublicProductDetail | null {
  const summary = publicBase(row);
  if (!summary || typeof row.description !== "string") return null;
  return { ...summary, description: row.description };
}

export function productRecord(row: {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  price?: unknown;
  image_path?: unknown;
  image_alt?: unknown;
  is_published?: unknown;
  is_sold_out?: unknown;
  sort_order?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): ProductRecord | null {
  const price = storedWon(row.price);
  const path = row.image_path === null ? null : row.image_path;
  const alt = row.image_alt === null ? null : row.image_alt;
  if (
    !uuid(row.id) ||
    typeof row.name !== "string" ||
    typeof row.description !== "string" ||
    price === null ||
    (path !== null && !imagePath(path)) ||
    (alt !== null && typeof alt !== "string") ||
    typeof row.is_published !== "boolean" ||
    typeof row.is_sold_out !== "boolean" ||
    typeof row.sort_order !== "number" ||
    !Number.isInteger(row.sort_order) ||
    row.sort_order < 0 ||
    row.sort_order > priceMax ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string" ||
    (path !== null && (typeof alt !== "string" || !alt.trim()))
  )
    return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price,
    image_path: path,
    image_alt: alt,
    is_published: row.is_published,
    is_sold_out: row.is_sold_out,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function parseProduct(form: FormData) {
  const errors: Record<string, string> = {};
  const name = scalar(form, "name");
  const description = scalar(form, "description");
  const priceText = scalar(form, "price");
  const pathText = scalar(form, "image_path");
  const altText = scalar(form, "image_alt");
  const published = scalar(form, "is_published");
  const soldOut = scalar(form, "is_sold_out");
  const orderText = scalar(form, "sort_order");
  let nameValue = "";
  if (name === null) errors.name = "상품명을 한 칸의 글자로 입력해 주세요.";
  else if (singleLineControl.test(name))
    errors.name = "상품명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    nameValue = name.trim();
    if (
      charLength(nameValue) < 1 ||
      charLength(nameValue) > 100 ||
      !/[^\s]/u.test(nameValue)
    )
      errors.name = "상품명은 공백을 제외하고 1~100자로 입력해 주세요.";
  }
  let descriptionValue = "";
  if (description === null)
    errors.description = "상품 설명을 한 칸의 글자로 입력해 주세요.";
  else if (multilineControl.test(description))
    errors.description = "설명에는 허용되지 않은 제어문자를 넣을 수 없습니다.";
  else {
    descriptionValue = description.trim();
    if (
      charLength(descriptionValue) < 1 ||
      charLength(descriptionValue) > 5000 ||
      !/[^\s]/u.test(descriptionValue)
    )
      errors.description = "설명은 공백을 제외하고 1~5000자로 입력해 주세요.";
  }
  const price = priceText === null ? null : strictPrice(priceText);
  if (price === null)
    errors.price =
      "가격은 1원 이상 2147483647원 이하의 정수로 입력해 주세요. 소수와 지수 표기는 저장하지 않습니다.";
  let imagePathValue: string | null = null;
  if (pathText === null)
    errors.image_path = "사진 경로를 한 칸의 글자로 보내 주세요.";
  else if (pathText !== "" && !imagePath(pathText))
    errors.image_path = "사진 경로를 확인해 주세요.";
  else imagePathValue = pathText || null;
  let imageAlt: string | null = null;
  if (altText === null)
    errors.image_alt = "사진 대체 설명을 한 칸의 글자로 입력해 주세요.";
  else if (singleLineControl.test(altText))
    errors.image_alt = "대체 설명에는 줄바꿈이나 제어문자를 넣을 수 없습니다.";
  else {
    const trimmed = altText.trim();
    if (imagePathValue && (!trimmed || !/[^\s]/u.test(trimmed)))
      errors.image_alt = "사진이 있으면 대체 설명을 입력해 주세요.";
    else if (trimmed && (charLength(trimmed) > 200 || !/[^\s]/u.test(trimmed)))
      errors.image_alt =
        "대체 설명은 공백을 제외하고 200자 이하로 입력해 주세요.";
    else imageAlt = trimmed || null;
  }
  if (published !== "true" && published !== "false")
    errors.is_published = "공개 여부는 예 또는 아니오로만 보낼 수 있습니다.";
  if (soldOut !== "true" && soldOut !== "false")
    errors.is_sold_out = "품절 여부는 예 또는 아니오로만 보낼 수 있습니다.";
  const sortOrder = orderText === null ? null : strictSort(orderText);
  if (sortOrder === null)
    errors.sort_order =
      "정렬 순서는 0 이상 2147483647 이하의 정수로 입력해 주세요.";
  const patch: ProductPatch = {
    name: nameValue,
    description: descriptionValue,
    price: price ?? 1,
    image_path: imagePathValue,
    image_alt: imageAlt,
    is_published: published === "true",
    is_sold_out: soldOut === "true",
    sort_order: sortOrder ?? 0,
  };
  return { errors, patch };
}

export function sameProduct(row: ProductRecord, patch: ProductPatch) {
  return (
    row.name === patch.name &&
    row.description === patch.description &&
    row.price === patch.price &&
    row.image_path === patch.image_path &&
    row.image_alt === patch.image_alt &&
    row.is_published === patch.is_published &&
    row.is_sold_out === patch.is_sold_out &&
    row.sort_order === patch.sort_order
  );
}

export function productMatches(
  row: Parameters<typeof productRecord>[0],
  form: FormData,
) {
  const normalized = productRecord(row);
  if (!normalized) return false;
  const parsed = parseProduct(form);
  return (
    !Object.keys(parsed.errors).length && sameProduct(normalized, parsed.patch)
  );
}
