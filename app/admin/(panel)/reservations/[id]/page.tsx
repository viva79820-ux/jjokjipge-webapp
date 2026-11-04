import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { AdminLoading } from "@/components/admin/reservation-cards";
import { ReservationControls } from "@/components/admin/reservation-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { getReservationDetail } from "@/lib/admin/reservations";
import {
  formatTime,
  safeReturn,
  statusLabels,
  type Search,
} from "@/lib/admin/reservation-rules";

export const instant = false;
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Search> };
export default function Page(props: Props) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Detail {...props} />
    </Suspense>
  );
}
async function Detail({ params, searchParams }: Props) {
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const { id } = await params;
  const row = await getReservationDetail(id);
  if (!row) notFound();
  const back = safeReturn((await searchParams).returnTo);
  const groups = [
    {
      title: "예약 정보",
      fields: [
        ["상담사", row.counselors?.name ?? "정보 없음"],
        ["근무 매장", row.counselors?.stores?.name ?? "정보 없음"],
        ["예약 당시 상품명", row.product_name],
        ["예약 당시 상담 시간", `${row.minutes}분`],
        ["상담 시작", formatTime(row.starts_at)],
        ["상담 종료", formatTime(row.ends_at)],
      ],
    },
    {
      title: "고객 정보",
      fields: [
        ["고객명", row.customer_name],
        ["전화번호", row.customer_phone],
        ["이메일", row.customer_email],
      ],
    },
    {
      title: "결제 정보",
      fields: [
        ["예약 당시 금액", `${row.price.toLocaleString("ko-KR")}원`],
        [
          "결제 방식",
          row.payment_method === "bank_transfer" ? "무통장입금" : "카드결제",
        ],
        ["입금자명", row.depositor_name ?? "기록 없음"],
      ],
    },
    {
      title: "처리 기록",
      fields: [
        ["접수 시각", formatTime(row.created_at)],
        ["확정 시각", formatTime(row.confirmed_at)],
        ["완료 시각", formatTime(row.completed_at)],
        ["취소 시각", formatTime(row.cancelled_at)],
        ["취소 사유", row.cancel_reason ?? "기록 없음"],
      ],
    },
  ];
  return (
    <div className="space-y-4">
      <Button href={back} variant="secondary">
        예약 목록으로
      </Button>
      <h1 className="text-xl font-bold">예약 상세</h1>
      <div className="flex flex-wrap items-center gap-3">
        <p className="break-all text-lg font-bold">{row.reservation_no}</p>
        <Badge>{statusLabels[row.status]}</Badge>
      </div>
      <p className="text-sm text-muted">
        모든 날짜와 시각은 한국 시간(Asia/Seoul) 기준입니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="min-w-0 rounded-card border border-border bg-surface p-3 md:p-4"
          >
            <h2 className="mb-3 text-lg font-bold">{group.title}</h2>
            <dl className="space-y-3">
              {group.fields.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="mt-1 break-all whitespace-pre-wrap">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <ReservationControls
        id={row.id}
        version={row.updated_at}
        status={row.status}
        reservationNo={row.reservation_no}
        bankTransfer={row.payment_method === "bank_transfer"}
      />
    </div>
  );
}
