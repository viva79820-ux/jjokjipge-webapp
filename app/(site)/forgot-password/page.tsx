import { AuthCard } from "@/components/member-auth/auth-card";
import { ForgotPasswordForm } from "@/components/member-auth/forgot-password-form";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `비밀번호 재설정 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard title="비밀번호 재설정">
      <p className="mb-4 text-caption leading-relaxed text-muted md:text-sm">
        가입한 이메일을 입력하면 재설정 링크를 요청해요. 계정이 있는지는
        알려드리지 않아요.
      </p>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
