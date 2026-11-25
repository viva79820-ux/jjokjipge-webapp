import Link from "next/link";
import { Info, Mail } from "lucide-react";
import {
  AuthScreenHeader,
  AuthScreenMain,
} from "@/components/member-auth/auth-screen";
import { ForgotPasswordForm } from "@/components/member-auth/forgot-password-form";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `비밀번호 재설정 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default function Page() {
  return (
    <>
      <AuthScreenHeader title="비밀번호 재설정" backHref="/login" />
      <AuthScreenMain className="gap-4 pt-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Mail size={34} aria-hidden="true" />
          </span>
          <h1 className="m-0 text-display font-extrabold">
            비밀번호를 잊으셨나요?
          </h1>
          <p className="m-0 text-label text-muted">
            가입한 이메일을 입력하면 재설정 링크를 보내 드려요.
            <br />
            계정이 있는지는 알려 드리지 않아요.
          </p>
        </div>
        <ForgotPasswordForm />
        <div className="flex gap-2.5 rounded-card border border-border bg-surface p-3.5 text-caption text-muted">
          <Info size={18} aria-hidden="true" className="shrink-0 text-brand" />
          <p className="m-0">
            메일이 오지 않으면 스팸함을 확인해 주세요. 몇 분 뒤에 다시 요청할 수
            있어요.
          </p>
        </div>
        <Link
          href="/login"
          className={`inline-flex min-h-11 cursor-pointer items-center self-center text-label font-bold text-brand hover:text-brand-deep ${focus}`}
        >
          로그인으로 돌아가기
        </Link>
      </AuthScreenMain>
    </>
  );
}
