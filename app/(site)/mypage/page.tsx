import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutForm } from "@/components/member-auth/logout-form";
import { ReloadRestoredPage } from "@/components/member-auth/navigation-reset";
import { linkClass, noteClass } from "@/components/member-auth/styles";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `마이페이지 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">계정 정보를 확인하고 있어요.</p>}>
        <MemberPage searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  const notice = (await searchParams).notice;
  return (
    <section key={member.id} className="mx-auto w-full max-w-md min-w-0">
      <ReloadRestoredPage />
      <h1 className="text-display font-extrabold wrap-anywhere">마이페이지</h1>
      {notice === "password" && (
        <p role="status" className="mt-3 text-label font-semibold text-brand">
          비밀번호를 변경했어요.
        </p>
      )}
      <p className={`mt-3 ${noteClass}`}>
        예약, 주문, 문의, 후기 목록은 아직 이 화면에 연결되어 있지 않아요.
        비회원으로 남긴 예약은 여기서 회원 계정에 연결하지 않아요.
      </p>
      <dl className="mt-5 space-y-4 rounded-card border border-border bg-surface p-3 @3xl/app:p-4">
        <div>
          <dt className="text-caption text-muted">이름</dt>
          <dd className="mt-1 text-subtitle font-bold wrap-anywhere">
            {member.name ?? "등록된 이름이 없어요."}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted">이메일</dt>
          <dd className="mt-1 text-subtitle font-bold break-all">
            {member.email}
          </dd>
        </div>
      </dl>
      <div className="mt-5">
        <LogoutForm />
      </div>
      <div className="mt-4 flex flex-col">
        <Link href="/booking/lookup" className={linkClass}>
          비회원 예약 조회
        </Link>
        <Link href="/support/lookup" className={linkClass}>
          문의 조회
        </Link>
      </div>
    </section>
  );
}
