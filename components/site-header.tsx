import Link from "next/link";
import { siteConfig } from "@/lib/site-config";
import { TopTabs } from "@/components/top-tabs";
export function SiteHeader() {
  return (
    <header className="bg-background">
      <div className="border-b border-gold">
        <Link
          href="/"
          className="flex min-h-20 items-center justify-center font-serif text-[26px] font-bold text-brand"
        >
          {siteConfig.name}
        </Link>
      </div>
      <TopTabs />
    </header>
  );
}
