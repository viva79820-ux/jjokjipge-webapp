import { siteConfig } from "@/lib/site-config";
import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { TopTabs } from "@/components/top-tabs";

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function SiteHeader() {
  const [brandName, inkName = ""] = siteConfig.name.split(" ");
  return (
    <header data-site-header className="sticky top-0 z-30 bg-surface">
      <div className="flex h-15 items-center justify-between gap-2 px-4">
        <Link
          href="/"
          aria-label={`${siteConfig.name} 홈`}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 self-stretch ${focus}`}
        >
          <Image
            src="/images/brand/logo-angel-mark.png"
            alt=""
            width={592}
            height={450}
            priority
            className="h-8.5 w-auto shrink-0"
          />
          <span className="min-w-0 truncate text-logo font-extrabold tracking-tight">
            <span className="text-brand">{brandName}</span>
            {inkName ? (
              <>
                {" "}
                <span className="text-foreground">{inkName}</span>
              </>
            ) : null}
          </span>
        </Link>
        <Link
          href="/login"
          aria-label="로그인"
          className={`flex size-11 shrink-0 items-center justify-center text-foreground ${focus}`}
        >
          <UserRound size={24} aria-hidden="true" />
        </Link>
      </div>
      <TopTabs />
    </header>
  );
}
