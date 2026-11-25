export type LectureField = "saju" | "tarot";

export type LectureRecord = {
  id: string;
  teacher_id: string;
  title: string;
  description: string;
  thumbnail_path: string | null;
  field: LectureField;
  is_published: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export const consentStatement = "본인이 권리를 가진 영상만 올린다";
export const bucket = "public-images";
export const maxBytes = 5242880;
export const fieldLabels: Record<LectureField, string> = {
  saju: "사주",
  tarot: "타로",
};
export const lectureColumns =
  "id,teacher_id,title,description,thumbnail_path,field,is_published,view_count,created_at,updated_at";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const thumbnailPattern =
  /^lectures\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;

export const uuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

export function charLength(value: string) {
  return Array.from(value).length;
}

export function fieldLabel(field: string) {
  return field === "saju" || field === "tarot" ? fieldLabels[field] : "";
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

export function thumbnailPathFor(
  userId: string,
  value: unknown,
): value is string {
  return (
    typeof userId === "string" &&
    uuid(userId) &&
    typeof value === "string" &&
    thumbnailPattern.test(value) &&
    value.startsWith(`lectures/${userId.toLowerCase()}/`)
  );
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

export function publicThumbnailUrl(path: string | null, userId: string) {
  if (!thumbnailPathFor(userId, path)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return null;
  return email;
}

export type LectureDraft = {
  title: string;
  description: string;
  field: LectureField;
  thumbnail_path: string | null;
  is_published: boolean;
  consent: boolean;
};

export function parseLecture(form: FormData, userId: string) {
  const errors: Record<string, string> = {};
  const title = scalar(form, "title");
  const description = scalar(form, "description");
  const field = scalar(form, "field");
  const pathText = scalar(form, "thumbnail_path");
  const published = scalar(form, "is_published");
  const consentValues = form.getAll("consent");
  const consent =
    consentValues.length === 0
      ? ""
      : consentValues.length === 1 && typeof consentValues[0] === "string"
        ? consentValues[0]
        : null;
  if (
    title === null ||
    description === null ||
    field === null ||
    pathText === null ||
    published === null ||
    consent === null
  ) {
    return {
      errors: { form: "입력 항목을 한 번씩만 보내 주세요." },
      draft: null,
    };
  }
  if (!title.trim() || hasControl(title) || charLength(title) > 100)
    errors.title = "제목은 100자 이내의 글로 입력해 주세요.";
  if (
    !description.trim() ||
    descriptionControls(description) ||
    charLength(description) > 5000
  )
    errors.description = "소개는 5000자 이내로 입력해 주세요.";
  if (field !== "saju" && field !== "tarot")
    errors.field = "분야는 사주 또는 타로를 선택해 주세요.";
  if (published !== "true" && published !== "false")
    errors.is_published = "공개 여부를 선택해 주세요.";
  if (pathText !== "" && !thumbnailPathFor(userId, pathText))
    errors.thumbnail_path = "썸네일 경로를 확인해 주세요.";
  if (consent !== "" && consent !== "yes")
    errors.consent = "업로드 동의 값을 확인해 주세요.";
  if (field !== "saju" && field !== "tarot") return { errors, draft: null };
  if (Object.keys(errors).length) return { errors, draft: null };
  const draft: LectureDraft = {
    title,
    description,
    field,
    thumbnail_path: pathText || null,
    is_published: published === "true",
    consent: consent === "yes",
  };
  return { errors, draft };
}
