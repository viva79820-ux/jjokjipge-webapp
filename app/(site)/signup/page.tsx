import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  AuthScreenHeader,
  AuthScreenMain,
} from "@/components/member-auth/auth-screen";
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
    <>
      <AuthScreenHeader title="회원가입" backHref="/login" />
      <Suspense
        fallback={
          <p role="status" className="px-5 pt-6 text-body text-muted">
            로그인 상태를 확인하고 있어요.
          </p>
        }
      >
        <SignupContent />
      </Suspense>
    </>
  );
}

async function SignupContent() {
  await connection();
  if (await getMember()) redirect("/mypage");
  return (
    <AuthScreenMain className="gap-5 pt-6">
      <div>
        <h1 className="m-0 text-display font-extrabold">쪽집게천사 회원가입</h1>
        <p className="mt-1.5 text-label text-muted">
          가입하면 메일로 인증 링크를 보내 드려요.
          <br />
          인증을 마친 뒤에 로그인할 수 있어요.
        </p>
      </div>
      <SignupForm />
    </AuthScreenMain>
  );
}
