import { Suspense } from "react";
import { connection } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Phone, Search } from "lucide-react";
import {
  AuthScreenHeader,
  AuthScreenMain,
} from "@/components/member-auth/auth-screen";
import { LoginForm } from "@/components/member-auth/login-form";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `로그인 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const guestLink = `inline-flex h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-label font-bold whitespace-nowrap ${focus}`;

export default function Page() {
  return (
    <>
      <AuthScreenHeader title="로그인" backHref="/" />
      <Suspense
        fallback={
          <p role="status" className="px-5 pt-7 text-body text-muted">
            로그인 상태를 확인하고 있어요.
          </p>
        }
      >
        <LoginContent />
      </Suspense>
    </>
  );
}

async function LoginContent() {
  await connection();
  if (await getMember()) redirect("/mypage");
  return (
    <AuthScreenMain className="pt-7">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <Image
          src="/images/brand/logo-angel-mark.png"
          alt=""
          width={592}
          height={450}
          priority
          className="h-auto w-23"
        />
        <h1 className="m-0 text-display font-extrabold">다시 오셨네요</h1>
        <p className="m-0 text-label text-muted">
          로그인하면 예약·상담 내역과 주문을
          <br />
          한곳에서 볼 수 있어요.
        </p>
      </div>
      <LoginForm />
      <section className="flex flex-col gap-2.5 rounded-card bg-brand-soft p-4">
        <h2 className="m-0 text-body font-extrabold text-brand-deep">
          회원이 아니어도 괜찮아요
        </h2>
        <p className="m-0 text-caption text-brand-deep">
          전화상담은 로그인 없이 예약할 수 있어요. 예약 내역은 예약번호로
          조회해요.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/consult"
            className={`${guestLink} bg-brand text-on-brand`}
          >
            <Phone size={16} aria-hidden="true" />
            비회원 예약
          </Link>
          <Link
            href="/booking/lookup"
            className={`${guestLink} border border-brand bg-surface text-brand`}
          >
            <Search size={16} aria-hidden="true" />
            예약 조회
          </Link>
        </div>
      </section>
    </AuthScreenMain>
  );
}
