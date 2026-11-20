import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/member-auth/auth-card";
import { LoginForm } from "@/components/member-auth/login-form";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `로그인 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard title="로그인">
      <Suspense fallback={<p role="status">로그인 상태를 확인하고 있어요.</p>}>
        <LoginContent />
      </Suspense>
    </AuthCard>
  );
}

async function LoginContent() {
  await connection();
  if (await getMember()) redirect("/mypage");
  return <LoginForm />;
}
