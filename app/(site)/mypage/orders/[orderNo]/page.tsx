import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { MemberOrderDetailView } from "@/components/member-auth/order-detail";
import { getMemberOrder } from "@/lib/member-auth/orders";
import { getMember } from "@/lib/member-auth/session";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `주문 상세 | ${siteConfig.name}`,
  robots: { index: false, follow: false },
};

export default function Page({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  return (
    <div className="min-w-0 px-4 py-6 @3xl/app:px-6">
      <Suspense fallback={<p role="status">주문 내역을 확인하고 있어요.</p>}>
        <MemberOrderPage params={params} />
      </Suspense>
    </div>
  );
}

async function MemberOrderPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  await connection();
  const member = await getMember();
  if (!member) redirect("/login");
  const order = await getMemberOrder(member.id, (await params).orderNo);
  if (!order) notFound();
  return (
    <section key={order.id} className="mx-auto w-full max-w-md min-w-0">
      <MemberOrderDetailView order={order} />
    </section>
  );
}
