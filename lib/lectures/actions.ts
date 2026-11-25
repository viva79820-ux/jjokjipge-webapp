"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMember } from "@/lib/member-auth/session";
import { isTeacher } from "./data";
import {
  bucket,
  consentStatement,
  imageMetadataValid,
  lectureColumns,
  parseLecture,
  thumbnailPathFor,
  uuid,
  type LectureRecord,
} from "./rules";

export type LectureResult = {
  state: "saved" | "rejected" | "unknown" | "conflict";
  message: string;
  row?: LectureRecord;
  errors?: Record<string, string>;
};

const denied: LectureResult = {
  state: "rejected",
  message: "선생님 권한이 필요해요.",
};
const unknown: LectureResult = {
  state: "unknown",
  message: "결과를 확인하지 못했어요. 저장 결과를 다시 확인해 주세요.",
};

function invalidate(id?: string) {
  revalidatePath("/mypage");
  revalidatePath("/mypage/lectures");
  revalidatePath("/mypage/lectures/new");
  revalidatePath("/admin/lectures");
  if (id) revalidatePath(`/mypage/lectures/${id}`);
}

async function requireTeacher() {
  const member = await getMember();
  if (!member || !(await isTeacher(member.id))) return null;
  return member;
}

export async function prepareLectureUpload(ext: string) {
  const teacher = await requireTeacher();
  if (!teacher || !["jpg", "jpeg", "png", "webp"].includes(ext)) return null;
  const normalized = ext === "jpeg" ? "jpg" : ext;
  return `lectures/${teacher.id.toLowerCase()}/${randomUUID()}.${normalized}`;
}

export async function removeLectureUpload(path: string) {
  const teacher = await requireTeacher();
  if (!teacher || !thumbnailPathFor(teacher.id, path)) return false;
  const db = await createClient();
  const used = await db
    .from("lectures")
    .select("id")
    .eq("thumbnail_path", path)
    .maybeSingle();
  if (used.error || used.data) return false;
  const removed = await db.storage.from(bucket).remove([path]);
  return !removed.error;
}

async function ensureConsent(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  agreed: boolean,
) {
  const existing = await db
    .from("lecture_upload_consents")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) return unknown;
  if (existing.data) return null;
  if (!agreed) {
    return {
      state: "rejected",
      message: "강의를 만들려면 업로드 동의가 필요해요.",
      errors: { consent: "권리를 가진 영상만 올린다는 동의가 필요해요." },
    } satisfies LectureResult;
  }
  const inserted = await db.from("lecture_upload_consents").insert({
    user_id: userId,
    statement: consentStatement,
  });
  if (!inserted.error) return null;
  if (inserted.error.code === "23505") return null;
  if (inserted.error.code === "42501") return denied;
  return unknown;
}

async function thumbnailReady(
  db: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  const info = await db.storage.from(bucket).info(path);
  return !info.error && !!info.data && imageMetadataValid(info.data);
}

export async function saveLecture(form: FormData): Promise<LectureResult> {
  const teacher = await requireTeacher();
  if (!teacher) return denied;
  if (!(form instanceof FormData))
    return { state: "rejected", message: "입력값을 확인해 주세요." };
  const id = scalarId(form);
  const mode = form.get("mode");
  const version = form.get("version");
  if (
    !uuid(id) ||
    (mode !== "create" && mode !== "update") ||
    (mode === "update" &&
      (typeof version !== "string" || !versionValid(version)))
  )
    return { state: "rejected", message: "요청을 확인해 주세요." };
  const parsed = parseLecture(form, teacher.id);
  if (!parsed.draft)
    return {
      state: "rejected",
      message: "입력값을 확인해 주세요.",
      errors: parsed.errors,
    };
  try {
    const db = await createClient();
    const consent = await ensureConsent(db, teacher.id, parsed.draft.consent);
    if (consent) return consent;
    const current =
      mode === "update" ? await readOwned(db, teacher.id, id) : null;
    if (current?.error) return unknown;
    if (mode === "update" && current && !current.row)
      return { state: "rejected", message: "강의를 찾지 못했어요." };
    if (
      parsed.draft.thumbnail_path &&
      parsed.draft.thumbnail_path !== current?.row?.thumbnail_path &&
      !(await thumbnailReady(db, parsed.draft.thumbnail_path))
    ) {
      return {
        state: "rejected",
        message: "썸네일을 확인하지 못했어요. 다시 올려 주세요.",
        errors: { thumbnail_path: "썸네일 파일을 확인해 주세요." },
      };
    }
    const patch = {
      title: parsed.draft.title,
      description: parsed.draft.description,
      thumbnail_path: parsed.draft.thumbnail_path,
      field: parsed.draft.field,
      is_published: parsed.draft.is_published,
    };
    if (mode === "create") {
      const inserted = await db
        .from("lectures")
        .insert({ id, teacher_id: teacher.id, ...patch })
        .select(lectureColumns)
        .maybeSingle();
      if (inserted.error?.code === "42501") return denied;
      if (inserted.error?.code === "23505") {
        const existing = await readOwned(db, teacher.id, id);
        if (existing.error) return unknown;
        if (
          !existing.row ||
          existing.row.title !== patch.title ||
          existing.row.description !== patch.description ||
          existing.row.thumbnail_path !== patch.thumbnail_path ||
          existing.row.field !== patch.field ||
          existing.row.is_published !== patch.is_published
        ) {
          return {
            state: "conflict",
            message: "이미 다른 내용으로 저장된 강의예요.",
            row: existing.row || undefined,
          };
        }
        return saved(existing.row);
      }
      if (inserted.error || !inserted.data) return unknown;
      return saved(inserted.data as LectureRecord);
    }
    const updated = await db
      .from("lectures")
      .update(patch)
      .eq("id", id)
      .eq("teacher_id", teacher.id)
      .eq("updated_at", version)
      .select(lectureColumns)
      .maybeSingle();
    if (updated.error?.code === "42501") return denied;
    if (updated.error) return unknown;
    if (!updated.data) {
      const latest = await readOwned(db, teacher.id, id);
      if (latest.row)
        return {
          state: "conflict",
          message:
            "다른 작업으로 강의가 바뀌었어요. 최신 내용을 확인해 주세요.",
          row: latest.row,
        };
      return { state: "rejected", message: "강의를 찾지 못했어요." };
    }
    const savedRow = updated.data as LectureRecord;
    if (
      current?.row?.thumbnail_path &&
      current.row.thumbnail_path !== savedRow.thumbnail_path
    ) {
      await db.storage.from(bucket).remove([current.row.thumbnail_path]);
    }
    return saved(savedRow);
  } catch {
    return unknown;
  }
}

function scalarId(form: FormData) {
  const value = form.get("id");
  return typeof value === "string" ? value : "";
}

function versionValid(value: string) {
  return (
    value.length <= 50 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

async function readOwned(
  db: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  id: string,
) {
  const read = await db
    .from("lectures")
    .select(lectureColumns)
    .eq("id", id)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (read.error) return { row: null, error: true };
  return { row: (read.data as LectureRecord | null) ?? null, error: false };
}

function saved(row: LectureRecord): LectureResult {
  invalidate(row.id);
  return { state: "saved", message: "강의를 저장했어요.", row };
}
