import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LectureThumbnail } from "@/components/lectures/thumbnail";
import { isTeacher, listMyLectures } from "@/lib/lectures/data";
import { fieldLabel, publicThumbnailUrl } from "@/lib/lectures/rules";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `강의 관리 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export const instant = false;

export default function Page() {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">강의 목록을 확인하고 있어요.</p>}>
        <LectureList />
      </Suspense>
    </div>
  );
}

async function LectureList() {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  if (!(await isTeacher(member.id))) {
    return (
      <section className="mx-auto w-full min-w-0 max-w-md">
        <h1 className="text-display font-extrabold">강의 관리</h1>
        <p className="mt-3 text-body text-muted">선생님 권한이 필요해요.</p>
        <div className="mt-5">
          <Button href="/mypage" variant="secondary">
            마이페이지
          </Button>
        </div>
      </section>
    );
  }
  const loaded = await listMyLectures(member.id);
  return (
    <section className="mx-auto w-full min-w-0 max-w-md">
      <h1 className="text-display font-extrabold">강의 관리</h1>
      <p className="mt-3 text-caption text-muted">
        내가 만든 강의만 보여요. 차시는 아직 없고, 조회수는 아직 올라가지
        않아요.
      </p>
      <div className="mt-5">
        <Button href="/mypage/lectures/new" className="w-full">
          강의 만들기
        </Button>
      </div>
      {loaded.error ? (
        <p role="alert" className="mt-5 text-body text-error">
          강의 목록을 불러오지 못했어요.
        </p>
      ) : loaded.rows?.length ? (
        <ul className="mt-5 space-y-3">
          {loaded.rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/mypage/lectures/${row.id}`}
                className="flex min-w-0 cursor-pointer gap-3 rounded-card border border-border bg-surface p-3"
              >
                <LectureThumbnail
                  src={publicThumbnailUrl(row.thumbnail_path, member.id)}
                  alt=""
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-subtitle font-bold wrap-anywhere">
                    {row.title}
                  </span>
                  <span className="mt-1 block text-caption text-muted">
                    {fieldLabel(row.field)}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge>{row.is_published ? "공개" : "비공개"}</Badge>
                    <span className="text-caption text-muted">차시 0</span>
                    <span className="text-caption text-muted">
                      조회 {row.view_count}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-body text-muted">아직 만든 강의가 없어요.</p>
      )}
    </section>
  );
}
