import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LectureEditor } from "@/components/lectures/editor";
import { LessonManager } from "@/components/lectures/lesson-manager";
import { lessonsForLecture } from "@/components/lectures/lesson-view";
import { Button } from "@/components/ui/button";
import { listLessonRecords } from "../lesson-records";
import {
  hasLectureConsent,
  isTeacher,
  readMyLecture,
} from "@/lib/lectures/data";
import { publicThumbnailUrl, uuid } from "@/lib/lectures/rules";
import { lectureVideoStorageJudgment } from "@/lib/lectures/video";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `강의 수정 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export const instant = false;

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">강의를 확인하고 있어요.</p>}>
        <EditLecture params={params} />
      </Suspense>
    </div>
  );
}

async function EditLecture({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  const { id } = await params;
  if (!(await isTeacher(member.id)) || !uuid(id)) {
    return <Denied />;
  }
  const loaded = await readMyLecture(member.id, id);
  if (loaded.error) {
    return (
      <section className="mx-auto w-full min-w-0 max-w-md">
        <h1 className="text-display font-extrabold">강의 수정</h1>
        <p role="alert" className="mt-3 text-body text-error">
          강의를 불러오지 못했어요.
        </p>
      </section>
    );
  }
  if (!loaded.row) return <Denied />;
  const consented = await hasLectureConsent(member.id);
  return (
    <section className="mx-auto w-full min-w-0 max-w-md">
      <h1 className="text-display font-extrabold wrap-anywhere">
        {loaded.row.title}
      </h1>
      <LectureEditor
        mode="update"
        initial={loaded.row}
        userId={member.id}
        needsConsent={!consented}
        thumbnailUrl={publicThumbnailUrl(loaded.row.thumbnail_path, member.id)}
      />
      <LessonSection
        lectureId={loaded.row.id}
        userId={member.id}
        canUpload={consented}
        videoStorageReady={lectureVideoStorageJudgment() === null}
      />
    </section>
  );
}

async function LessonSection({
  lectureId,
  userId,
  canUpload,
  videoStorageReady,
}: {
  lectureId: string;
  userId: string;
  canUpload: boolean;
  videoStorageReady: boolean;
}) {
  const lessonLoad = await listLessonRecords(userId);
  if (lessonLoad.error || !lessonLoad.rows) {
    return (
      <p role="alert" className="mt-7 text-body text-error">
        차시 목록을 불러오지 못했어요.
      </p>
    );
  }
  return (
    <LessonManager
      lectureId={lectureId}
      canUpload={canUpload}
      videoStorageReady={videoStorageReady}
      lessons={lessonsForLecture(lessonLoad.rows, lectureId)}
    />
  );
}

function Denied() {
  return (
    <section className="mx-auto w-full min-w-0 max-w-md">
      <h1 className="text-display font-extrabold">강의 수정</h1>
      <p className="mt-3 text-body text-muted">강의를 찾지 못했어요.</p>
      <div className="mt-5">
        <Button href="/mypage/lectures" variant="secondary">
          강의 관리
        </Button>
      </div>
    </section>
  );
}
