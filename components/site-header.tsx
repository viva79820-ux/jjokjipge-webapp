import Link from "next/link";
import { Sparkles } from "lucide-react";
import { siteConfig } from "@/lib/site-config";
import { TopTabs } from "@/components/top-tabs";
export function SiteHeader() {
  return (
    <header className="bg-background">
      <div className="border-b border-gold">
        <Link
          href="/"
          className="flex min-h-20 items-center justify-center gap-2 text-2xl font-extrabold text-brand md:text-3xl"
        >
          <Sparkles size={18} className="text-gold" aria-hidden="true" />
          {siteConfig.name}
          <Sparkles size={18} className="text-gold" aria-hidden="true" />
        </Link>
      </div>
      <TopTabs />
    </header>
  );
}
