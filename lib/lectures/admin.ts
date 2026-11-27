"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  lectureColumns,
  normalizeEmail,
  scalar,
  uuid,
  type LectureRecord,
} from "./rules";

export type MemberLookup =
  | {
      state: "found";
      userId: string;
      email: string;
      name: string | null;
      isTeacher: boolean;
      confirmed: boolean;
    }
  | { state: "missing" | "invalid" | "unavailable" };

export type TeacherRow = {
  userId: string;
  email: string;
  name: string | null;
  grantedAt: string;
};

type AuthUser = {
  id?: string;
  email?: string;
  email_confirmed_at?: string | null;
};

function teacherPath(result: string, email = "") {
  const params = new URLSearchParams({ result });
  if (email) params.set("email", email);
  return `/admin/teachers?${params.toString()}`;
}

function invalidateTeachers() {
  revalidatePath("/admin/teachers");
  revalidatePath("/mypage");
  revalidatePath("/mypage/lectures");
}

export async function lookupMember(emailValue: unknown): Promise<MemberLookup> {
  const admin = await requireAdmin();
  if (!admin) return { state: "unavailable" };
  const email = normalizeEmail(emailValue);
  if (!email) return { state: "invalid" };
  const user = await findAuthUser(email);
  if (user === "unavailable") return { state: "unavailable" };
  if (!user?.id || !uuid(user.id)) return { state: "missing" };
  const db = await createClient();
  const profile = await db
    .from("profiles")
    .select("id,name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile.error) return { state: "unavailable" };
  if (!profile.data) return { state: "missing" };
  const teacher = await db
    .from("teachers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (teacher.error) return { state: "unavailable" };
  const name =
    typeof profile.data.name === "string" && profile.data.name.trim()
      ? profile.data.name.trim()
      : null;
  return {
    state: "found",
    userId: user.id,
    email,
    name,
    isTeacher: !!teacher.data,
    confirmed: Boolean(user.email_confirmed_at),
  };
}

export async function listTeachers(): Promise<TeacherRow[] | null> {
  const admin = await requireAdmin();
  if (!admin) return null;
  const db = await createClient();
  const teachers = await db
    .from("teachers")
    .select("user_id,granted_at")
    .order("granted_at", { ascending: false });
  if (teachers.error || !teachers.data) return null;
  const ids = teachers.data.map((row) => row.user_id);
  const profiles = ids.length
    ? await db.from("profiles").select("id,name").in("id", ids)
    : { data: [], error: null };
  if (profiles.error || !profiles.data) return null;
  const names = new Map(
    profiles.data.map((row) => [
      row.id,
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
    ]),
  );
  const emails = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const user = await readAuthUser(id);
      if (user?.email) emails.set(id, user.email);
    }),
  );
  return teachers.data.map((row) => ({
    userId: row.user_id,
    email: emails.get(row.user_id) || "이메일을 확인하지 못했어요.",
    name: names.get(row.user_id) ?? null,
    grantedAt: row.granted_at,
  }));
}

