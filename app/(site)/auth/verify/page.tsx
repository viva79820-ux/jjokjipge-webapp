import Link from "next/link";
import { AuthCard } from "@/components/member-auth/auth-card";
import { linkClass } from "@/components/member-auth/styles";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `이메일 인증 안내 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <AuthCard title="이메일 인증 안내" focus>
      <div className="space-y-3 text-body leading-relaxed break-words md:text-base">
        <p>
          가입 요청을 확인했어요. 새 계정이면 메일함에서 인증 링크를 눌러
          주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.
        </p>
        <p>
          인증 링크를 누르기 전에는 가입이 끝난 것이 아니에요. 이미 가입한
          주소라면 로그인하거나 비밀번호 재설정을 이용해 주세요.
        </p>
        <p className="text-caption text-muted md:text-sm">
          이 안내는 회원 가입 확인이에요. 전화상담 예약 조회와는 따로입니다.
        </p>
      </div>
      <div className="mt-4 flex flex-col">
        <Link href="/login" className={linkClass}>
          로그인으로 돌아가기
        </Link>
        <Link href="/forgot-password" className={linkClass}>
          비밀번호 재설정
        </Link>
        <Link href="/booking/lookup" className={linkClass}>
          비회원 예약 조회
        </Link>
      </div>
    </AuthCard>
  );
}
