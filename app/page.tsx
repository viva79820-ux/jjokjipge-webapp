import Link from "next/link";
import { Grid2X2, Layers, Sparkles, Store } from "lucide-react";
import { counselors } from "@/lib/dummy/counselors";
import { CounselorBanner } from "@/components/counselor/counselor-banner";
import { CounselorCarousel } from "@/components/counselor/counselor-carousel";
import { CounselorList } from "@/components/counselor/counselor-list";
import { SectionTitle } from "@/components/ui/section-title";
import { Button } from "@/components/ui/button";
const categories = [
  { label: "전체", href: "/consult", icon: Grid2X2 },
  { label: "타로", href: "/consult?type=tarot", icon: Layers },
  { label: "사주", href: "/consult?type=saju", icon: Sparkles },
  { label: "오프라인 매장", href: "/stores", icon: Store },
];
export default function Home() {
  const recommended = counselors.filter((c) => c.isRecommended);
  return (
    <div className="space-y-7 px-4 pt-4 md:space-y-9 md:px-6">
      <h1 className="sr-only">쪽집게천사 홈</h1>
      <CounselorBanner counselors={recommended} />
      <section aria-label="상담 카테고리" className="grid grid-cols-4 gap-2">
        {categories.map(({ label, href, icon: Icon }, index) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-card border border-gold px-1 text-center text-sm font-semibold ${index === 0 ? "bg-brand-deep text-on-brand" : "bg-surface text-foreground"}`}
          >
            <Icon
              size={28}
              className={`size-7 md:size-8 ${index === 0 ? "text-gold-light" : "text-brand"}`}
              aria-hidden="true"
            />
            {label}
          </Link>
        ))}
      </section>
      <section className="flex items-center justify-between gap-2 rounded-card bg-brand-soft p-3">
        <div className="min-w-0">
          <p className="font-bold">상담 후기가 궁금하신가요?</p>
          <p className="mt-1 text-caption text-muted md:text-sm">
            상담을 받은 분들의 후기를 확인해 보세요.
          </p>
        </div>
        <Button href="/reviews" className="shrink-0 whitespace-nowrap">
          후기 바로가기
        </Button>
      </section>
      <section>
        <SectionTitle title="추천 상담사" href="/consult" />
        <CounselorCarousel counselors={recommended} />
      </section>
      <section>
        <SectionTitle title="상담사 목록" />
        <CounselorList counselors={counselors} />
      </section>
    </div>
  );
}
