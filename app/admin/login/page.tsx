import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { getAdmin } from "@/lib/admin/auth";
import { getAdminNext } from "@/lib/admin/rules";

export const instant = false;

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default function AdminLoginPage(props: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-7 md:px-6 md:py-9">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-4 md:p-6">
        <h1 className="mb-7 text-2xl font-extrabold text-brand md:text-3xl">
          쪽집게천사 관리자
        </h1>
        <Suspense
          fallback={<p role="status">로그인 상태를 확인하고 있어요.</p>}
        >
          <LoginContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginContent({ searchParams }: Props) {
  if (await getAdmin()) redirect("/admin");
  const { next } = await searchParams;
  return <LoginForm next={getAdminNext(next)} />;
}