export async function grantTeacher(form: FormData) {
  const admin = await requireAdmin();
  const userId = form.get("user_id");
  const email = normalizeEmail(form.get("email")) || "";
  if (!admin || typeof userId !== "string" || !uuid(userId))
    redirect(teacherPath("denied", email));
  const db = await createClient();
  const existing = await db
    .from("teachers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) redirect(teacherPath("unavailable", email));
  if (existing.data) redirect(teacherPath("already", email));
  const inserted = await db.from("teachers").insert({ user_id: userId });
  if (inserted.error?.code === "23505") redirect(teacherPath("already", email));
  if (inserted.error) redirect(teacherPath("unavailable", email));
  invalidateTeachers();
  redirect(teacherPath("granted", email));
}

export async function revokeTeacher(form: FormData) {
  const admin = await requireAdmin();
  const userId = form.get("user_id");
  const email = normalizeEmail(form.get("email")) || "";
  if (!admin || typeof userId !== "string" || !uuid(userId))
    redirect(teacherPath("denied", email));
  const db = await createClient();
  const removed = await db
    .from("teachers")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (removed.error) redirect(teacherPath("unavailable", email));
  if (!removed.data?.length) redirect(teacherPath("missing", email));
  invalidateTeachers();
  redirect(teacherPath("revoked", email));
}

export async function listLecturesForAdmin(): Promise<Array<
  LectureRecord & { teacherName: string | null }
> | null> {
  const admin = await requireAdmin();
  if (!admin) return null;
  const db = await createClient();
  const lectures = await db
    .from("lectures")
    .select(lectureColumns)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .returns<LectureRecord[]>();
  if (lectures.error || !lectures.data) return null;
  const ids = [...new Set(lectures.data.map((row) => row.teacher_id))];
  const profiles = ids.length
    ? await db.from("profiles").select("id,name").in("id", ids)
    : { data: [], error: null };
  if (profiles.error || !profiles.data) return null;
  const names = new Map(
    profiles.data.map((row) => [
      row.id,
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
    ]),
  );
  return lectures.data.map((row) => ({
    ...row,
    teacherName: names.get(row.teacher_id) ?? null,
  }));
}

export async function unpublishLecture(form: FormData) {
  const admin = await requireAdmin();
  const id = form.get("id");
  if (!admin || typeof id !== "string" || !uuid(id))
    redirect("/admin/lectures?result=denied");
  const db = await createClient();
  const updated = await db
    .from("lectures")
    .update({ is_published: false })
    .eq("id", id)
    .select("id,is_published")
    .maybeSingle();
  if (updated.error) redirect("/admin/lectures?result=unavailable");
  if (!updated.data) redirect("/admin/lectures?result=missing");
  revalidatePath("/admin/lectures");
  revalidatePath("/mypage/lectures");
  revalidatePath(`/mypage/lectures/${id}`);
  redirect("/admin/lectures?result=unpublished");
}

export async function hideLectureLesson(form: FormData) {
  const admin = await requireAdmin();
  const lessonId = scalar(form, "id");
  const lectureId = scalar(form, "lecture_id");
  if (!admin || !uuid(lessonId) || !uuid(lectureId)) {
    redirect("/admin/lectures?result=denied");
  }
  const db = await createClient();
  const updated = await db
    .from("lecture_lessons")
    .update({ admin_hidden: true })
    .eq("id", lessonId)
    .eq("lecture_id", lectureId)
    .eq("admin_hidden", false)
    .select("id,admin_hidden")
    .maybeSingle();
  if (updated.error) {
    redirect(`/admin/lectures/${lectureId}?result=unavailable`);
  }
  if (!updated.data || updated.data.admin_hidden !== true) {
    redirect(`/admin/lectures/${lectureId}?result=missing`);
  }
  revalidatePath("/admin/lectures");
  revalidatePath(`/admin/lectures/${lectureId}`);
  revalidatePath("/mypage/lectures");
  revalidatePath(`/mypage/lectures/${lectureId}`);
  revalidatePath("/class");
  revalidatePath(`/class/lectures/${lectureId}`);
  redirect(`/admin/lectures/${lectureId}?result=hidden`);
}

async function findAuthUser(
  email: string,
): Promise<AuthUser | null | "unavailable"> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return "unavailable";
  const url = new URL("/auth/v1/admin/users", base);
  url.searchParams.set("filter", email);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "20");
  try {
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return "unavailable";
    const body = (await response.json()) as { users?: AuthUser[] } | AuthUser[];
    const users = Array.isArray(body) ? body : body.users;
    if (!Array.isArray(users)) return "unavailable";
    const matches = users.filter(
      (user) =>
        typeof user.email === "string" &&
        user.email.toLowerCase() === email &&
        typeof user.id === "string",
    );
    if (matches.length !== 1) return null;
    return matches[0];
  } catch {
    return "unavailable";
  }
}

async function readAuthUser(id: string) {
  try {
    const result = await createAdminClient().auth.admin.getUserById(id);
    return result.data.user;
  } catch {
    return null;
  }
}
