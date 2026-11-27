import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { WithdrawForm } from "@/components/member-auth/withdraw-form";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `회원 탈퇴 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">계정 정보를 확인하고 있어요.</p>}>
        <WithdrawPage />
      </Suspense>
    </div>
  );
}

async function WithdrawPage() {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  return (
    <section className="mx-auto w-full max-w-md min-w-0">
      <h1 className="text-display font-extrabold wrap-anywhere">회원 탈퇴</h1>
      <div className="mt-4 space-y-3 text-body leading-relaxed wrap-anywhere">
        <p>
          이용약관 제5조에 따라 언제든지 탈퇴할 수 있습니다. 탈퇴하면 계정과
          프로필은 바로 삭제되고, 이 계정으로는 다시 로그인할 수 없습니다.
        </p>
        <p>
          개인정보 수집·이용 동의 3항에 따라 회원 정보는 탈퇴 시 지체 없이
          파기합니다. 다만 관계 법령에 따라 아래 기록은 정한 기간 동안 남고,
          회원 계정과의 연결만 끊어집니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>예약 기록: 5년 (전자상거래법, 계약 또는 청약철회)</li>
          <li>주문 기록: 5년 (전자상거래법, 대금결제와 재화 공급)</li>
          <li>문의 등 불만·분쟁 처리 기록: 3년 (전자상거래법)</li>
        </ul>
        <p className="text-caption text-muted">
          {member.email} 계정을 탈퇴합니다. 이 화면에서 한 번 더 확인한 뒤
          진행해 주세요.
        </p>
      </div>
      <WithdrawForm />
    </section>
  );
}
