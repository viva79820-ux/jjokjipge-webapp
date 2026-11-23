import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { AuthCard } from "@/components/member-auth/auth-card";
import { ConfirmForm } from "@/components/member-auth/confirm-form";
import { linkClass, statusClass } from "@/components/member-auth/styles";
import { readConfirmLink } from "@/lib/member-auth/confirm";
import { messages } from "@/lib/member-auth/errors";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `이메일 확인 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function listed(value: string | string[] | undefined) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value;
  return [];
}

function ConfirmLinks() {
  return (
    <div className="mt-4 flex flex-col">
      <Link href="/login" className={linkClass}>
        로그인
      </Link>
      <Link href="/signup" className={linkClass}>
        회원가입
      </Link>
      <Link href="/forgot-password" className={linkClass}>
        비밀번호 재설정
      </Link>
    </div>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
    next?: string | string[];
  }>;
}) {
  return (
    <Suspense fallback={<p role="status">인증 링크를 확인하고 있어요.</p>}>
      <ConfirmContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ConfirmContent({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
    next?: string | string[];
  }>;
}) {
  await connection();
  const params = await searchParams;
  const decision = readConfirmLink({
    tokenHashes: listed(params.token_hash),
    types: listed(params.type),
    nextValues: listed(params.next),
  });
  if (!decision.ok) {
    return (
      <AuthCard title="인증을 마치지 못했어요" focus>
        <p role="alert" className={statusClass}>
          {decision.reason === "redirect"
            ? messages.linkRedirect
            : messages.linkInvalid}
        </p>
        <ConfirmLinks />
      </AuthCard>
    );
  }
  const recovery = decision.otpType === "recovery";
  return (
    <AuthCard title={recovery ? "비밀번호 재설정" : "가입 확인"} focus>
      <p className={statusClass}>
        {recovery
          ? "메일 링크를 연 것만으로는 재설정이 시작되지 않아요. 아래 확인 버튼을 눌러 비밀번호 변경으로 이동해 주세요."
          : "메일 링크를 연 것만으로는 가입이 확인되지 않아요. 아래 확인 버튼을 눌러 인증을 마쳐 주세요."}
      </p>
      <ConfirmForm
        tokenHash={decision.tokenHash}
        otpType={decision.otpType}
        nextPath={decision.path}
      />
    </AuthCard>
  );
}
