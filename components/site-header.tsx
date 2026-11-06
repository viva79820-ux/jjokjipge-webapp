import Link from "next/link";
import { Sparkles } from "lucide-react";
import { TopTabs } from "@/components/top-tabs";
export function SiteHeader() {
  return (
    <header className="bg-background">
      <div className="border-b border-gold">
        <Link
          href="/"
          className="flex min-h-20 items-center justify-center gap-2 px-4 text-2xl font-extrabold text-brand md:text-3xl"
        >
          <Sparkles
            size={18}
            className="shrink-0 text-gold"
            aria-hidden="true"
          />
          <span className="min-w-0 text-center">쪽집게천사 타로샵</span>
          <Sparkles
            size={18}
            className="shrink-0 text-gold"
            aria-hidden="true"
          />
        </Link>
      </div>
      <TopTabs />
    </header>
  );
}
