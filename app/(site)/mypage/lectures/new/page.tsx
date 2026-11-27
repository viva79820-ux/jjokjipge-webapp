import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { LectureEditor } from "@/components/lectures/editor";
import { Button } from "@/components/ui/button";
import { hasLectureConsent, isTeacher } from "@/lib/lectures/data";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `강의 만들기 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export const instant = false;

export default function Page() {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense
        fallback={<p role="status">강의 작성 화면을 준비하고 있어요.</p>}
      >
        <NewLecture />
      </Suspense>
    </div>
  );
}

async function NewLecture() {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  if (!(await isTeacher(member.id))) {
    return (
      <section className="mx-auto w-full min-w-0 max-w-md">
        <h1 className="text-display font-extrabold">강의 만들기</h1>
        <p className="mt-3 text-body text-muted">선생님 권한이 필요해요.</p>
        <div className="mt-5">
          <Button href="/mypage" variant="secondary">
            마이페이지
          </Button>
        </div>
      </section>
    );
  }
  const consented = await hasLectureConsent(member.id);
  return (
    <section className="mx-auto w-full min-w-0 max-w-md">
      <h1 className="text-display font-extrabold">강의 만들기</h1>
      <LectureEditor
        mode="create"
        initial={null}
        userId={member.id}
        needsConsent={!consented}
        thumbnailUrl={null}
      />
    </section>
  );
}
