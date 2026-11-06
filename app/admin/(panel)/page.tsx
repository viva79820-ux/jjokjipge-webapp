import { Suspense } from "react";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import {
  AdminLoading,
  ReservationCards,
} from "@/components/admin/reservation-cards";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboard } from "@/lib/admin/dashboard";

export const instant = false;

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const data = await getDashboard();
  if (!data) return <AdminAccessDenied />;
  return (
    <div className="space-y-7 md:space-y-9">
      <h1 className="text-xl font-bold">대시보드</h1>
      <p className="text-sm text-muted">
        모든 날짜와 시각은 한국 시간(Asia/Seoul) 기준입니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-bold">오늘 예약</h2>
          <p className="my-2 text-2xl font-bold">{data.daily}건</p>
          <Button
            variant="secondary"
            href={`/admin/reservations?from=${data.today}&to=${data.today}&exclude_cancelled=1`}
          >
            오늘 예약 보기
          </Button>
        </section>
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-bold">입금 대기</h2>
          <p className="my-2 text-2xl font-bold">{data.pending}건</p>
          <Button
            variant="secondary"
            href="/admin/reservations?status=pending_payment"
          >
            입금 대기 보기
          </Button>
        </section>
      </div>
      <section>
        <SectionTitle title="다가오는 상담 일정" />
        <ReservationCards rows={data.upcoming} compact />
      </section>
      <section>
        <SectionTitle title="최근 예약" />
        <ReservationCards rows={data.recent} compact />
      </section>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-bold">미답변 문의</h2>
        {data.unanswered === null ? (
          <p role="alert" className="my-2 text-error">
            미답변 문의 수를 불러오지 못했습니다. 다시 불러와 주세요.
          </p>
        ) : (
          <p className="my-2 text-2xl font-bold">
            미답변 문의 {data.unanswered}건
          </p>
        )}
        <Button
          variant="secondary"
          href="/admin/support/inquiries?status=pending"
        >
          미답변 문의 보기
        </Button>
      </section>
    </div>
  );
}
