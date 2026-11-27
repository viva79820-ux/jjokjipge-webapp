import { Suspense } from "react";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { listLecturesForAdmin, unpublishLecture } from "@/lib/lectures/admin";
import { fieldLabel } from "@/lib/lectures/rules";

export const instant = false;

const results: Record<string, string> = {
  unpublished: "강의를 비공개로 바꿨어요.",
  missing: "강의를 찾지 못했어요.",
  unavailable: "비공개로 바꾸지 못했어요. 다시 시도해 주세요.",
  denied: "관리자 권한이 필요해요.",
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">강의 목록을 확인하고 있어요.</p>}>
      <LectureModeration searchParams={searchParams} />
    </Suspense>
  );
}

async function LectureModeration({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const result = (await searchParams).result || "";
  const lectures = await listLecturesForAdmin();
  return (
    <div className="min-w-0">
      <h1 className="text-title font-bold">강의 비공개</h1>
      <p className="mt-2 text-caption text-muted">
        어떤 강의든 바로 비공개로 바꿀 수 있어요. 제목이나 소개는 바꾸지 않아요.
      </p>
      {results[result] ? (
        <p role="status" className="mt-3 text-body">
          {results[result]}
        </p>
      ) : null}
      {lectures === null ? (
        <p role="alert" className="mt-5 text-body text-error">
          강의 목록을 불러오지 못했어요.
        </p>
      ) : lectures.length === 0 ? (
        <p className="mt-5 text-body text-muted">등록된 강의가 없어요.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {lectures.map((lecture) => (
            <li
              key={lecture.id}
              className="min-w-0 rounded-card border border-border bg-surface p-3"
            >
              <p className="text-subtitle font-bold wrap-anywhere">
                {lecture.title}
              </p>
              <p className="mt-1 text-caption wrap-anywhere text-muted">
                {lecture.teacherName || "이름 없는 선생님"} ·{" "}
                {fieldLabel(lecture.field)}
              </p>
              <div className="mt-2">
                <Badge>{lecture.is_published ? "공개" : "비공개"}</Badge>
              </div>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
