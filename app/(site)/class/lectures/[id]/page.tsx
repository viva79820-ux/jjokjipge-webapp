import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LecturePlayer } from "@/components/lectures/player";
import {
  currentLessonProgress,
  publicLectureDetail,
} from "@/lib/lectures/public";
import { fieldLabel } from "@/lib/lectures/rules";
import { siteConfig } from "@/lib/site-config";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await publicLectureDetail((await params).id, {
    playback: false,
  });
  if (!row) notFound();
  return { title: `${row.title} | ${siteConfig.name}` };
}

async function LectureDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const row = await publicLectureDetail((await params).id);
  if (!row) notFound();
  const progress = await currentLessonProgress(
    row.lessons.map((lesson) => lesson.id),
  );
  return (
    <article className="space-y-7 wrap-anywhere">
      <div className="space-y-2">
        <Link
          href="/class"
          className="inline-flex min-h-11 cursor-pointer items-center text-label font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          클래스 목록
        </Link>
        <h1 className="text-display font-extrabold">{row.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-6 items-center rounded-full bg-brand px-2 text-fine font-bold text-on-brand">
            {fieldLabel(row.field)}
          </span>
          <span className="text-caption text-muted">{row.teacherName}</span>
          <span className="text-caption text-muted">조회 {row.viewCount}</span>
        </div>
      </div>
      <LecturePlayer
        lessons={row.lessons}
        signedIn={progress.signedIn}
        positions={progress.positions}
      />
      {row.description && (
        <p className="text-body whitespace-pre-wrap text-foreground">
          {row.description}
        </p>
      )}
    </article>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">강의를 불러오고 있습니다.</p>}>
      <LectureDetail {...props} />
    </Suspense>
  );
}
