import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { OrderAdminLoading } from "@/components/admin/order-cards";
import { OrderControls } from "@/components/admin/order-controls";
import { OrderStatusBadge } from "@/components/order-lookup/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin/auth";
import { safeOrderReturn, type OrderSearch } from "@/lib/admin/order-rules";
import { getOrderDetail } from "@/lib/admin/orders";
import { formatTime } from "@/lib/admin/reservation-rules";
import { formatWon } from "@/lib/products/rules";

export const instant = false;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<OrderSearch>;
};

export default function Page(props: Props) {
  return (
    <Suspense fallback={<OrderAdminLoading />}>
      <Detail {...props} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: Props) {
  await connection();
  if (!(await requireAdmin())) return <AdminAccessDenied />;
  const { id } = await params;
  const row = await getOrderDetail(id);
  if (!row) notFound();
  const back = safeOrderReturn((await searchParams).returnTo);
  const groups = [
    {
      title: "고객 정보",
      fields: [
        ["주문자명", row.customer_name],
        ["전화번호", row.customer_phone],
        ["이메일", row.customer_email],
      ],
    },
    {
      title: "배송 정보",
      fields: [
        ["우편번호", row.postal_code],
        ["기본 주소", row.address_line1],
        ["상세 주소", row.address_line2 ?? "입력 없음"],
        ["송장번호", row.tracking_number ?? "입력 전"],
      ],
    },
    {
      title: "금액 정보",
      fields: [
        ["상품 금액", formatWon(row.subtotal)],
        ["배송비", formatWon(row.shipping_fee)],
        ["총 금액", formatWon(row.total)],
      ],
    },
    {
      title: "처리 기록",
      fields: [
        ["주문 접수", formatTime(row.created_at)],
        ["입금 확인", formatTime(row.payment_confirmed_at)],
        ["배송 시작", formatTime(row.shipped_at)],
        ["완료", formatTime(row.completed_at)],
        ["취소", formatTime(row.cancelled_at)],
      ],
    },
  ];
  return (
    <div className="space-y-4">
      <Button href={back} variant="secondary">
        주문 목록으로
      </Button>
      <h1 className="text-title font-bold">주문 상세</h1>
      <div className="flex flex-wrap items-center gap-3">
        <p className="break-all text-subtitle font-bold">{row.order_no}</p>
        <OrderStatusBadge status={row.status} />
      </div>
      <p className="text-sm text-muted">
        모든 날짜와 시각은 한국 시간(Asia/Seoul) 기준입니다.
      </p>
      <section
        aria-label="주문 상품"
        className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
      >
        <h2 className="mb-3 text-subtitle font-bold">주문 상품</h2>
        <ul className="space-y-3">
          {row.order_items.map((item) => (
            <li
              key={item.line_no}
              className="min-w-0 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <p className="font-semibold whitespace-pre-wrap wrap-anywhere">
                {item.product_name}
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatWon(item.unit_price)} × {item.quantity}개
              </p>
              <p className="mt-1 font-bold">{formatWon(item.line_total)}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-3 @3xl/app:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            aria-label={group.title}
            className="min-w-0 rounded-card border border-border bg-surface p-3 @3xl/app:p-4"
          >
            <h2 className="mb-3 text-subtitle font-bold">{group.title}</h2>
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
      <OrderControls
        id={row.id}
        version={row.updated_at}
        status={row.status}
        orderNo={row.order_no}
      />
    </div>
  );
}
