import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { HideLessonButton } from "@/components/admin/hide-lesson-button";
import {
  durationLabel,
  lessonStatusLabel,
} from "@/components/lectures/lesson-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { unpublishLecture } from "@/lib/lectures/admin";
import { readLectureDetailForAdmin } from "@/lib/lectures/admin-read";
import { fieldLabel, uuid } from "@/lib/lectures/rules";
import { formatByteSize } from "@/lib/lectures/storage-view";

export const instant = false;

const results: Record<string, string> = {
  hidden: "차시를 숨겼어요. 다시 공개할 수 없어요.",
  missing: "차시를 숨기지 못했어요.",
  unavailable: "차시를 숨기지 못했어요. 다시 시도해 주세요.",
};

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">강의를 확인하고 있어요.</p>}>
      <LectureDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LectureDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  await connection();
  const result = (await searchParams).result ?? "";
  const notice = results[result];
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const { id } = await params;
  if (!uuid(id)) notFound();
  const detail = await readLectureDetailForAdmin(id);
  if (detail.state === "missing") notFound();
  if (detail.state === "unavailable") {
    return (
      <p role="alert" className="text-body text-error">
        강의를 불러오지 못했어요.
      </p>
    );
  }
  const { lecture, lessons } = detail;
  return (
    <div className="min-w-0">
      <Button href="/admin/lectures" variant="secondary">
        강의 목록
      </Button>
      <h1 className="mt-4 text-title font-bold wrap-anywhere">
        {lecture.title}
      </h1>
      <p className="mt-2 text-caption wrap-anywhere text-muted">
        {lecture.teacherName || "이름 없는 선생님"} ·{" "}
        {fieldLabel(lecture.field)}
      </p>
      <div className="mt-2">
        <Badge>{lecture.is_published ? "공개" : "비공개"}</Badge>
      </div>
      <p className="mt-3 text-body wrap-anywhere whitespace-pre-wrap">
        {lecture.description}
      </p>
      {notice ? (
        <p
          role={result === "hidden" ? "status" : "alert"}
          className={
            result === "hidden" ? "mt-3 text-body" : "mt-3 text-body text-error"
          }
        >
          {notice}
        </p>
      ) : null}
      {lecture.is_published ? (
        <form action={unpublishLecture} className="mt-3">
          <input type="hidden" name="id" value={lecture.id} />
          <Button type="submit" variant="secondary">
            비공개로 바꾸기
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-caption text-muted">이미 비공개예요.</p>
      )}
      <h2 className="mt-7 text-title font-bold">차시</h2>
      {lessons === null ? (
        <p role="alert" className="mt-3 text-body text-error">
          차시 목록을 불러오지 못했어요.
        </p>
      ) : lessons.length === 0 ? (
        <p className="mt-3 text-body text-muted">등록된 차시가 없어요.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {lessons.map((lesson, index) => (
            <li
              key={lesson.id}
              className="min-w-0 rounded-card border border-border bg-surface p-3"
            >
              <p className="text-subtitle font-bold wrap-anywhere">
                {lesson.title}
              </p>
              <p className="mt-2 text-caption text-muted">순서 {index + 1}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge>{lessonStatusLabel(lesson.status, null)}</Badge>
                {lesson.adminHidden ? <Badge>관리자 숨김</Badge> : null}
              </div>
              {lesson.adminHidden ? null : (
                <div className="mt-3">
                  <HideLessonButton
                    lectureId={lecture.id}
                    lessonId={lesson.id}
                  />
                </div>
              )}
              <p className="mt-2 text-caption text-muted">
                길이 {durationLabel(lesson.durationSeconds)}
              </p>
              <p className="mt-1 text-caption wrap-anywhere text-muted">
                용량 {formatByteSize(lesson.storageBytes)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
