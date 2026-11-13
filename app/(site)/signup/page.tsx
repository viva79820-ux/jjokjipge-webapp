import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/member-auth/auth-card";
import { SignupForm } from "@/components/member-auth/signup-form";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `회원가입 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard title="회원가입">
      <p className="mb-4 text-caption leading-relaxed text-muted md:text-sm">
        이메일 인증을 마친 뒤에 로그인할 수 있어요.
      </p>
      <Suspense fallback={<p role="status">로그인 상태를 확인하고 있어요.</p>}>
        <SignupContent />
      </Suspense>
    </AuthCard>
  );
}

async function SignupContent() {
  await connection();
  if (await getMember()) redirect("/mypage");
  return <SignupForm />;
}
