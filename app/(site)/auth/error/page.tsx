import { Suspense } from "react";
import Link from "next/link";
import { AuthCard } from "@/components/member-auth/auth-card";
import { linkClass } from "@/components/member-auth/styles";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

const reasons = {
  invalid:
    "인증 링크를 확인하지 못했어요. 다시 가입하거나 비밀번호 재설정을 요청해 주세요.",
  expired: "인증 링크가 만료됐거나 이미 사용됐어요. 다시 요청해 주세요.",
  pkce: "인증을 이어서 확인하지 못했어요. 링크를 요청한 같은 브라우저에서 다시 시도해 주세요.",
  session: "로그인 상태를 확인하지 못했어요. 다시 로그인해 주세요.",
  config: "인증 주소를 확인하지 못했어요. 서비스 주소 설정이 필요해요.",
} as const;

export const metadata: Metadata = {
  title: `인증 안내 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  return (
    <AuthCard title="인증을 마치지 못했어요" focus>
      <Suspense fallback={<p role="status">인증 결과를 확인하고 있어요.</p>}>
        <ErrorContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const reason = (await searchParams).reason;
  const key =
    typeof reason === "string" && reason in reasons
      ? (reason as keyof typeof reasons)
      : "invalid";
  return (
    <>
      <p
        role="alert"
        className="text-body leading-relaxed break-words md:text-base"
      >
        {reasons[key]}
      </p>
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
    </>
  );
}
