import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { AuthCard } from "@/components/member-auth/auth-card";
import { UpdatePasswordForm } from "@/components/member-auth/update-password-form";
import { linkClass } from "@/components/member-auth/styles";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `비밀번호 변경 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard title="비밀번호 변경">
      <Suspense fallback={<p role="status">로그인 상태를 확인하고 있어요.</p>}>
        <UpdateContent />
      </Suspense>
    </AuthCard>
  );
}

async function UpdateContent() {
  await connection();
  if (!(await getMember())) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-body leading-relaxed md:text-base">
          링크가 만료됐거나 로그인 상태가 아니에요. 비밀번호 재설정을 다시
          요청해 주세요.
        </p>
        <div className="flex flex-col">
          <Link href="/forgot-password" className={linkClass}>
            비밀번호 재설정
          </Link>
          <Link href="/login" className={linkClass}>
            로그인
          </Link>
        </div>
      </div>
    );
  }
  return <UpdatePasswordForm />;
}
