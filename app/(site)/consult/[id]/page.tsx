import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Phone, Store } from "lucide-react";
import { Suspense } from "react";
import { getCounselor } from "@/lib/data/counselors";
import { PhotoPlaceholder } from "@/components/counselor/photo-placeholder";
import { ProductCard } from "@/components/counselor/product-card";
import { ConsultSteps } from "@/components/counselor/consult-steps";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { SectionTitle } from "@/components/ui/section-title";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  return { title: `${counselor.name} 선생님 | 쪽집게천사` };
}
export default function CounselorPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <CounselorContent params={params} />
    </Suspense>
  );
}
async function CounselorContent({ params }: Props) {
  const counselor = await getCounselor((await params).id);
  if (!counselor) notFound();
  const bookingHref = `/consult/${counselor.id}/book`;
  return (
    <div className="px-4 pt-3 md:px-6">
      <Link
        href="/consult"
        className="inline-flex min-h-11 items-center text-sm text-muted"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        상담사 목록
      </Link>
      <div className="space-y-7 md:space-y-9">
        <section className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-6">
          <PhotoPlaceholder className="aspect-square w-full" />
          <div>
            <h1 className="text-xl font-bold md:text-2xl">
              {counselor.name}{" "}
              <span className="text-sm font-medium">선생님</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-1">
              {counselor.tags.map((tag, index) => (
                <Chip key={tag} primary={index === 0}>
                  {tag}
                </Chip>
              ))}
            </div>
            <Badge icon={Store} className="mt-4 px-3">
              {counselor.storeName} 상담사
            </Badge>
            <Button href={bookingHref} className="mt-5 w-full gap-2">
              <Phone size={18} aria-hidden="true" />
              전화 상담 예약하기
            </Button>
          </div>
        </section>
        <section>
          <SectionTitle title="상담사 소개" />
          <p className="leading-relaxed">{counselor.description}</p>
        </section>
        <section>
          <SectionTitle title="상담 상품" />
          <ul className="grid gap-2 md:grid-cols-2 md:gap-3">
            {counselor.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                bookingHref={`${bookingHref}?product=${product.id}`}
              />
            ))}
          </ul>
        </section>
        <section>
          <SectionTitle title="전화상담은 이렇게 진행돼요" />
          <ConsultSteps />
        </section>
        <Button href={bookingHref} className="w-full gap-2">
          <Phone size={18} aria-hidden="true" />
          전화 상담 예약하기
        </Button>
      </div>
    </div>
  );
}
